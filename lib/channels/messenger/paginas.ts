/**
 * AS PÁGINAS CONECTADAS — cada uma é uma linha de `channel_sessions` com
 * `provider = 'meta_messenger'`, e é isso que põe o Messenger no MESMO motor dos
 * outros canais: inbox, lead, agente, fluxo, opt-out, janela de 24h.
 *
 * Regras que moram aqui:
 *   - UMA página pertence a UMA organização. O índice único entre ativos
 *     (migration 0911) garante no banco; aqui a recusa vira motivo legível.
 *   - O token da página só existe CIFRADO (`fn_encrypt_oauth`) e nunca volta à
 *     tela.
 *   - Reconectar a mesma página atualiza o token e reacende o canal, sem criar
 *     linha nova — a conversa e o histórico continuam onde estavam.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { CHANNEL_PROVIDER_MESSENGER } from "../capabilities";
import { reactivateChannelSession } from "../reactivate";
import { cancelarAvisosDaPagina, type PaginaAutorizada } from "./api";

export class CifraIndisponivelError extends Error {
  constructor() {
    super("cifra_indisponivel");
  }
}

export interface PaginaConectada {
  id: string;
  pageId: string;
  nome: string | null;
  status: string;
  fotoUrl: string | null;
  conectadaEm: string;
  /** O que a Meta disse quando o recebimento não ligou — é o que a pessoa precisa para consertar. */
  falha: string | null;
}

export type DesfechoDaPagina =
  | { pageId: string; nome: string; resultado: "conectada" | "reconectada"; channelSessionId: string }
  | { pageId: string; nome: string; resultado: "de_outra_empresa" | "sem_permissao_de_mensagens" };

const COLUNAS = "id, organization_id, messenger_page_id, display_name, status, metadata, created_at, archived_at";

interface Linha {
  id: string;
  organization_id: string;
  messenger_page_id: string;
  display_name: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  archived_at: string | null;
}

/** As páginas ATIVAS da organização, para a tela. */
export async function paginasDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<PaginaConectada[]> {
  const { data, error } = await db
    .from("channel_sessions")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("provider", CHANNEL_PROVIDER_MESSENGER)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`messenger: leitura das páginas falhou: ${error.message}`);
  return ((data ?? []) as Linha[]).map((l) => ({
    id: l.id,
    pageId: l.messenger_page_id,
    nome: l.display_name,
    status: l.status,
    fotoUrl: typeof l.metadata?.page_picture_url === "string" ? l.metadata.page_picture_url : null,
    conectadaEm: l.created_at,
    falha: typeof l.metadata?.messenger_falha === "string" ? l.metadata.messenger_falha : null,
  }));
}

/**
 * A sessão ATIVA desta página, em qualquer organização — é o roteamento do
 * webhook, que chega assinado pelo app e diz só "página X". A organização sai
 * daqui, nunca do corpo.
 */
export async function sessaoDaPagina(
  db: SupabaseClient,
  pageId: string,
): Promise<{ id: string; organizationId: string } | null> {
  const { data, error } = await db
    .from("channel_sessions")
    .select("id, organization_id")
    .eq("provider", CHANNEL_PROVIDER_MESSENGER)
    .eq("messenger_page_id", pageId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`messenger: roteamento da página falhou: ${error.message}`);
  const l = data as { id: string; organization_id: string } | null;
  return l ? { id: l.id, organizationId: l.organization_id } : null;
}

/** O token da página, aberto — só para quem vai falar com a Meta agora. */
export async function tokenDaPagina(
  db: SupabaseClient,
  scope: { organizationId: string; pageId: string },
): Promise<string | null> {
  const { data, error } = await db
    .from("channel_sessions")
    .select("messenger_page_token_encrypted")
    .eq("organization_id", scope.organizationId)
    .eq("provider", CHANNEL_PROVIDER_MESSENGER)
    .eq("messenger_page_id", scope.pageId)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const cifrado = (data as { messenger_page_token_encrypted: string | null }).messenger_page_token_encrypted;
  return cifrado ? await decryptWebhookSecret(db, cifrado) : null;
}

/**
 * Grava a página como canal desta organização. NÃO liga os avisos — quem chama
 * faz isso depois, com o token, e marca a falha na linha se não der (a página
 * aparece na tela com o motivo, em vez de parecer conectada e nunca responder).
 */
