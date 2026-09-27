import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/followup-flows/:id/content-media (manager+) — upload de mídia
 * para um item do nó "Conteúdo" (multipart, storage-first).
 *
 * Por que não reaproveita POST /api/v1/conversations/:id/media: aquela rota
 * namespaceia o arquivo sob {org}/{conversation}/ — certo para o composer, que
 * sempre tem uma conversa concreta. Um item de Conteúdo é configurado no
 * FLUXO, antes de qualquer conversa existir, e o mesmo arquivo é reenviado a
 * quem quer que dispare esse fluxo depois. O path aqui é {org}/flow-content/
 * {flowId}/{uuid}.{ext} — por FLUXO, nunca por conversa.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { extFromMime, MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id: flowId } = await ctx.params;
  if (!UUID_RX.test(flowId)) return fail("invalid_request", "id inválido.", 400, { requestId });

  // Mesmo teto de quem edita o grafo do fluxo (PATCH /ai/followup-flows/:id):
  // um item de Conteúdo É o grafo, só que com um upload no meio.
  const authz = await requireRole("manager", { requestId, resource: "followup_flows" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org: activeOrg } = authz;

  const supabase = await createClient();
  const { data: fluxo, error: fluxoErr } = await supabase
    .from("followup_flow_pointers")
    .select("id")
    .eq("id", flowId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (fluxoErr) return fail("internal_error", fluxoErr.message, 500, { requestId });
  if (!fluxo) return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });

  // Guard de DoS: rejeita pelo Content-Length declarado ANTES de bufferizar o
  // corpo inteiro. O teto exato por tipo (`validateOutboundMedia`) só é
  // conhecido depois do parse — aqui vale o teto do BUCKET, o maior possível.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES + 1_048_576) {
    return fail("payload_too_large", t("Arquivo acima de 50MB."), 413, { requestId });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("validation_failed", t("Campo 'file' (multipart) obrigatório."), 422, { requestId });
  }

  const mime = file.type || "application/octet-stream";
  const verdict = validateOutboundMedia(mime, file.size);
  if (!verdict.ok) {
    const status = verdict.code === "payload_too_large" ? 413 : verdict.code === "unsupported_media_type" ? 415 : 422;
    return fail(verdict.code, verdict.message, status, { requestId });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${activeOrg.orgId}/flow-content/${flowId}/${randomUUID()}.${extFromMime(mime)}`;
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("whatsapp-media")
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (upErr) {
    console.error("[followup-flows.content-media] upload failed", upErr.message);
    return fail("internal_error", t("Erro ao subir o arquivo."), 500, { requestId });
  }

  return ok(
    { storage_path: storagePath, media_mime: mime, media_size_bytes: buffer.length, kind: verdict.kind },
    { requestId },
  );
}
