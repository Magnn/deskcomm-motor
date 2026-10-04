/**
 * O TOKEN que a volta do Facebook entrega ao Meta Ads — trocar, inspecionar e,
 * quando for de pessoa, alongar.
 *
 * ─── Por que não a troca do Messenger ───────────────────────────────────────
 *
 * O Messenger sempre recebe token de PESSOA e sempre o alonga. Aqui a
 * configuração do "Login do Facebook para Empresas" pode emitir token de
 * USUÁRIO DO SISTEMA, que já nasce com a duração que a configuração definiu: o
 * que decide é o tipo que a própria Meta declara, lido em `debug_token`.
 *
 * ─── Por que `debug_token` ──────────────────────────────────────────────────
 *
 * Medido em produção: para token de usuário do sistema, `me/adaccounts` responde
 * `(#200) Missing Permissions` e `me/assigned_ad_accounts` responde 400. As
 * contas que a pessoa concedeu no consentimento vêm em
 * `granular_scopes[].target_ids` — é a única lista que não depende de aresta.
 *
 * Token e segredo vão no CORPO, nunca na URL (CLAUDE.md, anti-pattern 12): a
 * Graph aceita `POST` com `method=GET`.
 */
import { graphVersion } from "@/lib/graph-version";

const GRAPH = "https://graph.facebook.com";
const TETO_MS = 15_000;

/** As permissões que dão alcance a uma conta de anúncios. */
const ESCOPOS_DE_ANUNCIO = new Set(["ads_read", "ads_management"]);

export class TokenDoMetaAdsError extends Error {
  constructor(
    public readonly onde: string,
    public readonly detalhe: string,
  ) {
    super(`meta_ads_${onde}: ${detalhe}`);
  }
}

export interface InspecaoDoToken {
  /** `USER`, `SYSTEM_USER`… como a Meta declara; `null` quando ela não disse. */
  tipo: string | null;
  escopos: string[];
  /** Ids NUMÉRICOS das contas de anúncio concedidas, sem o prefixo `act_`. */
  contasConcedidas: string[];
}

type Buscar = typeof fetch;

async function chamar<T>(buscar: Buscar, onde: string, caminho: string, parametros: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await buscar(`${GRAPH}/${graphVersion()}/${caminho}`, {
      method: "POST",
      body: new URLSearchParams({ method: "GET", ...parametros }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
  } catch (err) {
    throw new TokenDoMetaAdsError(onde, err instanceof Error ? err.message : String(err));
  }
  const texto = await res.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }
  if (!res.ok) {
    const mensagem = (corpo as { error?: { message?: string } } | null)?.error?.message;
    throw new TokenDoMetaAdsError(onde, mensagem ?? texto.slice(0, 200));
  }
  return corpo as T;
}

/** O que a Meta sabe do token: tipo, permissões e as contas concedidas. */
export async function inspecionarToken(
  p: { appId: string; appSecret: string; token: string },
  buscar: Buscar = fetch,
): Promise<InspecaoDoToken> {
  const corpo = await chamar<{
    data?: { type?: string; scopes?: string[]; granular_scopes?: { scope?: string; target_ids?: string[] }[] };
  }>(buscar, "inspecao", "debug_token", {
    input_token: p.token,
    access_token: `${p.appId}|${p.appSecret}`,
  });
  const dados = corpo.data ?? {};
  const contas = new Set<string>();
  for (const g of dados.granular_scopes ?? []) {
    if (!g.scope || !ESCOPOS_DE_ANUNCIO.has(g.scope)) continue;
    for (const id of g.target_ids ?? []) contas.add(String(id).replace(/^act_/, ""));
  }
  return { tipo: dados.type ?? null, escopos: dados.scopes ?? [], contasConcedidas: [...contas] };
}

/**
 * Código da volta → o token que fica guardado.
 *
 * Token de PESSOA é trocado pelo de longa duração (~60 dias); qualquer outro
 * tipo fica como veio. Inspeção que falha não derruba a conexão: o token é
 * tratado como de pessoa, que era o comportamento antes de existir inspeção.
 */
export async function tokenDaVolta(
  p: { appId: string; appSecret: string; redirectUri: string; code: string },
  buscar: Buscar = fetch,
): Promise<{ token: string; inspecao: InspecaoDoToken | null }> {
  const troca = await chamar<{ access_token?: string }>(buscar, "troca_do_codigo", "oauth/access_token", {
    client_id: p.appId,
    client_secret: p.appSecret,
    redirect_uri: p.redirectUri,
    code: p.code,
  });
  if (!troca.access_token) throw new TokenDoMetaAdsError("troca_do_codigo", "a Meta não devolveu token");

  let inspecao: InspecaoDoToken | null = null;
  try {
    inspecao = await inspecionarToken({ appId: p.appId, appSecret: p.appSecret, token: troca.access_token }, buscar);
  } catch {
    inspecao = null;
  }
  if (inspecao !== null && inspecao.tipo !== null && inspecao.tipo !== "USER") {
    return { token: troca.access_token, inspecao };
  }

  const longo = await chamar<{ access_token?: string }>(buscar, "token_longo", "oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: p.appId,
    client_secret: p.appSecret,
    fb_exchange_token: troca.access_token,
  });
  if (!longo.access_token) throw new TokenDoMetaAdsError("token_longo", "a Meta não devolveu token de longa duração");
  return { token: longo.access_token, inspecao };
}