export async function gravarPagina(
  db: SupabaseClient,
  input: { organizationId: string; userId: string; pagina: PaginaAutorizada },
): Promise<DesfechoDaPagina> {
  const { organizationId, pagina } = input;
  if (!pagina.podeAtender) return { pageId: pagina.id, nome: pagina.name, resultado: "sem_permissao_de_mensagens" };

  const tokenCifrado = await encryptWebhookSecret(db, pagina.accessToken);
  if (!tokenCifrado) throw new CifraIndisponivelError();

  // Só as páginas DESTA organização — a leitura nunca cruza tenant. Se outra
  // empresa tem a página ativa, quem diz é o índice único do banco (23505 no
  // insert ou na ressurreição abaixo), não uma leitura por cima de todas.
  const { data: daOrganizacao, error: erroLeitura } = await db
    .from("channel_sessions")
    .select("id, messenger_page_id, archived_at, metadata")
    .eq("organization_id", organizationId)
    .eq("provider", CHANNEL_PROVIDER_MESSENGER);
  if (erroLeitura) throw new Error(`messenger: leitura das páginas falhou: ${erroLeitura.message}`);
  const desta = ((daOrganizacao ?? []) as {
    id: string;
    messenger_page_id: string;
    archived_at: string | null;
    metadata: Record<string, unknown> | null;
  }[]).filter((l) => l.messenger_page_id === pagina.id);
  const linhaAtiva = desta.find((l) => l.archived_at === null) ?? null;
  // A excluída mais recente, se houver: é a que tem as conversas mais novas.
  const linhaArquivada =
    desta.filter((l) => l.archived_at !== null).sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)))[0] ?? null;

  const nome = `Messenger · ${pagina.name}`;
  const metadataDaVolta = (atual: Record<string, unknown> | null) => ({
    ...(atual ?? {}),
    social_platform: "facebook",
    page_picture_url: pagina.pictureUrl,
  });

  if (linhaAtiva) {
    const { error } = await db
      .from("channel_sessions")
      .update({ messenger_page_token_encrypted: tokenCifrado, display_name: nome, status: "STARTING", metadata: metadataDaVolta(linhaAtiva.metadata) })
      .eq("organization_id", organizationId)
      .eq("id", linhaAtiva.id);
    if (error) throw new Error(`messenger: atualização da página falhou: ${error.message}`);
    return { pageId: pagina.id, nome: pagina.name, resultado: "reconectada", channelSessionId: linhaAtiva.id };
  }

  // A página já foi desta organização e foi excluída: RESSUSCITA a mesma linha,
  // para as conversas e o histórico continuarem ligados a ela (e a volta ficar
  // auditada, pelo caminho único de `reactivateChannelSession`).
  if (linhaArquivada?.archived_at) {
    const { error } = await reactivateChannelSession(
      db,
      { organizationId, channelSessionId: linhaArquivada.id, archivedAt: linhaArquivada.archived_at },
      { messenger_page_token_encrypted: tokenCifrado, display_name: nome, status: "STARTING", metadata: metadataDaVolta(linhaArquivada.metadata) },
      { userId: input.userId, metadata: { provider: CHANNEL_PROVIDER_MESSENGER, page_id: pagina.id } },
    );
    // 23505 = outra empresa conectou a página enquanto ela estava excluída aqui.
    if (error?.code === "23505") return { pageId: pagina.id, nome: pagina.name, resultado: "de_outra_empresa" };
    if (error) throw new Error(`messenger: reativação da página falhou: ${error.message}`);
    return { pageId: pagina.id, nome: pagina.name, resultado: "reconectada", channelSessionId: linhaArquivada.id };
  }

  // A coluna é NOT NULL para todo canal: os canais por token assinam o próprio
  // webhook com ela. Aqui quem assina é o app inteiro (`appDaMeta`), e o valor
  // fica guardado sem uso — gerado, cifrado e nunca exposto, como nos demais.
  const segredoCifrado = await encryptWebhookSecret(db, randomBytes(32).toString("hex"));
  if (!segredoCifrado) throw new CifraIndisponivelError();

  const { data, error } = await db
    .from("channel_sessions")
    .insert({
      organization_id: organizationId,
      provider: CHANNEL_PROVIDER_MESSENGER,
      messenger_page_id: pagina.id,
      messenger_page_token_encrypted: tokenCifrado,
      webhook_secret_encrypted: segredoCifrado,
      display_name: nome,
      status: "STARTING",
      metadata: { ...metadataInicialDoCanal(), social_platform: "facebook", page_picture_url: pagina.pictureUrl },
    })
    .select("id")
    .single();
  // 23505 = a página está ativa em OUTRA organização (índice único entre ativos, 0911).
  if (error?.code === "23505") return { pageId: pagina.id, nome: pagina.name, resultado: "de_outra_empresa" };
  if (error || !data) throw new Error(`messenger: gravação da página falhou: ${error?.message ?? "sem id"}`);
  return { pageId: pagina.id, nome: pagina.name, resultado: "conectada", channelSessionId: (data as { id: string }).id };
}

/** O desfecho da ligação dos avisos, gravado na linha. */
export async function marcarEstadoDaPagina(
  db: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; ok: boolean; motivo?: string | null },
): Promise<void> {
  const { data } = await db
    .from("channel_sessions")
    .select("metadata")
    .eq("organization_id", input.organizationId)
    .eq("id", input.channelSessionId)
    .maybeSingle();
  const metadata = { ...((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) };
  if (input.ok) delete metadata.messenger_falha;
  else metadata.messenger_falha = (input.motivo ?? "").slice(0, 300);
  const { error } = await db
    .from("channel_sessions")
    .update({ status: input.ok ? "WORKING" : "FAILED", metadata })
    .eq("organization_id", input.organizationId)
    .eq("id", input.channelSessionId);
  if (error) throw new Error(`messenger: estado da página não gravado: ${error.message}`);
}

/**
 * Desliga os avisos da página no nosso app — chamado pela rota padrão de excluir
 * canal, ANTES de ela zerar o token (é ele que autoriza a chamada). Best-effort:
 * Meta fora do ar ou token já revogado vão para o desfecho, e NÃO impedem a
 * exclusão que a pessoa pediu.
 */
export async function desligarAvisosDaPagina(
  db: SupabaseClient,
  input: { pageId: string; tokenCifrado: string | null },
): Promise<"desfeito" | "sem_credencial" | "falhou"> {
  if (!input.tokenCifrado) return "sem_credencial";
  const token = await decryptWebhookSecret(db, input.tokenCifrado);
  if (!token) return "sem_credencial";
  try {
    await cancelarAvisosDaPagina(input.pageId, token);
    return "desfeito";
  } catch {
    return "falhou";
  }
}
