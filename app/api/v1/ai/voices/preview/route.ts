/**
 * POST /api/v1/ai/voices/preview — ouve uma voz ANTES de escolhê-la (manager+).
 *
 * Devolve o áudio (mp3, que todo navegador toca) para a tela tocar num
 * `<audio>`. Cada chamada é uma SÍNTESE PAGA na chave do cliente, então:
 * texto curto (300 caracteres), teto por organização por hora, e o texto vem
 * do corpo mas a chave NUNCA — ela é resolvida aqui, pela organização da sessão.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail } from "@/lib/api/wrappers";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { resolverChaveDeVoz } from "@/lib/voz/chaves";
import { ErroDeVoz, explicarErroDeVoz } from "@/lib/voz/erros";
import { sintetizarNota, textoParaFala } from "@/lib/voz/sintetizar";
import { IDS_DE_PROVEDOR_DE_VOZ } from "@/lib/voz/tipos";

export const dynamic = "force-dynamic";

const PREVIAS_POR_HORA = 30;
const JANELA_SEGUNDOS = 3600;

const TEXTO_PADRAO = "Oi, tudo bem? Eu sou a voz que vai conversar com você por aqui.";

const bodySchema = z.object({
  provider: z.enum(IDS_DE_PROVEDOR_DE_VOZ),
  voice_id: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(300).optional(),
  model: z.string().trim().max(80).optional(),
  speed: z.number().min(0.7).max(1.2).optional(),
  stability: z.number().min(0).max(1).optional(),
  similarity_boost: z.number().min(0).max(1).optional(),
  style_instructions: z.string().trim().max(400).optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  // A pré-escuta GASTA síntese na conta do cliente: o modo somente-leitura do
  // suporte não a dispara.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_voices" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const b = parsed.data;

  const balde = await checkRateLimit(`voz-previa:${orgId}`, PREVIAS_POR_HORA, JANELA_SEGUNDOS);
  if (!balde.allowed) {
    return fail("rate_limited", t("Muitas pré-escutas nesta hora. Espere um pouco."), 429, {
      requestId,
      headers: { "Retry-After": String(JANELA_SEGUNDOS) },
    });
  }

  const apiKey = await resolverChaveDeVoz(orgId, b.provider);
  if (!apiKey) {
    return fail("voice_key_missing", t(explicarErroDeVoz(new ErroDeVoz("sem_chave"))), 409, { requestId });
  }

  try {
    const audio = await sintetizarNota({
      provedor: b.provider,
      apiKey,
      config: {
        voice_id: b.voice_id,
        ...(b.model !== undefined ? { model: b.model } : {}),
        ...(b.speed !== undefined ? { speed: b.speed } : {}),
        ...(b.stability !== undefined ? { stability: b.stability } : {}),
        ...(b.similarity_boost !== undefined ? { similarity_boost: b.similarity_boost } : {}),
        ...(b.style_instructions !== undefined ? { style_instructions: b.style_instructions } : {}),
      },
      texto: textoParaFala(b.text ?? TEXTO_PADRAO),
      formato: "previa",
    });
    return new Response(new Uint8Array(audio.buffer), {
      status: 200,
      headers: {
        "Content-Type": audio.mime,
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (err) {
    const status = err instanceof ErroDeVoz && err.codigo === "chave_invalida" ? 409 : 502;
    return fail("voice_synthesis_failed", t(explicarErroDeVoz(err)), status, { requestId });
  }
}
