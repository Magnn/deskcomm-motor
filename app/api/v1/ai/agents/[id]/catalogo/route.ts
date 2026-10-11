import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET /api/v1/ai/agents/:id/catalogo (manager+) — o catálogo do agente: o que ele vende a quem já comprou.
 * PUT /api/v1/ai/agents/:id/catalogo (admin)    — grava (`ai_agents.config.catalog`).
 *
 * Vale no PRÓXIMO turno, sem publicar versão (o mesmo desenho das abas Preço e Oferta), e por isso é
 * decisão de admin. A rota genérica de PATCH do agente não escreve esta chave, então este é o único
 * caminho e o único que valida.
 *
 * ─── O que o GET devolve além do que foi salvo ──────────────────────────────────────────────────
 * `faltas`: por produto, o que falta para ele poder ser oferecido (`oQueFaltaNoProduto`). É a MESMA
 * regra que o turno aplica — a tela mostra "falta o fluxo de entrega" exatamente para os produtos que
 * a agente não vai oferecer, e por nenhum outro motivo.
 *
 * ─── O piso ─────────────────────────────────────────────────────────────────────────────────────
 * A trava de promessas veta mensagem que cite valor abaixo do piso da organização. Um produto do
 * catálogo mais barato que o piso seria vetado em silêncio; o PUT desce o piso até ele ANTES de
 * salvar, e não salva se a trava não aceitar — o mesmo contrato da rota de preço.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { produtosComFluxoDeEntregaPelaApi } from "@/lib/catalogo/fluxos-de-entrega";
import { oQueFaltaNoProduto, type FaltaNoProduto } from "@/lib/catalogo/oferta-da-vez";
import { catalogoSchema, menorPrecoDoCatalogo, type CatalogoConfig } from "@/lib/catalogo/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { garantirPisoAte, sincronizarPiso } from "@/lib/preco/sincronizar-piso";
import { lerPricing } from "@/lib/preco/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

/** Uma posição por produto, na ordem do catálogo. `null` = completo. */
function faltasDoCatalogo(catalogo: CatalogoConfig | null, produtosComFluxo: readonly string[]): (FaltaNoProduto | null)[] {
  return (catalogo?.produtos ?? []).map((p) => oQueFaltaNoProduto(p, produtosComFluxo));
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("manager", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const admin = createAdminClient();
  const { data: agente } = await admin
    .from("ai_agents")
    .select("id, config")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!agente) return fail("not_found", t("Agent não encontrado."), 404, { requestId });

  // Aqui, ao contrário do que o turno lê, o `enabled: false` também volta: a tela precisa mostrar o que
  // o dono preencheu mesmo com o catálogo desligado.
  const bruto = (agente.config as { catalog?: unknown } | null)?.catalog ?? null;
  const lido = catalogoSchema.safeParse(bruto);
  const catalog = lido.success ? lido.data : null;
  const faltas = faltasDoCatalogo(catalog, await produtosComFluxoDeEntregaPelaApi(admin, authz.org.orgId));
  return ok({ catalog, faltas }, { requestId });
}

export async function PUT(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("admin", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = catalogoSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const catalog = parsed.data;

  const admin = createAdminClient();
  const { data: agente } = await admin
    .from("ai_agents")
    .select("id, config, archived_at")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!agente) return fail("not_found", t("Agent não encontrado."), 404, { requestId });
  if (agente.archived_at) return fail("state_conflict", "Agent arquivado.", 409, { requestId });

  const menor = menorPrecoDoCatalogo(catalog);
  if (menor !== null) {
    try {
      const pricing = lerPricing(agente.config);
      if (pricing !== null) await sincronizarPiso(admin, org.orgId, pricing, menor);
      else await garantirPisoAte(admin, org.orgId, menor);
    } catch {
      return fail(
        "guardrail_sync_failed",
        t("Não consegui ligar a trava do valor mínimo. Nada foi salvo — tente de novo."),
        500,
        { requestId },
      );
    }
  }

  const atual = (agente.config ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("ai_agents")
    .update({ config: { ...atual, catalog }, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.orgId);
  if (error) return fail("internal_error", "Erro ao salvar o catálogo.", 500, { requestId });

  await audit({
    action: "ai.catalog_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_agent",
    resourceId: id,
    requestId,
    // Só o formato: quantos produtos, quantos ativos, o menor valor. Nome, texto e link ficam de fora.
    metadata: {
      enabled: catalog.enabled,
      produtos: catalog.produtos.length,
      ativos: catalog.produtos.filter((p) => p.ativo).length,
      na_conversa: catalog.produtos.filter((p) => p.entrega === "conversa").length,
      menor_preco_cents: menor,
    },
  });

  const faltas = faltasDoCatalogo(catalog, await produtosComFluxoDeEntregaPelaApi(admin, org.orgId));
  return ok({ catalog, faltas }, { requestId });
}
