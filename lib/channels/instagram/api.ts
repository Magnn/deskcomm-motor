/**
 * A CONVERSA COM O INSTAGRAM — só as chamadas, sem banco.
 *
 * A conta é conectada pelo LOGIN DO INSTAGRAM (sem página do Facebook no meio):
 * autorização em `www.instagram.com`, troca do código em `api.instagram.com` e,
 * dali em diante, tudo em `graph.instagram.com`, onde a própria conta é `me`.
 *
 * O que este módulo sabe fazer é o que "comentou, recebe direct" precisa:
 * conectar, assinar os avisos de comentário, listar publicações, responder em
 * público e mandar a resposta PRIVADA — o direct ancorado no comentário, que a
 * Meta permite uma vez por comentário, em até 7 dias, sem a pessoa ter escrito
 * antes.
 *
 * Toda falha vira `InstagramApiError`, com o status e a mensagem que a Meta deu:
 * é o que aparece no registro do comentário, e "falhou" sem motivo não ajuda
 * ninguém a consertar uma permissão que faltou.
 */
import { graphVersion } from "@/lib/graph-version";

export const INSTAGRAM_API = "https://graph.instagram.com";
const INSTAGRAM_TROCA_DE_CODIGO = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_AUTORIZACAO = "https://www.instagram.com/oauth/authorize";

/** A versão vem do lugar único da instalação — a API do Instagram segue a numeração da Graph. */
const versao = (): string => graphVersion();

/** O mínimo para comentários e direct. Pedir mais atrasa a aprovação do app sem ganho. */
export const PERMISSOES_DO_INSTAGRAM = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
] as const;

/** Os avisos que a conta passa a mandar para o nosso webhook. */
const AVISOS_ASSINADOS = "comments,messages";

/** Só conta profissional: a pessoal não tem API de comentário nem de direct. */
const TIPOS_DE_CONTA_ACEITOS = ["BUSINESS", "CREATOR", "MEDIA_CREATOR"];

const TETO_MS = 15_000;

export class InstagramApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detalhe: string,
    public readonly onde: string,
  ) {
    super(`instagram_${status}: ${detalhe}`);
  }
}

export interface ContaDoInstagram {
  id: string;
  userId: string;
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
}

export interface PublicacaoDoInstagram {
  id: string;
  caption: string | null;
  mediaType: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
}

type Buscar = typeof fetch;

async function chamar<T>(buscar: Buscar, onde: string, url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await buscar(url, { ...init, signal: AbortSignal.timeout(TETO_MS) });
  } catch (err) {
    throw new InstagramApiError(0, err instanceof Error ? err.message : String(err), onde);
  }
  const texto = await res.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }
  if (!res.ok) {
    const erro = (corpo as { error?: { message?: string }; error_message?: string } | null) ?? null;
    throw new InstagramApiError(res.status, erro?.error?.message ?? erro?.error_message ?? texto.slice(0, 200), onde);
  }
  return corpo as T;
}

const comToken = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** Para onde mandar o navegador de quem vai conectar a conta. */
export function urlDeAutorizacao(p: { appId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: p.appId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: PERMISSOES_DO_INSTAGRAM.join(","),
    state: p.state,
  });
  return `${INSTAGRAM_AUTORIZACAO}?${q.toString()}`;
}

/** Código da volta → token de longa duração (60 dias) e quando ele vence. */
export async function trocarCodigoPorToken(
  p: { appId: string; appSecret: string; redirectUri: string; code: string },
  buscar: Buscar = fetch,
): Promise<{ token: string; expiraEm: Date | null }> {
  const curto = await chamar<{ access_token: string }>(buscar, "troca_do_codigo", INSTAGRAM_TROCA_DE_CODIGO, {
    method: "POST",
    body: new URLSearchParams({
      client_id: p.appId,
      client_secret: p.appSecret,
      redirect_uri: p.redirectUri,
      code: p.code,
      grant_type: "authorization_code",
    }),
  });
  const q = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: p.appSecret, access_token: curto.access_token });
  const longo = await chamar<{ access_token: string; expires_in?: number }>(buscar, "token_longo", `${INSTAGRAM_API}/access_token?${q.toString()}`);
  return { token: longo.access_token, expiraEm: expiraEm(longo.expires_in) };
}

function expiraEm(segundos: number | undefined): Date | null {
  return typeof segundos === "number" && segundos > 0 ? new Date(Date.now() + segundos * 1000) : null;
}

