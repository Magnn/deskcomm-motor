/**
 * ATIVAR NA META TUDO O QUE O PRODUTO USA DO APP — num clique, e conferido.
 *
 * Antes, cada peça se ligava num lugar: o endereço do WhatsApp por um botão em
 * /admin/meta, o das páginas (Messenger) só quando a PRIMEIRA página era
 * conectada, e os endereços públicos do app (domínio, privacidade, termos) à mão
 * no painel. Quem trocava de app — em 15/10/2026, porque o portfólio dono do
 * anterior foi banido — tinha de lembrar de todas, e a que faltasse aparecia
 * como "mensagem que não chega", dias depois.
 *
 * Aqui o servidor faz o que a Graph deixa fazer com o token do app e, no fim,
 * PERGUNTA à Meta o que ficou valendo (`GET /{app}/subscriptions`): o quadro da
 * tela é a resposta dela, não a nossa expectativa.
 *
 * O que a Graph NÃO deixa fazer com o token do app fica fora daqui e aparece na
 * tela como passo do painel (`PASSOS_DO_PAINEL`): criar a configuração do login
 * com token que não expira, pedir acesso avançado às permissões, verificar a
 * empresa e virar provedor de tecnologia.
 *
 * Cada passo é independente: um recusado não impede os outros, e nenhum lança.
 * Segredo e token vão no CORPO, nunca na URL (CLAUDE.md, anti-pattern 12).
 */
import { graphVersion } from "@/lib/graph-version";
import { AVISOS_DA_PAGINA } from "@/lib/channels/messenger/api";

import { CAMPOS_DO_WEBHOOK_DO_APP, registrarWebhookDoApp } from "./webhook-do-app";

const GRAPH = "https://graph.facebook.com";
const TETO_MS = 20_000;

type Buscar = typeof fetch;

export type ChaveDoPasso = "webhook_whatsapp" | "webhook_paginas" | "enderecos_do_app";

export interface ResultadoDoPasso {
  readonly chave: ChaveDoPasso;
  readonly ok: boolean;
  /** O que a Meta disse quando recusou, ou o que faltou na conferência. */
  readonly motivo: string | null;
}

/** Os endereços da instalação que a Meta pede ao app. */
export function enderecosDaInstalacao(base: string): {
  readonly dominio: string;
  readonly webhookWhatsapp: string;
  readonly webhookPaginas: string;
  readonly privacidade: string;
  readonly termos: string;
  readonly exclusaoDeDados: string;
} {
  const b = base.replace(/\/+$/, "");
  return {
    dominio: new URL(b).hostname,
    webhookWhatsapp: `${b}/api/v1/webhooks/meta`,
    webhookPaginas: `${b}/api/v1/webhooks/messenger`,
    privacidade: `${b}/legal/privacy`,
    termos: `${b}/legal/terms`,
    exclusaoDeDados: `${b}/legal/data-deletion`,
  };
}

interface RespostaDaGraph<T> {
  ok: boolean;
  corpo: T | null;
  motivo: string;
}

async function chamar<T>(
  buscar: Buscar,
  caminho: string,
  p: { metodo?: "GET" | "POST"; parametros: Record<string, string> },
): Promise<RespostaDaGraph<T>> {
  let res: Response;
  try {
    // Leitura também vai por POST com `method=GET`: o token do app nunca na URL.
    res = await buscar(`${GRAPH}/${graphVersion()}/${caminho}`, {
      method: "POST",
      body: new URLSearchParams(p.metodo === "POST" ? p.parametros : { method: "GET", ...p.parametros }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
  } catch (err) {
    return { ok: false, corpo: null, motivo: `rede indisponível: ${err instanceof Error ? err.message : "erro"}` };
  }
  const corpo = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string; error_user_msg?: string } })
    | null;
  if (!res.ok || corpo?.error) {
    return {
      ok: false,
      corpo: null,
      motivo: corpo?.error?.error_user_msg ?? corpo?.error?.message ?? `http_${res.status}`,
    };
  }
  return { ok: true, corpo, motivo: "" };
}

interface Assinatura {
  object?: string;
  callback_url?: string;
  active?: boolean;
  fields?: Array<{ name?: string } | string>;
}

/** O que a assinatura de um objeto deixa de cobrir. Pura. */
export function faltasDaAssinatura(
  assinaturas: readonly Assinatura[],
  objeto: string,
  url: string,
  campos: readonly string[],
): string | null {
  const a = assinaturas.find((s) => s.object === objeto);
  if (!a) return "a Meta não tem este endereço registrado";
  if (a.active === false) return "a assinatura está desligada na Meta";
  if (a.callback_url !== url) return `a Meta entrega em outro endereço: ${a.callback_url ?? "(nenhum)"}`;
  const tem = new Set((a.fields ?? []).map((f) => (typeof f === "string" ? f : (f.name ?? ""))));
  const faltam = campos.filter((c) => !tem.has(c));
  return faltam.length > 0 ? `faltam os avisos: ${faltam.join(", ")}` : null;
}

