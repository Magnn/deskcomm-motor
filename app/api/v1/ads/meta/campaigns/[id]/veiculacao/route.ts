/**
 * POST /api/v1/ads/meta/campaigns/[id]/veiculacao — pausa ou reativa a campanha.
 *
 * Corpo: `{ "status": "PAUSED" | "ACTIVE" }`. A regra e a ordem (permissão de
 * gerenciar → campanha de conta conectada → mudança) moram em
 * `lib/plataformas-de-anuncio/meta/veiculacao-da-campanha.ts`.
 *
 * Piso `admin`, não `manager`: ler gasto é dado comercial, mas PARAR uma campanha
 * mexe no dinheiro e no faturamento da empresa — a mesma porta de quem conecta a
 * conta. Auditado com o antes e o depois; o token nunca entra no registro.
 *
 * Org da org ativa (cookie validado), NUNCA do corpo. O id da campanha vem do
 * caminho e só é aceito se a campanha for de uma conta concedida ao token.
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
  gravarStatusDaCampanha,
  lerCampanha,
  mudarVeiculacaoDaCampanha,
  VeiculacaoError,
} from "@/lib/plataformas-de-anuncio/meta/veiculacao-da-campanha";
import { createAdminClient } from "@/lib/supabase/admin";

import { respostaSemConexao } from "../../../_falha";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const corpoSchema = z.object({ status: z.enum(["PAUSED", "ACTIVE"]) });

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
  if (!corpo.success) return fail("validation_failed", "Status inválido.", 422, { requestId, details: corpo.error.flatten() });

  const admin = createAdminClient();
  const credencial = await lerCredencialDeLeitura(admin, org.orgId, "meta_ads");
  if (!credencial.ok) return respostaSemConexao(credencial.motivo, { requestId });
  const token = credencial.credencial.accessToken;

  const app = await appDoMetaAds(org.orgId);
  if (!app) return fail("ads_nao_configurado", "O login de anúncios não está configurado nesta instalação.", 422, { requestId });

  try {
    const desfecho = await mudarVeiculacaoDaCampanha(
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
        gravarStatus: (campanhaId, status) => gravarStatusDaCampanha(token, campanhaId, status),
      },
      { campanhaId: id, status: corpo.data.status },
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
        case "recusado":
          return fail("ads_recusado", `A Meta recusou a mudança: ${desfecho.detalhe ?? ""}`.trim(), 422, { requestId });
      }
    }

    void audit({
      action: "ad_campaign.veiculacao_alterada",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "ad_campaign",
      resourceId: null,
      requestId,
      metadata: { platform: "meta_ads", campanha_id: desfecho.campanhaId, conta_id: desfecho.contaId, status: desfecho.status },
    });
    return ok({ campanha_id: desfecho.campanhaId, status: desfecho.status }, { requestId });
  } catch (err) {
    logger.error("[ads.veiculacao] a mudança da campanha falhou", {
      requestId,
      onde: err instanceof VeiculacaoError ? err.onde : null,
      erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
    });
    return fail("upstream_unavailable", "Não consegui falar com a Meta agora. Tente de novo em instantes.", 502, { requestId });
  }
}
