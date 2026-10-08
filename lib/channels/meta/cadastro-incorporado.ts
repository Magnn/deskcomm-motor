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
 * trocar o código, conferir que o token não vence e registrar o número na
 * Cloud API quando ele acabou de nascer na janela.
 *
 * ─── Por que o token que vence é RECUSADO ───────────────────────────────────
 *
 * A configuração do "Login do Facebook para Empresas" decide se o token dura
 * 60 dias ou não expira. Um canal de mensagem com token de 60 dias conecta,
 * funciona e para sozinho dois meses depois, sem aviso — pior que não conectar.
 * Quem resolve é quem administra a instalação, na configuração do login; a
 * recusa diz isso na hora, em vez de a descoberta ficar para o dia da parada.
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
import { env } from "@/lib/env";
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
  const appId = (env.META_APP_ID ?? "").trim();
  const configId = (env.META_WHATSAPP_CONFIG_ID ?? "").trim();
  const { appSecret } = await appDaMeta();
  if (appId === "" || configId === "" || !appSecret) return null;
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
  | { ok: true; token: string; phoneNumberId: string; wabaId: string }
  | {
      ok: false;
      falha: "troca_do_codigo" | "token_expira" | "nenhum_numero" | "varios_numeros";
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
  if (typeof dados.expires_at === "number" && dados.expires_at > 0) {
    return { ok: false, falha: "token_expira", detalhe: null };
  }

  const phoneNumberId = (p.phoneNumberId ?? "").trim();
  const wabaId = (p.wabaId ?? "").trim();
  if (phoneNumberId !== "" && wabaId !== "") return { ok: true, token, phoneNumberId, wabaId };

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
  return { ok: true, token, ...numeros[0]! };
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
): Promise<{ ok: true; registrou: boolean } | { ok: false; motivo: string }> {
  const id = encodeURIComponent(p.phoneNumberId);
  const estado = await chamar<{ platform_type?: string }>(buscar, id, {
    parametros: { fields: "platform_type" },
    token: p.token,
  });
  if (!estado.ok) return { ok: false, motivo: estado.motivo };
  if (estado.corpo?.platform_type === "CLOUD_API") return { ok: true, registrou: false };

  const registro = await chamar<{ success?: boolean }>(buscar, `${id}/register`, {
    metodo: "POST",
    parametros: { messaging_product: "whatsapp", pin: pinDoNumero(p.phoneNumberId, p.segredoDoPin) },
    token: p.token,
  });
  if (!registro.ok) return { ok: false, motivo: registro.motivo };
  return { ok: true, registrou: true };
}
