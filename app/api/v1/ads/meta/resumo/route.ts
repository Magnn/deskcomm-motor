/**
 * GET /api/v1/ads/meta/resumo — o topo da tela de Meta Ads: gasto, vendas, retorno, o que está
 * rodando e os anúncios que mais vendem, no período e no período anterior de mesmo tamanho.
 *
 * Plataforma: campanhas (estado) + anúncios da conta nos dois períodos + miniaturas dos campeões.
 * Banco: `fn_resultado_por_anuncio` nos dois períodos. O cruzamento é puro, em
 * `lib/anuncio/resumo-da-conta.ts`.
 *
 * Desde o painel de tráfego, também: a decisão do dia (`lib/anuncio/decisao-do-dia.ts`), as mudanças
 * feitas pelo painel (audit log), a capacidade dos números hoje e a nota do pixel. As três últimas são
 * sinais: falha de leitura vira `null` e o resto da tela sai igual.
 *
 * Read-only ⇒ sem audit. Piso `manager`, mesmo das outras rotas de anúncio.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import type { FunilDoAnuncio } from "@/lib/anuncio/resultado-por-anuncio";
import { capacidadeDeHoje } from "@/lib/anuncio/capacidade-de-hoje";
import { decisaoDoDia, type MudancaNaCampanha } from "@/lib/anuncio/decisao-do-dia";
import { montarResumoDaConta, periodoAnterior } from "@/lib/anuncio/resumo-da-conta";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerCredencial } from "@/lib/plataformas-de-anuncio/credenciais";
import { lerCredencialDeLeitura } from "@/lib/plataformas-de-anuncio/credenciais-de-leitura";
import { lerNotaDoConjunto } from "@/lib/plataformas-de-anuncio/meta/qualidade-do-conjunto";
import { lerAnunciosDaConta, lerCampanhas, lerMiniaturas } from "@/lib/plataformas-de-anuncio/meta/insights";
import { createAdminClient } from "@/lib/supabase/admin";

import { respostaDeFalha, respostaSemConexao } from "../_falha";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 24 * 60 * 60 * 1000;

const querySchema = z
  .object({
    account_id: z.string().regex(/^act_\d+$/, "conta no formato act_<id>"),
    from: z.string().regex(DATA, "data no formato AAAA-MM-DD"),
    to: z.string().regex(DATA, "data no formato AAAA-MM-DD"),
    /** Moeda da conta (o seletor já sabe): a decisão só sai em real, como o veredito. */
    moeda: z.string().regex(/^[A-Z]{3}$/).optional(),
  })
  .refine((v) => v.from <= v.to, { message: "o início do período não pode ser depois do fim", path: ["from"] });

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ads_insights" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return fail("validation_failed", "Parâmetros inválidos.", 422, { requestId, details: parsed.error.flatten() });
  }
  const { account_id: contaId, from: de, to: ate, moeda = "BRL" } = parsed.data;
  const antes = periodoAnterior(de, ate);

  const admin = createAdminClient();
  const credencial = await lerCredencialDeLeitura(admin, org.orgId, "meta_ads");
  if (!credencial.ok) return respostaSemConexao(credencial.motivo, { requestId });
  const token = credencial.credencial.accessToken;

  // O funil recorta por instante; o dia inteiro do fim entra (folga de um dia cobre qualquer fuso),
  // como em `resultado-por-anuncio`.
  const funilDo = async (inicio: string, fim: string) => {
    const { data, error } = await admin.rpc("fn_resultado_por_anuncio", {
      p_org: org.orgId,
      p_de: new Date(`${inicio}T00:00:00Z`).toISOString(),
      p_ate: new Date(new Date(`${fim}T00:00:00Z`).getTime() + 2 * DIA_MS).toISOString(),
    });
    return error ? null : ((data ?? []) as unknown as FunilDoAnuncio[]);
  };

  const [campanhas, anuncios, anunciosAnteriores, funil, funilAnterior, mudancas, capacidade, pixel] = await Promise.all([
    lerCampanhas(token, contaId),
    lerAnunciosDaConta(token, contaId, de, ate),
    lerAnunciosDaConta(token, contaId, antes.de, antes.ate),
    funilDo(de, ate),
    funilDo(antes.de, antes.ate),
    mudancasDoPainel(admin, org.orgId),
    capacidadeDeHoje(admin, org.orgId).catch(() => null),
    notaDoPixel(admin, org.orgId),
  ]);

  if (!campanhas.ok) return respostaDeFalha(campanhas.falha, campanhas.detalhe, { requestId });
  if (!anuncios.ok) return respostaDeFalha(anuncios.falha, anuncios.detalhe, { requestId });
  if (!anunciosAnteriores.ok) return respostaDeFalha(anunciosAnteriores.falha, anunciosAnteriores.detalhe, { requestId });
  if (funil === null || funilAnterior === null) {
    return fail("internal_error", "Erro ao ler as vendas por anúncio.", 500, { requestId });
  }

  const resumo = montarResumoDaConta({
    anuncios: anuncios.dados,
    anunciosAnteriores: anunciosAnteriores.dados,
    funil,
    funilAnterior,
    campanhas: campanhas.dados
      .filter((c): c is typeof c & { id: string } => Boolean(c.id))
      .map((c) => ({
        id: c.id,
        nome: c.name ?? c.id,
        veiculacao: c.effective_status ?? null,
        orcamentoDiarioCents: Number(c.daily_budget) > 0 ? Number(c.daily_budget) : null,
      })),
  });
  const decisao = decisaoDoDia({ rodando: resumo.rodando, mudancas, moeda });
  const miniaturas = await lerMiniaturas(token, resumo.campeoes.map((c) => c.adId));

  return ok(
    {
      ...resumo,
      campeoes: resumo.campeoes.map((c) => ({ ...c, miniatura: miniaturas.get(c.adId) ?? null })),
      decisao,
      mudancas,
      capacidade,
      pixel,
      periodo: { from: de, to: ate },
      periodo_anterior: { from: antes.de, to: antes.ate },
      account_id: contaId,
      lido_em: new Date().toISOString(),
    },
    { requestId },
  );
}

