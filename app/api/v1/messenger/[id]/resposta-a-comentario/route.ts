/**
 * GET/PUT /api/v1/messenger/[id]/resposta-a-comentario — "comentou na página, recebe mensagem no Messenger" de
 * um canal do Messenger: liga/desliga e o texto (`channel_sessions.metadata.resposta_a_comentario`). Quem usa é
 * o webhook (`lib/channels/messenger/comentarios.ts`). Os últimos desfechos vêm junto, para a tela mostrar se está
 * saindo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { configDaRespostaAComentario } from "@/lib/channels/messenger/comentarios";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function canalDaOrganizacao(orgId: string, id: string) {
  const { data, error } = await createAdminClient()
    .from("channel_sessions")
    .select("id, metadata")
    .eq("organization_id", orgId)
    .eq("id", id)
    .eq("provider", "meta_messenger")
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; metadata: Record<string, unknown> | null } | null;
}

export async function GET(_req: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("viewer", { requestId, resource: "channel_sessions" });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail("validation_failed", "Canal inválido.", 422, { requestId });
  try {
    const canal = await canalDaOrganizacao(auth.org.orgId, id);
    if (!canal) return fail("not_found", "Canal não encontrado.", 404, { requestId });
    const salvo = (canal.metadata?.resposta_a_comentario ?? null) as { ativo?: unknown; mensagem?: unknown } | null;
    const { data: ultimos } = await createAdminClient()
      .from("messenger_comment_replies")
      .select("status, error, created_at")
      .eq("organization_id", auth.org.orgId)
      .eq("channel_session_id", id)
      .order("created_at", { ascending: false })
      .limit(10);
    return ok(
      {
        ativo: salvo?.ativo === true,
        mensagem: typeof salvo?.mensagem === "string" ? salvo.mensagem : "",
        ultimos: ultimos ?? [],
      },
      { requestId },
    );
  } catch {
    return fail("internal_error", "Não foi possível carregar a resposta a comentários.", 500, { requestId });
  }
}

export async function PUT(req: NextRequest, { params }: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "channel_sessions" });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail("validation_failed", "Canal inválido.", 422, { requestId });
  const parsed = configDaRespostaAComentario.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Escreva a mensagem (até 2.000 caracteres).", 422, { requestId });
  try {
    const canal = await canalDaOrganizacao(auth.org.orgId, id);
    if (!canal) return fail("not_found", "Canal não encontrado.", 404, { requestId });
    // shortcut: lê e regrava o metadata inteiro; uma gravação simultânea de outra chave do mesmo canal pode se
    // perder. Mudança rara e feita à mão; se virar concorrente, trocar por uma função SQL com `metadata || ...`.
    const { error } = await createAdminClient()
      .from("channel_sessions")
      .update({ metadata: { ...(canal.metadata ?? {}), resposta_a_comentario: parsed.data } })
      .eq("organization_id", auth.org.orgId)
      .eq("id", id);
    if (error) return fail("internal_error", "Não foi possível salvar a resposta a comentários.", 500, { requestId });
    void audit({
      action: "channel.comment_reply_updated",
      actorUserId: auth.user.id,
      organizationId: auth.org.orgId,
      resourceType: "channel_session",
      resourceId: id,
      requestId,
      metadata: { ativo: parsed.data.ativo, tamanho: parsed.data.mensagem.length },
    });
    return ok(parsed.data, { requestId });
  } catch {
    return fail("internal_error", "Não foi possível salvar a resposta a comentários.", 500, { requestId });
  }
}