export async function ativarTudoNoAppDaMeta(
  p: { appId: string; appSecret: string; verifyToken: string; base: string },
  buscar: Buscar = fetch,
): Promise<ResultadoDoPasso[]> {
  const e = enderecosDaInstalacao(p.base);
  const tokenDoApp = `${p.appId}|${p.appSecret}`;
  const app = encodeURIComponent(p.appId);
  const recusas = new Map<ChaveDoPasso, string>();

  // 1 · WhatsApp: a assinatura do app para as contas do WhatsApp Business.
  const whatsapp = await registrarWebhookDoApp(
    { appId: p.appId, appSecret: p.appSecret, verifyToken: p.verifyToken, callbackUrl: e.webhookWhatsapp },
    buscar,
  );
  if (!whatsapp.ok) recusas.set("webhook_whatsapp", whatsapp.motivo);

  // 2 · Páginas (Messenger): antes só nascia na primeira página conectada.
  const paginas = await chamar<{ success?: boolean }>(buscar, `${app}/subscriptions`, {
    metodo: "POST",
    parametros: {
      object: "page",
      callback_url: e.webhookPaginas,
      verify_token: p.verifyToken,
      fields: AVISOS_DA_PAGINA.join(","),
      include_values: "true",
      access_token: tokenDoApp,
    },
  });
  if (!paginas.ok) recusas.set("webhook_paginas", paginas.motivo);

  // 3 · Os endereços públicos do app: sem domínio o SDK do Facebook não abre a
  //     janela de conexão, e sem privacidade/termos o app não vai para o modo Live.
  const enderecos = await chamar<{ success?: boolean }>(buscar, app, {
    metodo: "POST",
    parametros: {
      app_domains: JSON.stringify([e.dominio]),
      privacy_policy_url: e.privacidade,
      terms_of_service_url: e.termos,
      access_token: tokenDoApp,
    },
  });
  if (!enderecos.ok) recusas.set("enderecos_do_app", enderecos.motivo);

  // 4 · A conferência: o que a Meta diz que está valendo agora.
  const [assinaturas, dadosDoApp] = await Promise.all([
    chamar<{ data?: Assinatura[] }>(buscar, `${app}/subscriptions`, { parametros: { access_token: tokenDoApp } }),
    chamar<{ app_domains?: string[]; privacy_policy_url?: string; terms_of_service_url?: string }>(buscar, app, {
      parametros: { fields: "app_domains,privacy_policy_url,terms_of_service_url", access_token: tokenDoApp },
    }),
  ]);
  const lista = assinaturas.corpo?.data ?? [];
  const conferencia: Record<ChaveDoPasso, string | null> = {
    webhook_whatsapp: assinaturas.ok
      ? faltasDaAssinatura(lista, "whatsapp_business_account", e.webhookWhatsapp, CAMPOS_DO_WEBHOOK_DO_APP)
      : `não deu para conferir: ${assinaturas.motivo}`,
    webhook_paginas: assinaturas.ok
      ? faltasDaAssinatura(lista, "page", e.webhookPaginas, AVISOS_DA_PAGINA)
      : `não deu para conferir: ${assinaturas.motivo}`,
    enderecos_do_app: dadosDoApp.ok
      ? faltasDosEnderecos(dadosDoApp.corpo ?? {}, e)
      : `não deu para conferir: ${dadosDoApp.motivo}`,
  };

  return (["webhook_whatsapp", "webhook_paginas", "enderecos_do_app"] as const).map((chave) => {
    // Vale o ESTADO: se a Meta já tem tudo certo, o item está ativo mesmo que o
    // pedido tenha sido recusado (medido em 15/10/2026: app com a escrita de
    // configurações por API desligada, e domínio/termos já preenchidos à mão).
    // Faltando algo, a recusa dela explica melhor que a conferência.
    if (conferencia[chave] === null) return { chave, ok: true, motivo: null };
    const recusa = recusas.get(chave);
    return { chave, ok: false, motivo: recusa ? explicarRecusa(recusa) : conferencia[chave] };
  });
}

/**
 * A recusa da Meta, com o caminho do conserto quando ele é conhecido. Pura.
 * `(#10) Changing app settings through API calls has been disabled` = o app tem
 * desligada a chave "Permitir acesso à API às configurações do app".
 */
export function explicarRecusa(motivo: string): string {
  if (/changing app settings through api calls has been disabled/i.test(motivo)) {
    return `A Meta não deixa este aplicativo ser configurado por sistema. No painel dela, em Configurações do app › Avançado, ligue “Permitir acesso à API às configurações do app” e ative de novo, ou preencha domínio, política de privacidade e termos em Configurações › Básico. (${motivo})`;
  }
  return motivo;
}

/** O que falta nos endereços públicos do app. Pura. */
export function faltasDosEnderecos(
  app: { app_domains?: string[]; privacy_policy_url?: string; terms_of_service_url?: string },
  e: { dominio: string; privacidade: string; termos: string },
): string | null {
  const faltam: string[] = [];
  if (!(app.app_domains ?? []).includes(e.dominio)) faltam.push(`domínio ${e.dominio}`);
  if (!app.privacy_policy_url) faltam.push("política de privacidade");
  if (!app.terms_of_service_url) faltam.push("termos de serviço");
  return faltam.length > 0 ? `faltam: ${faltam.join(", ")}` : null;
}

/**
 * O que só o painel da Meta faz — a Graph não deixa o token do app fazer.
 * A tela mostra cada um com o link direto para o lugar certo do app.
 */
export const PERMISSOES_PARA_ACESSO_AVANCADO = [
  "whatsapp_business_management",
  "whatsapp_business_messaging",
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "pages_read_engagement",
  "ads_read",
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
] as const;

export function linksDoPainel(appId: string): {
  readonly loginParaEmpresas: string;
  readonly permissoes: string;
  readonly basico: string;
  readonly webhooks: string;
} {
  const a = `https://developers.facebook.com/apps/${encodeURIComponent(appId)}`;
  return {
    loginParaEmpresas: `${a}/business-login/configurations/`,
    permissoes: `${a}/app-review/permissions/`,
    basico: `${a}/settings/basic/`,
    webhooks: `${a}/webhooks/`,
  };
}
