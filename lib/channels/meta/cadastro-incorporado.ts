/**
 * CONECTAR O WHATSAPP OFICIAL PELO LOGIN DO FACEBOOK — o Cadastro Incorporado
 * da Meta, no lugar de copiar três valores do painel dela.
 *
 * A pessoa clica em "Conectar com Facebook", escolhe (ou cria) a conta do
 * WhatsApp Business e o número na janela da própria Meta, e a janela devolve:
 *
 *   - um CÓDIGO, que só o servidor troca pelo token (exige o segredo do app);
 *   - o id da conta e o id do número escolhidos, num aviso do navegador.
 *
 * Daqui sai a mesma trinca que o formulário colado entrega (número, conta,
 * token), e a rota segue pelo MESMO caminho: valida com a Meta, grava cifrado,
 * registra o webhook. Este módulo só acrescenta o que o colado não precisava:
 * trocar o código, saber quando o token vence e registrar o número na Cloud
 * API quando ele acabou de nascer na janela.
 *
 * ─── O token de 60 dias é ACEITO e renovado ─────────────────────────────────
 *
 * A configuração do "Login do Facebook para Empresas" decide se o token dura
 * 60 dias ou não expira. Até 16/10/2026 o de 60 dias era recusado, porque o
 * canal conectaria e pararia sozinho dois meses depois. Só que a Meta oferece a
 * opção "Nunca" apenas a app que já é Provedor de Tecnologia: medido no painel,
 * um app novo só tem o modelo de 60 dias, com a expiração travada. Recusar
 * deixava a instalação sem canal oficial nenhum.
 *
 * Agora a data de vencimento vai junto da credencial (`expiraEm`), a rota a
 * grava em `channel_sessions.meta_token_expires_at`, e o cron `meta-tokens`
 * troca o token por outro de 60 dias antes do fim (`renovarTokenDoNumero`).
 *
 * ─── O PIN do registro ──────────────────────────────────────────────────────
 *
 * Registrar um número na Cloud API exige definir o PIN da verificação em duas
 * etapas dele. O PIN é DERIVADO (HMAC do id do número com o segredo da
 * instalação), não sorteado: registrar de novo o mesmo número chega ao mesmo
 * PIN sem que ele precise ser guardado em lugar nenhum.
 *
 * Token e segredo vão no CORPO, nunca na URL (CLAUDE.md, anti-pattern 12): a
 * Graph aceita `POST` com `method=GET`.
 */
import { createHmac } from "node:crypto";

import { appDaMeta } from "@/lib/channels/meta/app";
import { graphVersion } from "@/lib/graph-version";

const GRAPH = "https://graph.facebook.com";
const TETO_MS = 15_000;

/** As permissões cujo alcance (`target_ids`) são contas do WhatsApp Business. */
const ESCOPOS_DO_WHATSAPP = new Set(["whatsapp_business_management", "whatsapp_business_messaging"]);

type Buscar = typeof fetch;

export interface AppDoCadastroIncorporado {
  appId: string;
  appSecret: string;
  /** A configuração do "Login do Facebook para Empresas" com o Cadastro Incorporado. */
  configId: string;
}

/**
 * `null` = o login não está disponível nesta instalação, e a tela fica só com
 * o formulário. A configuração é obrigatória aqui (no Messenger e no Meta Ads
 * ela é opcional): a janela do Cadastro Incorporado só abre a partir dela.
 */
export async function appDoCadastroIncorporado(): Promise<AppDoCadastroIncorporado | null> {
  const { appId, appSecret, whatsappConfigId: configId } = await appDaMeta();
  if (!appId || !configId || !appSecret) return null;
  return { appId, appSecret, configId };
}

interface RespostaDaGraph<T> {
  ok: boolean;
  corpo: T | null;
  /** O motivo que a Meta deu — `error_data.details` é o que diferencia os casos. */
  motivo: string;
}

