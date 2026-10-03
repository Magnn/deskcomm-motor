/**
 * A CONVERSA COM O MESSENGER — só as chamadas à Graph API, sem banco.
 *
 * A página é conectada pelo LOGIN DO FACEBOOK de quem a administra:
 *
 *   código → token de usuário curto → token de usuário de longa duração →
 *   `/me/accounts` devolve as páginas que a pessoa autorizou, cada uma com o
 *   seu token de PÁGINA (que, derivado do token longo, não expira) →
 *   `/{page}/subscribed_apps` liga os avisos daquela página no nosso app.
 *
 * Dali em diante tudo sai com o token da página: responder (`/{page}/messages`),
 * "digitando…", o nome e a foto de quem escreveu.
 *
 * Toda falha vira `MessengerApiError`, com o status e a mensagem que a Meta deu —
 * é o que aparece para quem conecta, e "falhou" sem motivo não ajuda ninguém a
 * achar a permissão que faltou.
 */
import { graphVersion } from "@/lib/graph-version";

const GRAPH = "https://graph.facebook.com";
const DIALOGO = "https://www.facebook.com";

const v = (): string => graphVersion();

/**
 * O mínimo para atender pela página. `pages_manage_metadata` é o que deixa ligar
 * os avisos (`subscribed_apps`); `pages_read_engagement` é exigido junto pela
 * Meta para ler a página. Pedir mais atrasa a análise do app sem ganho.
 */
export const PERMISSOES_DO_MESSENGER = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
] as const;

/**
 * Os avisos que cada página passa a mandar. `message_echoes` é o que traz a
 * resposta dada POR FORA do CRM (caixa de entrada da Meta, celular) — sem ele,
 * a IA continuaria respondendo por cima de uma pessoa.
 */
export const AVISOS_DA_PAGINA = [
  "messages",
  "messaging_postbacks",
  "message_echoes",
  "message_deliveries",
  "message_reads",
  "messaging_referrals",
] as const;

const TETO_MS = 15_000;

export class MessengerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detalhe: string,
    public readonly onde: string,
    /** O `error.code` da Graph — 10/200/230 = permissão; 551 = pessoa indisponível. */
    public readonly codigo: number | null = null,
  ) {
    super(`messenger_${status}: ${detalhe}`);
  }
}

export interface PaginaAutorizada {
  id: string;
  name: string;
  accessToken: string;
  /** Pode atender mensagens? Só quem tem a tarefa MESSAGING (ou MODERATE) na página. */
  podeAtender: boolean;
  pictureUrl: string | null;
}

export interface PerfilDoContato {
  nome: string | null;
  fotoUrl: string | null;
}

type Buscar = typeof fetch;

async function chamar<T>(buscar: Buscar, onde: string, url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await buscar(url, { ...init, redirect: "error", signal: AbortSignal.timeout(TETO_MS) });
  } catch (err) {
    throw new MessengerApiError(0, err instanceof Error ? err.message : String(err), onde);
  }
  const texto = await res.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }
  if (!res.ok) {
    const erro = (corpo as { error?: { message?: string; code?: number } } | null)?.error;
    throw new MessengerApiError(res.status, erro?.message ?? texto.slice(0, 200), onde, typeof erro?.code === "number" ? erro.code : null);
  }
  return corpo as T;
}

const comToken = (token: string, extra: Record<string, string> = {}): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  ...extra,
});

/** Para onde mandar o navegador de quem vai conectar a página. */
export function urlDeAutorizacao(p: { appId: string; redirectUri: string; state: string; configId: string | null }): string {
  const q = new URLSearchParams({ client_id: p.appId, redirect_uri: p.redirectUri, response_type: "code", state: p.state });
  // App do tipo Empresa: as permissões moram na configuração do login, e a lista
  // avulsa é ignorada. Sem configuração, a lista vale.
  if (p.configId) q.set("config_id", p.configId);
  else q.set("scope", PERMISSOES_DO_MESSENGER.join(","));
  return `${DIALOGO}/${v()}/dialog/oauth?${q.toString()}`;
}

