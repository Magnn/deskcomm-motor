import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/channels/official/celular — "Pedir de novo" a agenda e o
 * histórico do aplicativo do celular (coexistência).
 *
 * Existe porque o pedido feito na conexão pode ser recusado por motivo
 * passageiro: em 16/10/2026 os dois voltaram `(#133010) Account not registered`
 * porque o número ainda não estava ativo na Cloud API naquele segundo. A Meta
 * aceita cada pedido uma vez e só nas 24 h seguintes à conexão — recusa não
 * gasta o pedido —, então pedir de novo dentro do prazo recupera os contatos
 * e as conversas sem desconectar o celular.
 *
 * Confere na Meta, antes, se o número está mesmo no aplicativo: pedir a agenda
 * de um número só da API seria recusado com um motivo que não ajuda ninguém.
 * O que já foi aceito não é pedido outra vez. Mesma guarda da aba: admin e
 * sessão viva.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";
import { estadoDoNumeroNaMeta } from "@/lib/channels/meta/cadastro-incorporado";
import {
  guardarEstadoDoCelular,
  lerEstadoDoCelular,
  prazoVencido,
  sincronizarCelular,
} from "@/lib/channels/meta/coexistencia";
import { escolherCanalOficial } from "@/lib/channels/meta/session";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COLUNAS = "id, meta_phone_number_id, meta_token_encrypted, status, created_at, metadata";

type Linha = {
  id: string;
  meta_phone_number_id: string | null;
  meta_token_encrypted: string | null;
  status: string | null;
  created_at: string | null;
  metadata: unknown;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_official_celular" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const admin = createAdminClient();
  // Com mais de um número oficial, o corpo diz QUAL; sem ele vale o da aba.
  const corpo = (await req.json().catch(() => null)) as { channel_session_id?: unknown } | null;
  const escolhido = typeof corpo?.channel_session_id === "string" ? corpo.channel_session_id : null;
  const consultar = () => {
    const q = admin
      .from("channel_sessions")
      .select(COLUNAS)
      .eq("organization_id", orgId)
      .eq("provider", CHANNEL_PROVIDER_META)
      .limit(50);
    return escolhido ? q.eq("id", escolhido) : q;
  };
  const { data } = await queryTolerantToMissingArchived(
    () => consultar().is(ARCHIVED_AT, null),
    () => consultar(),
  );
  const sessao = escolherCanalOficial((data ?? []) as Linha[]);
  if (!sessao || !sessao.meta_phone_number_id || !sessao.meta_token_encrypted) {
    return fail("invalid_request", "no_meta_channel", 422, { requestId });
  }

  const anterior = lerEstadoDoCelular(sessao.metadata);
  if (anterior && anterior.agenda !== "falhou" && anterior.historico !== "falhou") {
    return ok({ ...anterior, prazoVencido: prazoVencido(anterior), jaFeito: true });
  }
  if (prazoVencido(anterior)) {
    return fail(
      "invalid_request",
      t("Passaram as 24 horas que a Meta dá para pedir a agenda e o histórico. Para trazê-los, desconecte o número pelo aplicativo do celular e conecte de novo."),
      422,
      { requestId },
    );
  }

  const token = await decryptWebhookSecret(admin, sessao.meta_token_encrypted);
  if (!token) return fail("internal_error", "token_indisponivel", 500, { requestId });

  const numero = await estadoDoNumeroNaMeta({ phoneNumberId: sessao.meta_phone_number_id, token });
  if (!numero.ok) {
    return fail("invalid_request", `${t("A Meta não respondeu sobre este número:")} ${numero.motivo}`, 422, { requestId });
  }
  if (!numero.noAplicativo) {
    return fail(
      "invalid_request",
      t("Este número não está no aplicativo WhatsApp Business do celular — não há agenda nem histórico para trazer."),
      422,
      { requestId },
    );
  }

  const estado = await sincronizarCelular(
    { phoneNumberId: sessao.meta_phone_number_id, token },
    { anterior },
  );
  await guardarEstadoDoCelular(admin, orgId, sessao.id, estado);

  // 200 mesmo com recusa: o desfecho é um estado, e a tela mostra o motivo.
  return ok({ ...estado, prazoVencido: prazoVencido(estado), jaFeito: false });
}
