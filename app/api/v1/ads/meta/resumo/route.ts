/**
 * GET /api/v1/ads/meta/resumo — o topo da tela de Meta Ads: gasto, vendas, retorno, o que está
 * rodando e os anúncios que mais vendem, no período e no período anterior de mesmo tamanho.
 *
 * Plataforma: campanhas (estado) + anúncios da conta nos dois períodos + miniaturas dos campeões.
 * Banco: `fn_resultado_por_anuncio` nos dois períodos. O cruzamento é puro, em
 * `lib/anuncio/resumo-da-conta.ts`.
 *
 * Read-only ⇒ sem audit. Piso `manager`, mesmo das outras rotas de anúncio.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import type { FunilDoAnuncio } from "@/lib/anuncio/resultado-por-anuncio";
import { montarResumoDaConta, periodoAnterior } from "@/lib/anuncio/resumo-da-conta";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerCredencialDeLeitura } from "@/lib/plataformas-de-anuncio/credenciais-de-leitura";
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
  const { account_id: contaId, from: de, to: ate } = parsed.data;
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

  const [campanhas, anuncios, anunciosAnteriores, funil, funilAnterior] = await Promise.all([
    lerCampanhas(token, contaId),
    lerAnunciosDaConta(token, contaId, de, ate),
    lerAnunciosDaConta(token, contaId, antes.de, antes.ate),
    funilDo(de, ate),
    funilDo(antes.de, antes.ate),
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
      .map((c) => ({ id: c.id, nome: c.name ?? c.id, veiculacao: c.effective_status ?? null })),
  });
  const miniaturas = await lerMiniaturas(token, resumo.campeoes.map((c) => c.adId));

  return ok(
    {
      ...resumo,
      campeoes: resumo.campeoes.map((c) => ({ ...c, miniatura: miniaturas.get(c.adId) ?? null })),
      periodo: { from: de, to: ate },
      periodo_anterior: { from: antes.de, to: antes.ate },
      account_id: contaId,
      lido_em: new Date().toISOString(),
    },
    { requestId },
  );
}
