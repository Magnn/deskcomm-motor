/**
 * GET /api/v1/ads/resultado-por-anuncio — o funil por anúncio com o gasto ao lado.
 *
 * O funil vem do banco (`fn_resultado_por_anuncio`, migration 0922): quem entrou no período por
 * cada anúncio, e o que aconteceu com essas pessoas. O gasto vem da plataforma, lido pelo id do
 * anúncio. Sem conexão de leitura a rota AINDA responde — o funil não depende dela —, com o gasto
 * desconhecido e o aviso dizendo por quê.
 *
 * Auth: sessão, `manager` para cima (mesmo grau da tela de campanhas: custo é da empresa inteira).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { anunciosParaLerGasto, montarResultadoPorAnuncio, type FunilDoAnuncio, type GastoDoAnuncio } from "@/lib/anuncio/resultado-por-anuncio";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { lerCredencialDeLeitura } from "@/lib/plataformas-de-anuncio/credenciais-de-leitura";
import { lerGastoPorAnuncio } from "@/lib/plataformas-de-anuncio/meta/insights";
import { diaNoFuso, lerFusoDaOrganizacao } from "@/lib/resultado/periodo";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  from: z.string().regex(DATA).optional(),
  to: z.string().regex(DATA).optional(),
});

/** Quantos anúncios, no máximo, são perguntados um a um depois da leitura pelas contas. */
const TETO_DE_LEITURAS = 60;
const DIA_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ads_insights" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org } = authz;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return fail("validation_failed", t("Parâmetros inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }

  const admin = createAdminClient();
  // O dia é o da ORGANIZAÇÃO: "hoje" em UTC, à noite no Brasil, já é amanhã.
  const fuso = await lerFusoDaOrganizacao(admin, org.orgId);
  const agora = new Date();
  const ate = parsed.data.to ?? diaNoFuso(agora, fuso);
  const de = parsed.data.from ?? diaNoFuso(new Date(agora.getTime() - 6 * DIA_MS), fuso);
  if (de > ate) return fail("validation_failed", t("O início do período vem depois do fim."), 422, { requestId });

  // O recorte do banco é por instante; o dia inteiro do fim entra (folga de um dia cobre qualquer fuso).
  const { data, error } = await admin.rpc("fn_resultado_por_anuncio", {
    p_org: org.orgId,
    p_de: new Date(`${de}T00:00:00Z`).toISOString(),
    p_ate: new Date(new Date(`${ate}T00:00:00Z`).getTime() + 2 * DIA_MS).toISOString(),
  });
  if (error) return fail("internal_error", t("Erro ao montar o resultado por anúncio."), 500, { requestId });
  const funil = (data ?? []) as unknown as FunilDoAnuncio[];

  const avisos: string[] = [];
  let gastos = new Map<string, GastoDoAnuncio>();
  const credencial = await lerCredencialDeLeitura(admin, org.orgId, "meta_ads");
  if (!credencial.ok) {
    avisos.push(t("Sem conexão de leitura com a conta de anúncios: o funil está completo, mas o gasto não foi lido."));
  } else {
    // Todos os anúncios, na ordem dos que mais trouxeram gente: a leitura pelas contas cobre a
    // maioria de uma vez, e o teto só limita o que sobrar para perguntar um a um.
    const alvos = anunciosParaLerGasto(funil, Number.MAX_SAFE_INTEGER);
    const lido = await lerGastoPorAnuncio(credencial.credencial.accessToken, alvos, de, ate, TETO_DE_LEITURAS);
    gastos = lido.gastos;
    if (lido.naoConsultados > 0) {
      avisos.push(`${lido.naoConsultados} ${t("anúncios ficaram sem consulta de gasto nesta leitura: são os que menos trouxeram gente. Um período menor alcança todos.")}`);
    }
    if (lido.semLeitura > 0) {
      avisos.push(`${lido.semLeitura} ${t("anúncios não tiveram o gasto lido: a conexão não alcança a conta deles, ou a plataforma recusou a leitura.")}`);
    }
  }

  const resultado = montarResultadoPorAnuncio(funil, gastos);
  return ok(
    { ...resultado, periodo: { from: de, to: ate }, lido_em: new Date().toISOString(), avisos },
    { requestId },
  );
}