/** Código da volta → token de usuário de LONGA duração (o que gera token de página que não expira). */
export async function trocarCodigoPorTokenLongo(
  p: { appId: string; appSecret: string; redirectUri: string; code: string },
  buscar: Buscar = fetch,
): Promise<string> {
  const curto = await chamar<{ access_token?: string }>(
    buscar,
    "troca_do_codigo",
    `${GRAPH}/${v()}/oauth/access_token?${new URLSearchParams({
      client_id: p.appId,
      client_secret: p.appSecret,
      redirect_uri: p.redirectUri,
      code: p.code,
    }).toString()}`,
  );
  if (!curto.access_token) throw new MessengerApiError(200, "a Meta não devolveu token", "troca_do_codigo");
  const longo = await chamar<{ access_token?: string }>(
    buscar,
    "token_longo",
    `${GRAPH}/${v()}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: p.appId,
      client_secret: p.appSecret,
      fb_exchange_token: curto.access_token,
    }).toString()}`,
  );
  if (!longo.access_token) throw new MessengerApiError(200, "a Meta não devolveu token de longa duração", "token_longo");
  return longo.access_token;
}

/** As páginas que a pessoa autorizou no consentimento, com o token de cada uma. */
export async function listarPaginas(tokenDoUsuario: string, buscar: Buscar = fetch): Promise<PaginaAutorizada[]> {
  const paginas: PaginaAutorizada[] = [];
  let url: string | null = `${GRAPH}/${v()}/me/accounts?${new URLSearchParams({
    fields: "id,name,access_token,tasks,picture{url}",
    limit: "100",
  }).toString()}`;
  // A paginação da Graph devolve a próxima URL pronta. Teto de 10 voltas: ninguém
  // administra mil páginas, e um laço sem teto num `next` malformado não termina.
  for (let volta = 0; url && volta < 10; volta += 1) {
    const corpo: {
      data?: { id?: string; name?: string; access_token?: string; tasks?: string[]; picture?: { data?: { url?: string } } }[];
      paging?: { next?: string };
    } = await chamar(buscar, "paginas", url, { headers: comToken(tokenDoUsuario) });
    for (const p of corpo.data ?? []) {
      if (!p.id || !p.access_token) continue;
      const tarefas = p.tasks ?? [];
      paginas.push({
        id: p.id,
        name: p.name ?? p.id,
        accessToken: p.access_token,
        podeAtender: tarefas.includes("MESSAGING") || tarefas.includes("MODERATE") || tarefas.includes("MANAGE"),
        pictureUrl: p.picture?.data?.url ?? null,
      });
    }
    const proxima: string | undefined = corpo.paging?.next;
    url = proxima && proxima.startsWith(`${GRAPH}/`) ? proxima : null;
  }
  return paginas;
}

/**
 * Liga o webhook do APP para o objeto "página" — idempotente, a Meta substitui o
 * que houver. É o passo que hoje se faz à mão no painel; feito daqui, a primeira
 * página conectada já recebe. A Meta chama o handshake da nossa URL DURANTE este
 * pedido, então a rota GET precisa estar no ar.
 */
export async function assinarWebhookDoApp(
  p: { appId: string; appSecret: string; callbackUrl: string; verifyToken: string },
  buscar: Buscar = fetch,
): Promise<void> {
  await chamar(buscar, "webhook_do_app", `${GRAPH}/${v()}/${encodeURIComponent(p.appId)}/subscriptions`, {
    method: "POST",
    body: new URLSearchParams({
      object: "page",
      callback_url: p.callbackUrl,
      verify_token: p.verifyToken,
      fields: AVISOS_DA_PAGINA.join(","),
      include_values: "true",
      access_token: `${p.appId}|${p.appSecret}`,
    }),
  });
}

/** Liga os avisos DESTA página no nosso app. */
export async function assinarAvisosDaPagina(pageId: string, tokenDaPagina: string, buscar: Buscar = fetch): Promise<void> {
  const r = await chamar<{ success?: boolean }>(
    buscar,
    "avisos_da_pagina",
    `${GRAPH}/${v()}/${encodeURIComponent(pageId)}/subscribed_apps`,
    {
      method: "POST",
      headers: comToken(tokenDaPagina),
      body: new URLSearchParams({ subscribed_fields: AVISOS_DA_PAGINA.join(",") }),
    },
  );
  if (r.success !== true) throw new MessengerApiError(200, "a Meta não confirmou os avisos da página", "avisos_da_pagina");
}

