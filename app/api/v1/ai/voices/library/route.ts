/**
 * A BIBLIOTECA de vozes da ElevenLabs — achar uma voz que fale português do Brasil.
 *
 * GET  /api/v1/ai/voices/library?q=&genero=  (manager+) — busca na biblioteca pública
 *      (`language=pt`, só as que se declaram brasileiras). Não gasta síntese: o
 *      `previewUrl` é uma amostra que o navegador toca direto do provedor.
 * POST /api/v1/ai/voices/library             (admin)   — adiciona uma voz da
 *      biblioteca à conta do cliente, para a agente poder usá-la.
 *
 * Por que isto existe: as vozes prontas da conta são, em geral, de falantes nativos de
 * inglês. Falando português elas ganham sotaque estrangeiro — é o que mais denuncia
 * uma nota de voz de agente. Uma voz nativa brasileira resolve o que ajuste de
 * velocidade e estabilidade não resolve.
 *
 * Adicionar uma voz da biblioteca pode exigir plano pago na ElevenLabs; o 402/403 volta
 * como `sem_permissao_de_biblioteca` com a explicação em português.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { resolverChaveDeVoz } from "@/lib/voz/chaves";
import { ErroDeVoz, explicarErroDeVoz } from "@/lib/voz/erros";
import { implementacaoDeVoz } from "@/lib/voz/provedores";
import type { GeneroDaVoz } from "@/lib/voz/tipos";

export const dynamic = "force-dynamic";

const GENEROS: readonly GeneroDaVoz[] = ["feminina", "masculina", "neutra"];
const ADICOES_POR_HORA = 10;
const JANELA_SEGUNDOS = 3600;

function statusDoErro(err: unknown): number {
  if (err instanceof ErroDeVoz) {
    if (err.codigo === "chave_invalida" || err.codigo === "sem_permissao_de_biblioteca") return 409;
    if (err.codigo === "limite_do_provedor") return 429;
  }
  return 502;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_voices" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const impl = implementacaoDeVoz("elevenlabs");
  if (!impl.buscarNaBiblioteca) {
    return fail("voice_library_unsupported", t("Este provedor não tem biblioteca de vozes."), 422, { requestId });
  }
  const apiKey = await resolverChaveDeVoz(authz.org.orgId, "elevenlabs");
  if (!apiKey) {
    return fail("voice_key_missing", t(explicarErroDeVoz(new ErroDeVoz("sem_chave"))), 409, { requestId });
  }

  const params = req.nextUrl.searchParams;
  const genero = GENEROS.find((g) => g === params.get("genero"));
  const texto = (params.get("q") ?? "").trim();

  try {
    const vozes = await impl.buscarNaBiblioteca(apiKey, {
      idioma: "pt",
      ...(genero ? { genero } : {}),
      ...(texto !== "" ? { texto } : {}),
    });
    return ok({ vozes }, { requestId });
  } catch (err) {
    return fail("voice_library_failed", t(explicarErroDeVoz(err)), statusDoErro(err), { requestId });
  }
}

const adicionarSchema = z.object({
  public_owner_id: z.string().trim().min(1).max(120),
  voice_id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2).max(60),
});

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_voices" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = adicionarSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const b = parsed.data;

  const impl = implementacaoDeVoz("elevenlabs");
  if (!impl.adicionarDaBiblioteca) {
    return fail("voice_library_unsupported", t("Este provedor não tem biblioteca de vozes."), 422, { requestId });
  }

  const balde = await checkRateLimit(`voz-biblioteca:${org.orgId}`, ADICOES_POR_HORA, JANELA_SEGUNDOS);
  if (!balde.allowed) {
    return fail("rate_limited", t("Muitas adições nesta hora. Espere um pouco."), 429, {
      requestId,
      headers: { "Retry-After": String(JANELA_SEGUNDOS) },
    });
  }

  const apiKey = await resolverChaveDeVoz(org.orgId, "elevenlabs");
  if (!apiKey) {
    return fail("voice_key_missing", t(explicarErroDeVoz(new ErroDeVoz("sem_chave"))), 409, { requestId });
  }

  try {
    const voz = await impl.adicionarDaBiblioteca(apiKey, {
      publicOwnerId: b.public_owner_id,
      vozId: b.voice_id,
      nome: b.name,
    });
    await audit({
      action: "ai.voice_added_from_library",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "ai_voice",
      resourceId: voz.id,
      requestId,
      metadata: { provider: "elevenlabs", library_voice_id: b.voice_id, public_owner_id: b.public_owner_id },
    });
    return ok(voz, { status: 201, requestId });
  } catch (err) {
    return fail("voice_library_add_failed", t(explicarErroDeVoz(err)), statusDoErro(err), { requestId });
  }
}