/** Estica o token por mais 60 dias. Só funciona com token ainda válido e com mais de 24h. */
export async function renovarToken(token: string, buscar: Buscar = fetch): Promise<{ token: string; expiraEm: Date | null }> {
  const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const r = await chamar<{ access_token: string; expires_in?: number }>(buscar, "renovar_token", `${INSTAGRAM_API}/refresh_access_token?${q.toString()}`);
  return { token: r.access_token, expiraEm: expiraEm(r.expires_in) };
}

/** Quem é a conta deste token. `null` = conta pessoal (não profissional): não dá para automatizar. */
export async function lerConta(token: string, buscar: Buscar = fetch): Promise<ContaDoInstagram | null> {
  const q = new URLSearchParams({ fields: "id,user_id,username,name,profile_picture_url,account_type" });
  const r = await chamar<{
    id: string;
    user_id?: string | number;
    username: string;
    name?: string;
    profile_picture_url?: string;
    account_type?: string;
  }>(buscar, "ler_conta", `${INSTAGRAM_API}/${versao()}/me?${q.toString()}`, { headers: comToken(token) });
  if (!TIPOS_DE_CONTA_ACEITOS.includes(String(r.account_type ?? "").toUpperCase())) return null;
  return {
    id: String(r.id),
    userId: String(r.user_id ?? r.id),
    username: r.username,
    name: r.name ?? null,
    profilePictureUrl: r.profile_picture_url ?? null,
  };
}

/** Liga os avisos de comentário (e de direct) desta conta para o webhook do app. */
export async function assinarAvisos(token: string, buscar: Buscar = fetch): Promise<void> {
  const r = await chamar<{ success?: boolean }>(buscar, "assinar_avisos", `${INSTAGRAM_API}/${versao()}/me/subscribed_apps`, {
    method: "POST",
    headers: { ...comToken(token), "Content-Type": "application/json" },
    body: JSON.stringify({ subscribed_fields: AVISOS_ASSINADOS }),
  });
  if (r?.success !== true) throw new InstagramApiError(200, "a Meta não confirmou a assinatura dos avisos", "assinar_avisos");
}

/** Desliga os avisos — ao desconectar a conta. */
export async function cancelarAvisos(token: string, buscar: Buscar = fetch): Promise<void> {
  await chamar(buscar, "cancelar_avisos", `${INSTAGRAM_API}/${versao()}/me/subscribed_apps`, { method: "DELETE", headers: comToken(token) });
}

/** As publicações mais recentes da conta, para a regra escolher em quais vale. */
export async function listarPublicacoes(token: string, buscar: Buscar = fetch): Promise<PublicacaoDoInstagram[]> {
  const q = new URLSearchParams({ fields: "id,caption,media_type,media_url,thumbnail_url,timestamp,permalink", limit: "50" });
  const r = await chamar<{
    data?: Array<{ id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; timestamp?: string; permalink?: string }>;
  }>(buscar, "listar_publicacoes", `${INSTAGRAM_API}/${versao()}/me/media?${q.toString()}`, { headers: comToken(token) });
  return (r.data ?? []).map((m) => ({
    id: String(m.id),
    caption: m.caption ?? null,
    mediaType: m.media_type ?? null,
    // Vídeo traz a capa em `thumbnail_url`; imagem, em `media_url`.
    thumbnailUrl: m.thumbnail_url ?? (m.media_type === "VIDEO" ? null : (m.media_url ?? null)),
    permalink: m.permalink ?? null,
    timestamp: m.timestamp ?? null,
  }));
}

/** A resposta PÚBLICA, embaixo do comentário. Só texto: a Meta não aceita mídia aqui. */
export async function responderComentario(token: string, commentId: string, texto: string, buscar: Buscar = fetch): Promise<void> {
  await chamar(buscar, "resposta_publica", `${INSTAGRAM_API}/${versao()}/${encodeURIComponent(commentId)}/replies`, {
    method: "POST",
    headers: { ...comToken(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message: texto }),
  });
}

/**
 * A resposta PRIVADA: o direct para quem comentou, ancorado no comentário. É o
 * que dispensa a pessoa ter escrito antes — e vale uma vez por comentário.
 */
export async function enviarRespostaPrivada(token: string, commentId: string, texto: string, buscar: Buscar = fetch): Promise<void> {
  await chamar(buscar, "resposta_privada", `${INSTAGRAM_API}/${versao()}/me/messages`, {
    method: "POST",
    headers: { ...comToken(token), "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: texto } }),
  });
}