/** Desliga os avisos desta página no nosso app (ao desconectar). */
export async function cancelarAvisosDaPagina(pageId: string, tokenDaPagina: string, buscar: Buscar = fetch): Promise<void> {
  await chamar(buscar, "cancelar_avisos", `${GRAPH}/${v()}/${encodeURIComponent(pageId)}/subscribed_apps`, {
    method: "DELETE",
    headers: comToken(tokenDaPagina),
  });
}

/** Os avisos desta página estão ligados no NOSSO app? É a pergunta da saúde do canal. */
export async function avisosLigados(pageId: string, tokenDaPagina: string, appId: string, buscar: Buscar = fetch): Promise<boolean> {
  const r = await chamar<{ data?: { id?: string; subscribed_fields?: string[] }[] }>(
    buscar,
    "saude",
    `${GRAPH}/${v()}/${encodeURIComponent(pageId)}/subscribed_apps`,
    { headers: comToken(tokenDaPagina) },
  );
  const nosso = (r.data ?? []).find((a) => a.id === appId);
  return !!nosso && (nosso.subscribed_fields ?? []).includes("messages");
}

/** Tipo do anexo no Messenger. Documento sai como `file`. */
export type TipoDeAnexo = "image" | "video" | "audio" | "file";

export type ConteudoDoEnvio = { texto: string } | { anexo: { tipo: TipoDeAnexo; url: string } };

/**
 * Responde a pessoa (`RESPONSE` = dentro da janela de 24h; fora dela a Meta recusa
 * e quem decide o que fazer é a cadeia antes do envio, não este módulo).
 * Devolve o `message_id` — o mesmo `mid` que volta no eco do webhook.
 */
export async function enviarMensagem(
  p: { pageId: string; tokenDaPagina: string; psid: string; conteudo: ConteudoDoEnvio; respondeA?: string | null },
  buscar: Buscar = fetch,
): Promise<string> {
  const message =
    "texto" in p.conteudo
      ? { text: p.conteudo.texto }
      : { attachment: { type: p.conteudo.anexo.tipo, payload: { url: p.conteudo.anexo.url, is_reusable: false } } };
  const r = await chamar<{ message_id?: string }>(buscar, "envio", `${GRAPH}/${v()}/${encodeURIComponent(p.pageId)}/messages`, {
    method: "POST",
    headers: comToken(p.tokenDaPagina, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      recipient: { id: p.psid },
      messaging_type: "RESPONSE",
      message: p.respondeA ? { ...message, reply_to: { mid: p.respondeA } } : message,
    }),
  });
  if (!r.message_id) throw new MessengerApiError(200, "envio sem confirmação da Meta", "envio");
  return r.message_id;
}

/** "Digitando…" na conversa da pessoa. */
export async function sinalizarDigitando(
  p: { pageId: string; tokenDaPagina: string; psid: string },
  buscar: Buscar = fetch,
): Promise<void> {
  await chamar(buscar, "digitando", `${GRAPH}/${v()}/${encodeURIComponent(p.pageId)}/messages`, {
    method: "POST",
    headers: comToken(p.tokenDaPagina, { "Content-Type": "application/json" }),
    body: JSON.stringify({ recipient: { id: p.psid }, sender_action: "typing_on" }),
  });
}

/**
 * Nome e foto de quem escreveu. O aviso do Messenger NÃO traz nome — sem esta
 * leitura todo contato novo apareceria como um número opaco.
 */
export async function lerPerfil(psid: string, tokenDaPagina: string, buscar: Buscar = fetch): Promise<PerfilDoContato> {
  const r = await chamar<{ first_name?: string; last_name?: string; name?: string; profile_pic?: string }>(
    buscar,
    "perfil",
    `${GRAPH}/${v()}/${encodeURIComponent(psid)}?fields=first_name,last_name,profile_pic`,
    { headers: comToken(tokenDaPagina) },
  );
  const nome = [r.first_name, r.last_name].filter((s): s is string => !!s && s.trim() !== "").join(" ").trim();
  return { nome: nome !== "" ? nome : (r.name ?? null), fotoUrl: r.profile_pic ?? null };
}
