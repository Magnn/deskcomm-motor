/**
 * POST /api/v1/ai/voices/clone — cria uma voz a partir de gravações (admin).
 *
 * Multipart: `name`, `gender`, `consent` (="true") e de 1 a 5 arquivos em
 * `samples`. Só a ElevenLabs clona hoje (`clona: true` em `PROVEDORES_DE_VOZ`).
 *
 * ─── Consentimento é parte da chamada, não enfeite da tela ──────────────────
 * Voz é dado pessoal, e clonar a voz de alguém sem autorização é o uso que este
 * recurso não pode facilitar. A rota RECUSA sem `consent=true`, e a linha de
 * auditoria `ai.voice_cloned` guarda quem declarou, quando e o TEXTO que
 * aceitou (o canônico abaixo, versionado — a tela mostra o mesmo texto; o que
 * vale é o daqui). Isso não prova que a voz é do declarante, e a rota não finge
 * provar: registra a declaração, que é o que se pode exigir de um formulário.
 *
 * As amostras vão direto ao provedor e NÃO são guardadas por nós.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { resolverChaveDeVoz } from "@/lib/voz/chaves";
import { TEXTO_DO_CONSENTIMENTO, VERSAO_DO_CONSENTIMENTO } from "@/lib/voz/consentimento";
import { ErroDeVoz, explicarErroDeVoz } from "@/lib/voz/erros";
import { implementacaoDeVoz } from "@/lib/voz/provedores";
import type { AmostraDeVoz } from "@/lib/voz/provedores/tipos";
import type { GeneroDaVoz } from "@/lib/voz/tipos";

export const dynamic = "force-dynamic";

const MAX_AMOSTRAS = 5;
// 9 MB no total, e não mais: o `proxy.ts` do Next clona o corpo da requisição para o
// roteamento e trunca o que passa de 10 MB (`proxyClientMaxBodySize`). Uma gravação de
// 1 a 3 minutos em mp3 tem de 1 a 4 MB; wav de estúdio é que não cabe — converta antes.
const MAX_BYTES_POR_AMOSTRA = 9 * 1024 * 1024;
const MAX_BYTES_TOTAL = 9 * 1024 * 1024;
const CLONAGENS_POR_HORA = 5;
const JANELA_SEGUNDOS = 3600;
const GENEROS: readonly GeneroDaVoz[] = ["feminina", "masculina", "neutra"];

/** O que o provedor aceita como gravação: áudio, ou o contêiner mp4/webm de um celular. */
function tipoDeAmostraAceito(tipo: string): boolean {
  const base = tipo.split(";")[0]?.trim().toLowerCase() ?? "";
  return base.startsWith("audio/") || base === "video/mp4" || base === "video/webm";
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_voices" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("invalid_request", t("Corpo multipart inválido."), 400, { requestId });
  }

  const nome = String(form.get("name") ?? "").trim();
  const generoBruto = String(form.get("gender") ?? "");
  const genero = GENEROS.find((g) => g === generoBruto);
  const consentimento = String(form.get("consent") ?? "") === "true";
  const arquivos = form.getAll("samples").filter((f): f is File => f instanceof File && f.size > 0);

  if (nome.length < 2 || nome.length > 60 || genero === undefined) {
    return fail("validation_failed", t("Informe um nome (2 a 60 letras) e o gênero da voz."), 422, { requestId });
  }
  if (!consentimento) {
    return fail(
      "consent_required",
      t("Confirme que a voz é sua ou que você tem autorização de quem a possui."),
      422,
      { requestId },
    );
  }
  if (arquivos.length < 1 || arquivos.length > MAX_AMOSTRAS) {
    return fail("validation_failed", t("Envie de 1 a 5 gravações."), 422, { requestId });
  }
  const total = arquivos.reduce((soma, f) => soma + f.size, 0);
  if (arquivos.some((f) => f.size > MAX_BYTES_POR_AMOSTRA) || total > MAX_BYTES_TOTAL) {
    return fail("payload_too_large", t("Gravações grandes demais: até 9 MB no total. Use mp3 ou reduza a duração."), 413, {
      requestId,
    });
  }
  if (arquivos.some((f) => !tipoDeAmostraAceito(f.type))) {
    return fail("unsupported_media_type", t("Use gravações de áudio (mp3, wav, ogg, m4a)."), 415, { requestId });
  }

  const balde = await checkRateLimit(`voz-clone:${org.orgId}`, CLONAGENS_POR_HORA, JANELA_SEGUNDOS);
  if (!balde.allowed) {
    return fail("rate_limited", t("Muitas clonagens nesta hora. Espere um pouco."), 429, {
      requestId,
      headers: { "Retry-After": String(JANELA_SEGUNDOS) },
    });
  }

  const apiKey = await resolverChaveDeVoz(org.orgId, "elevenlabs");
  if (!apiKey) {
    return fail("voice_key_missing", t(explicarErroDeVoz(new ErroDeVoz("sem_chave"))), 409, { requestId });
  }

  const impl = implementacaoDeVoz("elevenlabs");
  if (!impl.clonar) {
    return fail("voice_clone_unsupported", t("Este provedor não clona vozes."), 422, { requestId });
  }

  const amostras: AmostraDeVoz[] = await Promise.all(
    arquivos.map(async (f) => ({
      nome: f.name || "amostra",
      tipo: f.type || "audio/mpeg",
      dados: new Uint8Array(await f.arrayBuffer()),
    })),
  );

  let voz;
  try {
    voz = await impl.clonar({ apiKey, nome, genero, amostras });
  } catch (err) {
    const status =
      err instanceof ErroDeVoz && err.codigo === "sem_permissao_de_clonagem"
        ? 402
        : err instanceof ErroDeVoz && err.codigo === "amostra_invalida"
          ? 422
          : 502;
    return fail("voice_clone_failed", t(explicarErroDeVoz(err)), status, { requestId });
  }

  await audit({
    action: "ai.voice_cloned",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_voice",
    resourceId: voz.id,
    requestId,
    metadata: {
      provider: "elevenlabs",
      voice_name: voz.nome,
      gender: voz.genero,
      samples: amostras.length,
      sample_bytes: total,
      consent: {
        statement_version: VERSAO_DO_CONSENTIMENTO,
        statement: TEXTO_DO_CONSENTIMENTO,
        declared_by: user.id,
        declared_at: new Date().toISOString(),
      },
    },
  });

  return ok(voz, { status: 201, requestId });
}
