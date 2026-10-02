/**
 * POST /api/v1/lancamentos/[id]/midia (manager+) — sobe um arquivo para um disparo
 * do lançamento (multipart, campo `file`). Devolve o caminho que o item do disparo
 * guarda; a URL só nasce na hora do envio.
 *
 * Mesmas regras de tipo e tamanho da mídia de mensagem (`validateOutboundMedia`).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { BUCKET_DA_MIDIA, prefixoDaMidiaDoLancamento } from "@/lib/lancamentos/midia";
import { lerLancamento } from "@/lib/lancamentos/servico";
import { logger } from "@/lib/logger";
import { extFromMime, MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "lancamentos" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Lançamento não encontrado."), 404, { requestId });

  const admin = createAdminClient();
  const lancamento = await lerLancamento(admin, auth.org.orgId, id).catch(() => null);
  if (!lancamento) return fail("not_found", t("Lançamento não encontrado."), 404, { requestId });

  // Recusa pelo tamanho DECLARADO antes de carregar o corpo inteiro na memória.
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_MEDIA_BYTES + 1024 * 1024) {
    return fail("payload_too_large", t("Arquivo acima de 50MB."), 413, { requestId });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("validation_failed", t("Campo 'file' (multipart) obrigatório."), 422, { requestId });

  const mime = file.type || "application/octet-stream";
  const veredito = validateOutboundMedia(mime, file.size);
  if (!veredito.ok) {
    const status = veredito.code === "payload_too_large" ? 413 : veredito.code === "unsupported_media_type" ? 415 : 422;
    return fail(veredito.code, veredito.message, status, { requestId });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${prefixoDaMidiaDoLancamento(auth.org.orgId, id)}${randomUUID()}.${extFromMime(mime)}`;
  const { error } = await admin.storage.from(BUCKET_DA_MIDIA).upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (error) {
    logger.error("[lancamentos] upload de mídia falhou", { requestId, erro: error.message });
    return fail("internal_error", t("Erro ao subir o arquivo."), 500, { requestId });
  }

  return ok(
    { storage_path: storagePath, mime, size_bytes: buffer.length, kind: veredito.kind, filename: file.name || null },
    { requestId },
  );
}
