/**
 * CONECTAR O META ADS PELO LOGIN DO FACEBOOK — o que a organização faz com um
 * clique, no lugar de gerar um token no Meta for Developers e colá-lo na tela.
 *
 * É o MESMO app da Meta do WhatsApp oficial e do Messenger (`appDaMeta()`): o
 * que muda é a permissão pedida (`ads_read`) e o endereço de volta. O token que
 * sai daqui vai para a mesma linha de `ad_insights_connections` que o token
 * colado — as rotas de leitura não sabem, nem precisam saber, por qual dos dois
 * caminhos ele chegou.
 *
 * ─── Quanto tempo o token dura ──────────────────────────────────────────────
 *
 * Com a lista de permissões avulsa, a Meta devolve um token de USUÁRIO de longa
 * duração: ~60 dias, e depois a tela de Meta Ads pede para reconectar (o mesmo
 * clique). Com `META_ADS_CONFIG_ID` apontando para uma configuração do "Login do
 * Facebook para Empresas" que emite token de usuário do sistema, ele não expira.
 */
import { appDaMeta } from "@/lib/channels/meta/app";
import { env } from "@/lib/env";
import { graphVersion } from "@/lib/graph-version";

import {
  emitirEstado as emitir,
  verificarEstado as verificar,
  type EstadoDaConexaoDeAds,
} from "../google/estado";

/** Só leitura: é o que a tela promete a quem conecta. */
export const PERMISSOES_DO_META_ADS = ["ads_read"] as const;

export interface AppDoMetaAds {
  appId: string;
  appSecret: string;
  /** Configuração do "Login do Facebook para Empresas", quando houver. */
  configId: string | null;
}

/** `null` = o login não está disponível nesta instalação; a tela cai para o token colado. */
export async function appDoMetaAds(): Promise<AppDoMetaAds | null> {
  const appId = (env.META_APP_ID ?? "").trim();
  const { appSecret } = await appDaMeta();
  if (appId === "" || !appSecret) return null;
  const configId = (env.META_ADS_CONFIG_ID ?? "").trim();
  return { appId, appSecret, configId: configId === "" ? null : configId };
}

/** Para onde a Meta devolve o navegador depois do consentimento. Tem de estar cadastrado no app. */
export function redirectDoMetaAds(): string {
  return `${(env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")}/api/v1/plataformas-de-anuncio/meta/callback`;
}

/** Para onde mandar o navegador de quem vai conectar a conta de anúncios. */
export function urlDeAutorizacao(p: { appId: string; redirectUri: string; state: string; configId: string | null }): string {
  const q = new URLSearchParams({ client_id: p.appId, redirect_uri: p.redirectUri, response_type: "code", state: p.state });
  // App do tipo Empresa: as permissões moram na configuração do login, e a lista
  // avulsa é ignorada. Sem configuração, a lista vale.
  if (p.configId) q.set("config_id", p.configId);
  else q.set("scope", PERMISSOES_DO_META_ADS.join(","));
  return `https://www.facebook.com/${graphVersion()}/dialog/oauth?${q.toString()}`;
}

/**
 * O `state` é o do Google Ads com o SEGREDO derivado pela finalidade: um `state`
 * emitido para conectar o Google não abre a volta da Meta, e vice-versa. Segredo
 * curto passa CRU para a construção de lá recusar.
 */
const comFinalidade = (segredo: string): string => {
  const s = segredo?.trim() ?? "";
  return s.length >= 16 ? `${s}:meta-ads` : s;
};

export function emitirEstado(
  dados: { organizationId: string; userId: string },
  opcoes: { segredo: string; agora: Date; nonce?: string },
): string {
  return emitir(dados, { ...opcoes, segredo: comFinalidade(opcoes.segredo) });
}

export function verificarEstado(
  token: string | null | undefined,
  opcoes: { segredo: string; agora: Date },
): EstadoDaConexaoDeAds | null {
  return verificar(token, { ...opcoes, segredo: comFinalidade(opcoes.segredo) });
}

/**
 * Qual conta a tela abre depois de conectar — para quem tem UMA conta ativa, a
 * conexão termina no clique, sem escolher nada.
 *
 * A escolha anterior é mantida enquanto o novo login ainda a alcança; uma conta
 * que saiu do alcance deixaria a tela de Meta Ads presa num erro de permissão.
 */
export function contaPadraoDepoisDeConectar(
  contas: readonly { id: string; status: number }[],
  anterior: string | null,
): string | null {
  if (anterior && contas.some((c) => c.id === anterior)) return anterior;
  const ativas = contas.filter((c) => c.status === 1);
  if (ativas.length === 1) return ativas[0]!.id;
  return contas.length === 1 ? contas[0]!.id : null;
}
