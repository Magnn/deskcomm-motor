import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";

import type { ApiCallHeader, HttpMethod } from "./graph-schema";
import { HTTP_METHODS } from "./graph-schema";

/**
 * Nó `api_call` (webhook genérico) — o achado de UX mais forte da pesquisa
 * comparativa (referência: AcassIA `api`): colar um cURL preenche
 * método/URL/headers/corpo automaticamente, em vez de a pessoa digitar cada
 * campo à mão. Este arquivo tem o parser (`parseCurl`, puro) e o aviso de
 * URL bloqueada que a TELA mostra enquanto a pessoa digita.
 *
 * DIRC: a mitigação de SSRF em si NÃO nasce aqui — `lib/automation/` já tinha
 * um par completo e provado (`assertSafeOutboundUrl` textual +
 * `assertDestinoResolvidoSeguro`, que resolve DNS de verdade contra
 * rebinding), construído para a ação de automação `call_webhook`
 * (J6.8, `tests/e2e/vps-webhook-outbound-ssrf.spec.ts`). Este nó reaproveita
 * as DUAS peças — `ehHostBloqueadoPorSsrf` abaixo é só um wrapper síncrono de
 * `assertSafeOutboundUrl` pra UX imediata no formulário; a chamada de
 * verdade em `engine.ts` chama as DUAS, na MESMA ordem que `call-webhook.ts`
 * já usa (textual primeiro, DNS depois — o textual é grátis, o DNS custa).
 */

const FLAGS_SEM_ARGUMENTO = new Set([
  "-s",
  "--silent",
  "-i",
  "--include",
  "-k",
  "--insecure",
  "-v",
  "--verbose",
  "-L",
  "--location",
  "--compressed",
  "-f",
  "--fail",
  "-G",
  "--get",
  "-4",
  "--ipv4",
  "-6",
  "--ipv6",
]);

/** Flags com argumento que o parser reconhece mas não usa (skip da flag + do valor, sem quebrar o resto). */
const FLAGS_IGNORADAS_COM_ARGUMENTO = new Set([
  "-u",
  "--user",
  "-b",
  "--cookie",
  "-c",
  "--cookie-jar",
  "-o",
  "--output",
  "-e",
  "--referer",
  "-A",
  "--user-agent",
  "--connect-timeout",
  "-m",
  "--max-time",
]);

/**
 * Tokeniza um comando de shell simples respeitando aspas simples/duplas —
 * suficiente para o formato que "Copiar como cURL" do navegador/Postman
 * produz. Não interpreta `$VAR`, `` ` `` nem pipes — não é um shell.
 */
function tokenizar(comando: string): string[] {
  // Continuação de linha (`\` no fim, comum em cURL colado do DevTools) vira espaço.
  const normalizado = comando.replace(/\\\r?\n/g, " ");
  const tokens: string[] = [];
  let atual = "";
  let aspas: "'" | '"' | null = null;
  for (let i = 0; i < normalizado.length; i++) {
    const c = normalizado[i]!;
    if (aspas) {
      if (c === aspas) {
        aspas = null;
      } else {
        atual += c;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      aspas = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (atual.length > 0) {
        tokens.push(atual);
        atual = "";
      }
      continue;
    }
    atual += c;
  }
  if (atual.length > 0) tokens.push(atual);
  return tokens;
}

export interface CurlParseado {
  method: HttpMethod;
  url: string;
  headers: ApiCallHeader[];
  body?: string;
}

/**
 * Parser tolerante: aceita o formato que sai de "Copy as cURL" (Chrome DevTools,
 * Postman, Insomnia) — `-X`/`--request`, `-H`/`--header` (repetível), `-d`/
 * `--data`/`--data-raw`/`--data-binary` (repetível, concatenado com `&`, como o
 * cURL de verdade faz com múltiplos `-d`), e a URL como o primeiro argumento
 * solto. Devolve `null` quando não acha URL nenhuma — nunca inventa uma.
 */
export function parseCurl(comandoBruto: string): CurlParseado | null {
  const comando = comandoBruto.trim();
  if (!comando) return null;

  const tokens = tokenizar(comando);
  let i = 0;
  if (tokens[0]?.toLowerCase() === "curl") i = 1;

  let method: HttpMethod | undefined;
  let url: string | undefined;
  const headers: ApiCallHeader[] = [];
  const dataParts: string[] = [];

  for (; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok === "-X" || tok === "--request") {
      const valor = tokens[++i]?.toUpperCase();
      if (valor && (HTTP_METHODS as readonly string[]).includes(valor)) method = valor as HttpMethod;
      continue;
    }
    if (tok === "-H" || tok === "--header") {
      const valor = tokens[++i];
      if (valor) {
        const idx = valor.indexOf(":");
        if (idx > 0) {
          headers.push({ key: valor.slice(0, idx).trim(), value: valor.slice(idx + 1).trim() });
        }
      }
      continue;
    }
    if (tok === "-d" || tok === "--data" || tok === "--data-raw" || tok === "--data-binary" || tok === "--data-urlencode") {
      const valor = tokens[++i];
      if (valor !== undefined) dataParts.push(valor);
      continue;
    }
    if (FLAGS_SEM_ARGUMENTO.has(tok)) continue;
    if (FLAGS_IGNORADAS_COM_ARGUMENTO.has(tok)) {
      i++; // pula o valor associado
      continue;
    }
    if (tok.startsWith("-")) continue; // flag desconhecida — ignora, não deriva
    if (url === undefined) url = tok; // primeiro argumento solto = URL
  }

  if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) return null;

  const body = dataParts.length > 0 ? dataParts.join("&") : undefined;
  return {
    method: method ?? (body !== undefined ? "POST" : "GET"),
    url,
    headers,
    ...(body !== undefined ? { body } : {}),
  };
}

/**
 * Aviso SÍNCRONO pro formulário — a mesma régua textual que `engine.ts` vai
 * aplicar de verdade antes de qualquer chamada (`assertSafeOutboundUrl`,
 * `lib/automation/outbound-url.ts`), só que devolvendo `boolean` em vez de
 * lançar, porque aqui é feedback de digitação, não um guard que bloqueia.
 * NÃO substitui o guard de DNS (`assertDestinoResolvidoSeguro`) — esse exige
 * `node:dns`, não roda no navegador, e por isso só existe do lado do engine.
 */
export function ehHostBloqueadoPorSsrf(url: string): boolean {
  try {
    assertSafeOutboundUrl(url);
    return false;
  } catch {
    return true;
  }
}
