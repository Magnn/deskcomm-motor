/**
 * GET  /api/v1/channels/link-de-cadastro — a instalação oferece o canal? e os
 *      números já conectados por ele nesta organização.
 * POST /api/v1/channels/link-de-cadastro
 *   { acao: "iniciar", coexistencia } → { url } do link de cadastro hospedado;
 *   { acao: "concluir", estado, phone_number_id | erro } → a volta, entregue
 *     pela tela depois da ponte de `/auth/link-return/…`.
 *
 * Não sabe com quem fala: o fluxo mora em `lib/channels/cadastro-por-link/conexao.ts`.
 * Aqui só as guardas (dono, verificação em duas etapas, limite) e a auditoria.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { marcaDaSaida } from "@/lib/branding/saida";
import { ErroDaConexaoUmClique, type ContextoDaConexao } from "@/lib/channels/conexao-um-clique";
import {
  ROTULO_DO_LINK_DE_CADASTRO,
  concluirLinkDeCadastro,
  iniciarLinkDeCadastro,
  linkDeCadastroDisponivel,
  numerosDoLinkDeCadastro,
} from "@/lib/channels/cadastro-por-link/conexao";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { basePublicaConfiguradaDaInstalacao } from "@/lib/webhooks/url-publica";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

const corpoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("iniciar"), coexistencia: z.boolean() }).strict(),
  z
    .object({
      acao: z.literal("concluir"),
      estado: z.string().min(20).max(700),
      phone_number_id: z.string().regex(/^[0-9]{5,30}$/).optional(),
      erro: z.string().regex(/^[a-z_]{1,60}$/).optional(),
    })
    .strict(),
]);

export async function GET(): Promise<NextResponse> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_partner" });
  if (!authz.ok) return authz.response;
  if (!(await linkDeCadastroDisponivel())) {
    return ok({ disponivel: false, label: ROTULO_DO_LINK_DE_CADASTRO, numeros: [] }, { requestId, headers });
  }
  const sessoes = await numerosDoLinkDeCadastro(createAdminClient(), authz.org.orgId);
  return ok(
    {
      disponivel: true,
      label: ROTULO_DO_LINK_DE_CADASTRO,
      numeros: sessoes
        .filter((s) => !s.archivedAt)
        .map((s) => ({
          channel_session_id: s.id,
          phone_number: s.phoneNumber,
          display_name: s.displayName,
          status: s.status,
          webhook_automatico: s.webhookId !== null,
        })),
    },
    { requestId, headers },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_partner" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  if (await mfaEmDivida()) {
    return fail("mfa_required", t("Confirme a verificação em duas etapas."), 403, { requestId, headers });
  }
  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os dados da conexão."), 400, { requestId, headers });
  }
  const orgId = authz.org.orgId;
  const limite = await checkRateLimit(`link-de-cadastro:${orgId}`, 20, 60);
  if (!limite.allowed) {
    return fail("rate_limited", t("Aguarde um minuto antes de tentar novamente."), 429, {
      requestId,
      headers: { ...headers, "Retry-After": "60" },
    });
  }

  // A volta e o webhook apontam para a instalação: o endereço vem só da
  // configuração dela, nunca de quem fez o pedido.
  const publicBase = basePublicaConfiguradaDaInstalacao({ aceitarMaquinaLocal: false });
  if (!publicBase) {
    return fail(
      "base_publica_nao_configurada",
      t("O endereço público desta instalação não está configurado. Quem administra a instalação precisa definir NEXT_PUBLIC_APP_URL com o endereço pelo qual ela é acessada."),
      503,
      { requestId, headers },
    );
  }

  const admin = createAdminClient();
  const ctx: ContextoDaConexao = {
    organizationId: orgId,
    organizationNome: authz.org.name,
    userId: authz.user.id,
    idioma: authz.user.idioma,
    segredo: env.INTERNAL_SECRET,
    agora: new Date(),
    publicBase,
  };
  const corpo = parsed.data;

  try {
    if (corpo.acao === "iniciar") {
      const marca = await marcaDaSaida(orgId);
      const { url } = await iniciarLinkDeCadastro(admin, ctx, { coexistencia: corpo.coexistencia, cor: marca.accent });
      return ok({ url }, { requestId, headers });
    }
    const c = await concluirLinkDeCadastro(admin, { ...ctx, requestId }, {
      estado: corpo.estado,
      phoneNumberId: corpo.phone_number_id,
      erro: corpo.erro,
    });
    void audit({
      action: "channel.connected",
      actorUserId: ctx.userId,
      organizationId: ctx.organizationId,
      resourceType: "channel_session",
      resourceId: c.channelSessionId,
      requestId,
      metadata: { origem: "link_de_cadastro", webhook_automatico: c.webhookRegistrado },
    });
    return ok(
      {
        connected: true,
        channel_session_id: c.channelSessionId,
        phone_number: c.phoneNumber,
        display_name: c.displayName,
        webhook_automatico: c.webhookRegistrado,
      },
      { requestId, headers },
    );
  } catch (erro) {
    if (erro instanceof ErroDaConexaoUmClique) {
      return fail(erro.code, t(erro.message), erro.status, { requestId, headers, details: erro.details });
    }
    logger.warn("[channels.link-de-cadastro] conexão não concluída", {
      organization_id: orgId,
      acao: corpo.acao,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return fail("upstream_unavailable", t("Não foi possível concluir a conexão. Tente novamente."), 502, {
      requestId,
      headers,
    });
  }
}
