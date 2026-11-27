/**
 * GET   /api/v1/settings/painel — as ligações do painel por funil da organização.
 * PATCH /api/v1/settings/painel — grava uma mudança (manager+).
 *
 * O painel separa as métricas por funil (`lib/resultado/funis.ts`). A organização grava em
 * `organizations.settings.painel`: o funil em que o painel abre, a que funil pertence cada produto vendido
 * por checkout de fora (que não diz de onde veio) e cada campanha de anúncio. Merge NÃO destrutivo do
 * jsonb, como `settings/campanhas`. Cada PATCH muda UMA coisa, e o audit diz qual.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { lerPainel, listarFunis, nomeComparavel } from "@/lib/resultado/funis";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const chave = z.string().regex(/^(agente|quiz|pagina):[\w-]{1,80}$/);

/** Uma mudança por vez; `funil: null` desliga a ligação. */
const corpoSchema = z.union([
  z.object({ funil_padrao: chave.nullable() }).strict(),
  z.object({ produto: z.object({ nome: z.string().trim().min(1).max(200), funil: chave.nullable() }).strict() }).strict(),
  z.object({ campanha: z.object({ id: z.string().regex(/^\d{1,40}$/), funil: chave.nullable() }).strict() }).strict(),
]);

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "dashboard_settings" });
  if (!authz.ok) return authz.response;

  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(lerPainel((data as { settings?: unknown } | null)?.settings), { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "dashboard_settings" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const mudanca = parsed.data;

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", erroLeitura.message, 500, { requestId });
  const settings = ((atual as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
  const painel = lerPainel(settings);

  // O funil escolhido precisa existir NESTA organização (agente vivo, quiz ou página dela).
  const destino = "funil_padrao" in mudanca ? mudanca.funil_padrao : "produto" in mudanca ? mudanca.produto.funil : mudanca.campanha.funil;
  if (destino) {
    try {
      const { funis } = await listarFunis(admin, authz.org.orgId, [destino]);
      const existe = funis.some((f) => f.chave === destino);
      if (!existe) return fail("validation_failed", t("Funil não encontrado."), 422, { requestId });
    } catch (e) {
      return fail("internal_error", (e as Error).message, 500, { requestId });
    }
  }

  const tirar = (m: Record<string, string>, k: string, v: string | null) => {
    const novo = { ...m };
    if (v) novo[k] = v;
    else delete novo[k];
    return novo;
  };
  const novo =
    "funil_padrao" in mudanca
      ? { ...painel, funil_padrao: mudanca.funil_padrao }
      : "produto" in mudanca
        ? { ...painel, produtos: tirar(painel.produtos, nomeComparavel(mudanca.produto.nome), mudanca.produto.funil) }
        : { ...painel, campanhas: tirar(painel.campanhas, mudanca.campanha.id, mudanca.campanha.funil) };

  const { error } = await admin
    .from("organizations")
    .update({ settings: { ...settings, painel: novo } })
    .eq("id", authz.org.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "org.dashboard_funnel_updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: mudanca as unknown as Record<string, unknown>,
  });

  return ok(novo, { requestId });
}
