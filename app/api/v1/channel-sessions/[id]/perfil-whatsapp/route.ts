/**
 * /api/v1/channel-sessions/[id]/perfil-whatsapp — o perfil do número OFICIAL,
 * lido e editado na Meta com a credencial guardada da sessão.
 *
 * GET   estado (nome, conexão, verificação, qualidade) e perfil comercial.
 * PATCH perfil comercial (recado, descrição, endereço, e-mail, sites, categoria).
 * POST  `acao`: nome | foto | pedir_codigo | conferir_codigo | registrar.
 *
 * Só administrador. A sessão sai da organização autenticada, nunca do corpo, e o
 * token não aparece em nenhuma resposta, log ou auditoria — nem o código do SMS.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit/actions";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";
import { metaCredsForPhoneNumberId } from "@/lib/channels/meta/credentials";
import {
  FOTO_MAX_BYTES,
  FOTO_TIPOS,
  codigoSmsSchema,
  conferirCodigo,
  enviarFoto,
  lerPerfilDoNumero,
  nomeDeExibicaoSchema,
  pedirCodigo,
  pedirNovoNome,
  perfilComercialSchema,
  registrarNumero,
  salvarPerfilComercial,
} from "@/lib/channels/meta/perfil-do-numero";
import { env } from "@/lib/env";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

const acaoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("nome"), nome: nomeDeExibicaoSchema }),
  z.object({
    acao: z.literal("foto"),
    tipo: z.enum(FOTO_TIPOS),
    // base64 sem o prefixo `data:`; o teto em caracteres segue o de bytes.
    base64: z.string().min(1).max(Math.ceil((FOTO_MAX_BYTES * 4) / 3) + 4),
  }),
  z.object({ acao: z.literal("pedir_codigo") }),
  z.object({ acao: z.literal("conferir_codigo"), codigo: codigoSmsSchema }),
  z.object({ acao: z.literal("registrar") }),
]);

type Sessao = { id: string; meta_phone_number_id: string; meta_app_id: string | null };

/** Sessão oficial viva DESTA organização + a credencial dela; ou a resposta de erro. */
async function abrir(req: { id: string; orgId: string; requestId: string }) {
  if (!z.uuid().safeParse(req.id).success) {
    return { erro: fail("validation_failed", "Canal inválido.", 422, { requestId: req.requestId }) };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, meta_phone_number_id, meta_app_id")
    .eq("organization_id", req.orgId)
    .eq("id", req.id)
    .eq("provider", CHANNEL_PROVIDER_META)
    .is("archived_at", null)
    .maybeSingle();
  if (error) return { erro: fail("internal_error", "Não foi possível carregar o número.", 500, { requestId: req.requestId }) };
  const sessao = data as Sessao | null;
  if (!sessao?.meta_phone_number_id) {
    return { erro: fail("not_found", "Número oficial não encontrado.", 404, { requestId: req.requestId }) };
  }
  const creds = await metaCredsForPhoneNumberId(admin, {
    organizationId: req.orgId,
    phoneNumberId: sessao.meta_phone_number_id,
  }).catch(() => null);
  if (!creds) {
    return {
      erro: fail("invalid_request", "Este número não tem credencial guardada. Conecte-o de novo com o token.", 422, {
        requestId: req.requestId,
      }),
    };
  }
  return { admin, sessao, token: creds.token };
}

export async function GET(_req: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "channel_sessions" });
  if (!auth.ok) return auth.response;
  const aberto = await abrir({ id: (await params).id, orgId: auth.org.orgId, requestId });
  if (aberto.erro) return aberto.erro;

  const r = await lerPerfilDoNumero({ phoneNumberId: aberto.sessao.meta_phone_number_id, token: aberto.token });
  if (!r.ok) return fail("invalid_request", `A Meta não respondeu: ${r.motivo}`, 422, { requestId });

  // O nome que o CRM mostra acompanha o aprovado na Meta.
  if (r.valor.estado.nome) {
    await aberto.admin
      .from("channel_sessions")
      .update({ display_name: r.valor.estado.nome })
      .eq("organization_id", auth.org.orgId)
      .eq("id", aberto.sessao.id);
  }
  return ok(r.valor, { requestId });
}

