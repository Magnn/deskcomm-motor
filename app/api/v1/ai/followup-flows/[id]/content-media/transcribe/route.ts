import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/followup-flows/:id/content-media/transcribe (manager+)
 *
 * Transcreve um áudio JÁ ENVIADO para um item do nó "Conteúdo". É o que dá
 * efeito ao campo "Transcrição" da tela: o texto volta para o editor, o dono
 * confere/ajusta, e ele é gravado no item — no envio, acompanha a mensagem de
 * áudio (o atendente lê na conversa e o agente de IA sabe o que foi dito).
 *
 * Só transcreve arquivo do PRÓPRIO fluxo: o path tem de estar sob
 * `{org}/flow-content/{flowId}/`. Sem essa conferência, a rota leria qualquer
 * objeto do bucket em nome de quem a chamasse.
 *
 * Sem chave da OpenAI em nenhum degrau, responde 422 dizendo isso — transcrição
 * é opcional, e a tela segue funcionando sem ela.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { chaveOpenAiParaTranscricao } from "@/lib/ai/embeddings/chave";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { apiTranscriptionProvider } from "@/lib/messaging/media/transcription";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mesmo teto do upload de áudio (`upload-validation.ts`) — e o Whisper recusa acima de 25 MB. */
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
/** Mesmo teto do campo no schema do fluxo (`conteudoAudioSchema.transcript`). */
const MAX_TRANSCRICAO = 4000;

const corpoSchema = z.strictObject({
  storage_path: z.string().min(1).max(500),
  mime: z.string().min(1).max(120),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id: flowId } = await ctx.params;
  if (!UUID_RX.test(flowId)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("manager", { requestId, resource: "followup_flows" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org: activeOrg } = authz;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });
  const { storage_path: caminho, mime } = parsed.data;

  const supabase = await createClient();
  const { data: fluxo, error: fluxoErr } = await supabase
    .from("followup_flow_pointers")
    .select("id")
    .eq("id", flowId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (fluxoErr) return fail("internal_error", fluxoErr.message, 500, { requestId });
  if (!fluxo) return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });

  // Posse do arquivo: só o que este fluxo desta organização enviou.
  if (!caminho.startsWith(`${activeOrg.orgId}/flow-content/${flowId}/`) || caminho.includes("..")) {
    return fail("not_found", t("Arquivo não encontrado."), 404, { requestId });
  }
  if (!mime.toLowerCase().startsWith("audio/")) {
    return fail("unsupported_media_type", t("Só áudio pode ser transcrito."), 415, { requestId });
  }

  const apiKey = await chaveOpenAiParaTranscricao(activeOrg.orgId);
  if (apiKey === null) {
    return fail(
      "transcription_unavailable",
      t("Para transcrever, cadastre uma chave da OpenAI em IA › Credenciais."),
      422,
      { requestId },
    );
  }

  const admin = createAdminClient();
  const { data: arquivo, error: baixarErr } = await admin.storage.from("whatsapp-media").download(caminho);
  if (baixarErr || !arquivo) return fail("not_found", t("Arquivo não encontrado."), 404, { requestId });
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  if (buffer.length > MAX_AUDIO_BYTES) {
    return fail("payload_too_large", t("Áudio grande demais para transcrever."), 413, { requestId });
  }

  try {
    const texto = await apiTranscriptionProvider({ apiKey }).transcribe(buffer, mime);
    return ok({ transcript: texto.trim().slice(0, MAX_TRANSCRICAO) }, { requestId });
  } catch (err) {
    // O detalhe (status do provedor) vai para o log; a chave nunca.
    console.error("[followup-flows.transcribe] falhou", err instanceof Error ? err.message : "erro");
    return fail("transcription_failed", t("Não foi possível transcrever o áudio agora."), 502, { requestId });
  }
}
