/**
 * POST /api/v1/ads/meta/campaigns/[id]/orcamento — troca o orçamento diário da campanha.
 *
 * Corpo: `{ "antes_cents": 12600, "depois_cents": 15100 }`. É o "Subir 20%" da decisão do dia e o
 * desfazer dele. A regra (gerenciar → conta conectada → orçamento é da campanha → é o valor que a
 * tela mostrava → subida até 20%) mora em `lib/plataformas-de-anuncio/meta/veiculacao-da-campanha.ts`.
 *
 * Piso `admin`, como pausar: mexe no dinheiro da empresa. Auditado com o antes e o depois — é esse
 * registro que a linha do tempo do painel lê, e que segura a próxima subida por 3 dias.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { lerCredencialDeLeitura } from "@/lib/plataformas-de-anuncio/credenciais-de-leitura";
import { listarContas } from "@/lib/plataformas-de-anuncio/meta/insights";
import { appDoMetaAds } from "@/lib/plataformas-de-anuncio/meta/login";
import { inspecionarToken } from "@/lib/plataformas-de-anuncio/meta/token";
import {
  gravarOrcamentoDaCampanha,
  lerCampanha,
  mudarOrcamentoDaCampanha,
  VeiculacaoError,
} from "@/lib/plataformas-de-anuncio/meta/veiculacao-da-campanha";
import { createAdminClient } from "@/lib/supabase/admin";

import { respostaSemConexao } from "../../../_falha";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const corpoSchema = z.object({
  antes_cents: z.number().int().positive(),
  depois_cents: z.number().int().positive().max(100_000_000),
});

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();

  const authz = await requireRole("admin", { requestId, resource: "ads_insights" });
  if (!authz.ok) return authz.response;
  const { org, user } = authz;

  const { id } = await params;
  if (!/^\d{1,25}$/.test(id)) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) return fail("validation_failed", "Orçamento inválido.", 422, { requestId, details: corpo.error.flatten() });

  const admin = createAdminClient();
  const credencial = await lerCredencialDeLeitura(admin, org.orgId, "meta_ads");
  if (!credencial.ok) return respostaSemConexao(credencial.motivo, { requestId });
  const token = credencial.credencial.accessToken;

  const app = await appDoMetaAds(org.orgId);
  if (!app) return fail("ads_nao_configurado", "O login de anúncios não está configurado nesta instalação.", 422, { requestId });

  try {
    const desfecho = await mudarOrcamentoDaCampanha(
      {
        inspecionar: async () => {
          const i = await inspecionarToken({ appId: app.appId, appSecret: app.appSecret, token });
          return { escopos: i.escopos, contasConcedidas: i.contasConcedidas };
        },
        contasAlcancadas: async () => {
          const contas = await listarContas(token, org.orgId);
          return contas.ok ? contas.dados.map((c) => c.id) : [];
        },
        lerCampanha: (campanhaId) => lerCampanha(token, campanhaId),
        gravarOrcamento: (campanhaId, cents) => gravarOrcamentoDaCampanha(token, campanhaId, cents),
      },
      { campanhaId: id, antesCents: corpo.data.antes_cents, depoisCents: corpo.data.depois_cents },
    );

    if (!desfecho.ok) {
      switch (desfecho.motivo) {
        case "sem_permissao_de_gerenciar":
          return fail(
            "ads_sem_permissao_de_gerenciar",
            "A conexão de anúncios só tem permissão de leitura. Reconecte em Configurações › Meta Ads e aceite a permissão de gerenciar anúncios.",
            422,
            { requestId },
          );
        case "campanha_de_outra_conta":
        case "campanha_nao_encontrada":
          return fail("not_found", "Campanha não encontrada nas contas conectadas.", 404, { requestId });
        case "orcamento_no_conjunto":
          return fail("ads_orcamento_no_conjunto", "O orçamento desta campanha está nos conjuntos de anúncios. Ajuste pelo Gerenciador.", 422, { requestId });
        case "orcamento_mudou":
          return fail("ads_orcamento_mudou", "O orçamento mudou desde que a tela foi carregada. Atualize e confira antes de mudar.", 409, { requestId });
        case "subida_acima_do_teto":
          return fail("ads_subida_acima_do_teto", "Cada subida vai até 20% do orçamento atual.", 422, { requestId });
        case "orcamento_abaixo_do_minimo":
          return fail("ads_orcamento_abaixo_do_minimo", "Orçamento diário abaixo do mínimo.", 422, { requestId });
        case "recusado":
          return fail("ads_recusado", `A Meta recusou a mudança: ${desfecho.detalhe ?? ""}`.trim(), 422, { requestId });
      }
    }

    void audit({
      action: "ad_campaign.orcamento_alterado",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "ad_campaign",
      resourceId: null,
      requestId,
      metadata: {
        platform: "meta_ads",
        campanha_id: desfecho.campanhaId,
        conta_id: desfecho.contaId,
        antes_cents: desfecho.antesCents,
        depois_cents: desfecho.depoisCents,
      },
    });
    return ok({ campanha_id: desfecho.campanhaId, antes_cents: desfecho.antesCents, depois_cents: desfecho.depoisCents }, { requestId });
  } catch (err) {
    logger.error("[ads.orcamento] a mudança do orçamento falhou", {
      requestId,
      onde: err instanceof VeiculacaoError ? err.onde : null,
      erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
    });
    return fail("upstream_unavailable", "Não consegui falar com a Meta agora. Tente de novo em instantes.", 502, { requestId });
  }
}