export async function PATCH(req: NextRequest, { params }: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "channel_sessions" });
  if (!auth.ok) return auth.response;
  const parsed = perfilComercialSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", parsed.error.issues[0]?.message ?? "Perfil inválido.", 422, { requestId });
  }
  const { id } = await params;
  const aberto = await abrir({ id, orgId: auth.org.orgId, requestId });
  if (aberto.erro) return aberto.erro;

  const r = await salvarPerfilComercial({
    phoneNumberId: aberto.sessao.meta_phone_number_id,
    token: aberto.token,
    perfil: parsed.data,
  });
  if (!r.ok) return fail("invalid_request", `A Meta recusou o perfil: ${r.motivo}`, 422, { requestId });
  void audit({
    action: "channel.whatsapp_profile_updated", actorUserId: auth.user.id, organizationId: auth.org.orgId,
    resourceType: "channel_session", resourceId: id, requestId,
    metadata: { campos: Object.keys(parsed.data).filter((k) => parsed.data[k as keyof typeof parsed.data] !== undefined) },
  });
  return ok({ salvo: true }, { requestId });
}

export async function POST(req: NextRequest, { params }: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "channel_sessions" });
  if (!auth.ok) return auth.response;
  const parsed = acaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", parsed.error.issues[0]?.message ?? "Pedido inválido.", 422, { requestId });
  }
  const { id } = await params;
  const aberto = await abrir({ id, orgId: auth.org.orgId, requestId });
  if (aberto.erro) return aberto.erro;
  const base = { phoneNumberId: aberto.sessao.meta_phone_number_id, token: aberto.token };
  const corpo = parsed.data;

  let r: { ok: true } | { ok: false; motivo: string };
  let acao: AuditAction;
  let metadata: Record<string, unknown> = {};
  switch (corpo.acao) {
    case "nome":
      r = await pedirNovoNome({ ...base, nome: corpo.nome });
      acao = "channel.display_name_requested";
      metadata = { nome: corpo.nome };
      break;
    case "foto": {
      const bytes = new Uint8Array(Buffer.from(corpo.base64, "base64"));
      const handle = await enviarFoto({ token: aberto.token, appId: aberto.sessao.meta_app_id, bytes, tipo: corpo.tipo });
      r = handle.ok
        ? await salvarPerfilComercial({ ...base, perfil: {}, fotoHandle: handle.valor })
        : handle;
      acao = "channel.profile_photo_updated";
      metadata = { tipo: corpo.tipo, bytes: bytes.byteLength };
      break;
    }
    case "pedir_codigo":
      r = await pedirCodigo(base);
      acao = "channel.phone_verification_requested";
      break;
    case "conferir_codigo": {
      r = await conferirCodigo({ ...base, codigo: corpo.codigo });
      acao = "channel.phone_verified";
      // Verificado, o número só envia depois de registrado: os dois passos são um só para quem opera.
      if (r.ok) r = await registrarNumero({ ...base, segredoDoPin: env.INTERNAL_SECRET });
      break;
    }
    case "registrar":
      r = await registrarNumero({ ...base, segredoDoPin: env.INTERNAL_SECRET });
      acao = "channel.number_reregistered";
      break;
  }
  if (!r.ok) return fail("invalid_request", `A Meta recusou: ${r.motivo}`, 422, { requestId });

  void audit({
    action: acao, actorUserId: auth.user.id, organizationId: auth.org.orgId,
    resourceType: "channel_session", resourceId: id, requestId, metadata,
  });
  return ok({ feito: corpo.acao }, { requestId });
}