const ACOES_DO_PAINEL = ["ad_campaign.veiculacao_alterada", "ad_campaign.orcamento_alterado"];

/** O que foi mudado pelo painel nos últimos 14 dias (audit log). Falha → lista vazia. */
async function mudancasDoPainel(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<MudancaNaCampanha[]> {
  const { data, error } = await admin
    .from("api_audit_log")
    .select("action, metadata, created_at")
    .eq("organization_id", orgId)
    .in("action", ACOES_DO_PAINEL)
    .gte("created_at", new Date(Date.now() - 14 * DIA_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return ((data ?? []) as Array<{ action: string; metadata: Record<string, unknown> | null; created_at: string }>)
    .filter((l) => typeof l.metadata?.campanha_id === "string")
    .map((l) => ({
      campanhaId: l.metadata?.campanha_id as string,
      quando: l.created_at,
      tipo: l.action === "ad_campaign.orcamento_alterado" ? ("orcamento" as const) : ("veiculacao" as const),
      antesCents: typeof l.metadata?.antes_cents === "number" ? l.metadata.antes_cents : null,
      depoisCents: typeof l.metadata?.depois_cents === "number" ? l.metadata.depois_cents : null,
      status: typeof l.metadata?.status === "string" ? l.metadata.status : null,
    }));
}

/** A nota do pixel do conjunto que recebe as conversões desta organização; sem conexão de envio, `null`. */
async function notaDoPixel(admin: ReturnType<typeof createAdminClient>, orgId: string) {
  const envio = await lerCredencial(admin, orgId, "meta_ads").catch(() => null);
  if (!envio?.ok) return null;
  return lerNotaDoConjunto(envio.credencial.accessToken, envio.credencial.datasetId);
}