async function chamar<T>(
  buscar: Buscar,
  caminho: string,
  p: { metodo?: "GET" | "POST"; parametros?: Record<string, string>; token?: string },
): Promise<RespostaDaGraph<T>> {
  let res: Response;
  try {
    res = await buscar(`${GRAPH}/${graphVersion()}/${caminho}`, {
      method: "POST",
      headers: p.token ? { Authorization: `Bearer ${p.token}` } : undefined,
      body: new URLSearchParams({ ...(p.metodo === "POST" ? {} : { method: "GET" }), ...(p.parametros ?? {}) }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
  } catch (err) {
    // Rede caída não é credencial ruim — o motivo precisa dizer isso.
    return { ok: false, corpo: null, motivo: `rede indisponível: ${err instanceof Error ? err.message : "erro"}` };
  }
  const texto = await res.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }
  const erro = (corpo as { error?: { message?: string; error_data?: { details?: string } } } | null)?.error;
  if (!res.ok || erro) {
    return { ok: false, corpo: null, motivo: erro?.error_data?.details ?? erro?.message ?? `http_${res.status}` };
  }
  return { ok: true, corpo: corpo as T, motivo: "" };
}

export interface NumeroDaConta {
  phoneNumberId: string;
  wabaId: string;
}

export type CredencialDoCadastro =
  | {
      ok: true;
      token: string;
      phoneNumberId: string;
      wabaId: string;
      /** Quando o token vence. `null` = não vence (ou a Meta não disse). */
      expiraEm: Date | null;
    }
  | {
      ok: false;
      falha: "troca_do_codigo" | "nenhum_numero" | "varios_numeros";
      /** O que a Meta disse, quando foi ela quem recusou. */
      detalhe: string | null;
    };

/**
 * Código da janela → a trinca que conecta o canal.
 *
 * `phoneNumberId` e `wabaId` vêm do aviso que a janela manda ao navegador. Se o
 * aviso não chegou, os dois são lidos do próprio token: as contas que a pessoa
 * concedeu estão em `granular_scopes`, e com UM número ao alcance não há o que
 * escolher. Com vários, a resposta é pedir de novo — adivinhar conectaria o
 * número errado.
 */
export async function credencialDoCadastroIncorporado(
  p: { app: AppDoCadastroIncorporado; code: string; phoneNumberId?: string | null; wabaId?: string | null },
  buscar: Buscar = fetch,
): Promise<CredencialDoCadastro> {
  // Sem `redirect_uri`: o código nasceu na janela aberta pelo SDK, não numa volta.
  const troca = await chamar<{ access_token?: string }>(buscar, "oauth/access_token", {
    parametros: { client_id: p.app.appId, client_secret: p.app.appSecret, code: p.code },
  });
  const token = troca.corpo?.access_token;
  if (!troca.ok || !token) {
    return { ok: false, falha: "troca_do_codigo", detalhe: troca.ok ? "a Meta não devolveu token" : troca.motivo };
  }

  // Inspeção que falha não derruba a conexão: ela só responde duas perguntas
  // (vence? quais contas?) e a validação com a Meta, logo depois, ainda roda.
  const inspecao = await chamar<{
    data?: { expires_at?: number; granular_scopes?: { scope?: string; target_ids?: string[] }[] };
  }>(buscar, "debug_token", {
    parametros: { input_token: token, access_token: `${p.app.appId}|${p.app.appSecret}` },
  });
  const dados = inspecao.corpo?.data ?? {};
  // `expires_at: 0` é como a Meta escreve "não expira".
  const expiraEm =
    typeof dados.expires_at === "number" && dados.expires_at > 0 ? new Date(dados.expires_at * 1000) : null;

  const phoneNumberId = (p.phoneNumberId ?? "").trim();
  const wabaId = (p.wabaId ?? "").trim();
  if (phoneNumberId !== "" && wabaId !== "") return { ok: true, token, phoneNumberId, wabaId, expiraEm };

  const contas = new Set<string>();
  for (const g of dados.granular_scopes ?? []) {
    if (!g.scope || !ESCOPOS_DO_WHATSAPP.has(g.scope)) continue;
    for (const id of g.target_ids ?? []) contas.add(String(id));
  }
  const numeros: NumeroDaConta[] = [];
  for (const conta of wabaId !== "" ? [wabaId] : contas) {
    const lista = await chamar<{ data?: { id?: string }[] }>(buscar, `${encodeURIComponent(conta)}/phone_numbers`, {
      parametros: { fields: "id", limit: "200" },
      token,
    });
    for (const n of lista.corpo?.data ?? []) {
      if (n.id) numeros.push({ phoneNumberId: n.id, wabaId: conta });
    }
  }
  if (numeros.length === 0) return { ok: false, falha: "nenhum_numero", detalhe: null };
  if (numeros.length > 1) return { ok: false, falha: "varios_numeros", detalhe: null };
  return { ok: true, token, ...numeros[0]!, expiraEm };
}

/**
 * Troca o token de 60 dias do número por outro de 60 dias, antes de ele vencer.
 *
 * É a renovação de token de usuário do sistema que vence, como a Meta a
 * documenta (Business Management APIs › System Users): `oauth/access_token` com
 * `grant_type=fb_exchange_token`, o ID e a chave do app, o token atual e
 * `set_token_expires_in_60_days=true`. Token vencido não renova — por isso o
 * cron age com folga.
 *
 * Chave e token no CORPO, nunca na URL (CLAUDE.md, anti-pattern 12).
 */
export async function renovarTokenDoNumero(
  p: { appId: string; appSecret: string; token: string },
  buscar: Buscar = fetch,
): Promise<{ ok: true; token: string; expiraEm: Date | null } | { ok: false; motivo: string }> {
  const r = await chamar<{ access_token?: string; expires_in?: number }>(buscar, "oauth/access_token", {
    parametros: {
      grant_type: "fb_exchange_token",
      client_id: p.appId,
      client_secret: p.appSecret,
      fb_exchange_token: p.token,
      set_token_expires_in_60_days: "true",
    },
  });
  const novo = r.corpo?.access_token;
  if (!r.ok || !novo) return { ok: false, motivo: r.ok ? "a Meta não devolveu token" : r.motivo };
  const segundos = r.corpo?.expires_in;
  return {
    ok: true,
    token: novo,
    expiraEm: typeof segundos === "number" && segundos > 0 ? new Date(Date.now() + segundos * 1000) : null,
  };
}

/** O PIN de duas etapas deste número: seis dígitos, sempre os mesmos para o mesmo número. */
export function pinDoNumero(phoneNumberId: string, segredo: string): string {
  const resumo = createHmac("sha256", segredo).update(`whatsapp-pin:${phoneNumberId}`).digest();
  return String(resumo.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/**
 * Número que acabou de nascer na janela ainda não está na Cloud API: sem o
 * registro ele valida, conecta e não envia nada. Número que já está lá fica
 * como está — registrar de novo trocaria o PIN de quem já tem um.
 */
export async function garantirNumeroRegistrado(
  p: { phoneNumberId: string; token: string; segredoDoPin: string },
  buscar: Buscar = fetch,
): Promise<{ ok: true; registrou: boolean; noAplicativo: boolean } | { ok: false; motivo: string }> {
  const id = encodeURIComponent(p.phoneNumberId);
  let estado = await chamar<{ platform_type?: string; is_on_biz_app?: boolean }>(buscar, id, {
    parametros: { fields: "platform_type,is_on_biz_app" },
    token: p.token,
  });
  // `is_on_biz_app` é campo recente: numa versão da Graph que não o conhece a
  // leitura inteira é recusada, e isso não pode impedir a conexão comum.
  if (!estado.ok) {
    estado = await chamar(buscar, id, { parametros: { fields: "platform_type" }, token: p.token });
  }
  if (!estado.ok) return { ok: false, motivo: estado.motivo };
  // COEXISTÊNCIA: o número continua no aplicativo WhatsApp Business do celular, e
  // é o aplicativo que o mantém registrado. Registrar daqui o tiraria de lá.
  if (estado.corpo?.is_on_biz_app === true) return { ok: true, registrou: false, noAplicativo: true };
  if (estado.corpo?.platform_type === "CLOUD_API") return { ok: true, registrou: false, noAplicativo: false };

  const registro = await chamar<{ success?: boolean }>(buscar, `${id}/register`, {
    metodo: "POST",
    parametros: { messaging_product: "whatsapp", pin: pinDoNumero(p.phoneNumberId, p.segredoDoPin) },
    token: p.token,
  });
  if (!registro.ok) return { ok: false, motivo: registro.motivo };
  return { ok: true, registrou: true, noAplicativo: false };
}

/**
 * COEXISTÊNCIA: pede à Meta a agenda e o histórico do aplicativo do celular.
 *
 * A Meta entrega os contatos pelo aviso `smb_app_state_sync` e as conversas
 * (até 180 dias) pelo aviso `history`, que o app precisa assinar
 * (`CAMPOS_DO_WEBHOOK_DO_APP`). Cada pedido só vale UMA vez e só nas 24 h
 * seguintes à conexão — depois disso, só desconectando e refazendo a janela. Por
 * isso saem aqui, logo depois de gravar o canal, e não ficam para um botão.
 *
 * O histórico só pode ser pedido porque a ingestão dele existe e não o trata
 * como entrada (`ingestMetaHistorico`, migration 0929): pedido antes, os 180
 * dias de conversa do cliente teriam sido jogados fora.
 *
 * `135000` = a Meta já recebeu este pedido antes (a pessoa reconectou o mesmo
 * número). Não é falha: o que foi pedido já veio ou está vindo.
 */
type PedidoDeSincronizacao = { ok: true; jaPedida: boolean } | { ok: false; motivo: string };

async function pedirSincronizacao(
  p: { phoneNumberId: string; token: string },
  syncType: "smb_app_state_sync" | "history",
  buscar: Buscar,
): Promise<PedidoDeSincronizacao> {
  let res: Response;
  try {
    res = await buscar(`${GRAPH}/${graphVersion()}/${encodeURIComponent(p.phoneNumberId)}/smb_app_data`, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
  } catch (err) {
    return { ok: false, motivo: `rede indisponível: ${err instanceof Error ? err.message : "erro"}` };
  }
  const corpo = (await res.json().catch(() => null)) as
    | { error?: { code?: number; message?: string; error_data?: { details?: string } } }
    | null;
  if (corpo?.error?.code === 135000) return { ok: true, jaPedida: true };
  if (!res.ok || corpo?.error) {
    return { ok: false, motivo: corpo?.error?.error_data?.details ?? corpo?.error?.message ?? `http_${res.status}` };
  }
  return { ok: true, jaPedida: false };
}

export async function pedirAgendaDoAplicativo(
  p: { phoneNumberId: string; token: string },
  buscar: Buscar = fetch,
): Promise<PedidoDeSincronizacao> {
  return pedirSincronizacao(p, "smb_app_state_sync", buscar);
}

/** A Meta pede a agenda ANTES do histórico; quem chama respeita a ordem. */
export async function pedirHistoricoDoAplicativo(
  p: { phoneNumberId: string; token: string },
  buscar: Buscar = fetch,
): Promise<PedidoDeSincronizacao> {
  return pedirSincronizacao(p, "history", buscar);
}
