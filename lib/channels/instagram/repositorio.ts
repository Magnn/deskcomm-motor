/**
 * O banco do "comentou, recebe direct": conexões, regras e o registro dos
 * comentários atendidos. Cliente de serviço, sempre filtrando a organização — as
 * três tabelas são deny-all (migration 0910).
 *
 * O token da conta é CIFRADO em repouso (a mesma cifra dos outros segredos de
 * integração) e só é decifrado no caminho que fala com o Instagram. Nenhuma
 * função de leitura para tela devolve o token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { enviarRespostaPrivada, responderComentario, type ContaDoInstagram } from "./api";
import type { ConexaoParaComentarios, DepsDosComentarios } from "./comentarios";
import type { RegraDeComentario } from "./regras";

type Admin = SupabaseClient;

export interface ConexaoDoInstagram {
  id: string;
  username: string;
  name: string | null;
  profile_picture_url: string | null;
  status: "active" | "error";
  status_reason: string | null;
  token_expires_at: string | null;
  created_at: string;
}

export interface RegraSalva extends RegraDeComentario {
  connection_id: string;
  name: string;
  created_at: string;
}

export interface EventoDeComentario {
  id: string;
  rule_id: string | null;
  from_username: string | null;
  comment_text: string | null;
  dm_status: string;
  public_reply_status: string;
  error: string | null;
  created_at: string;
}

const COLUNAS_DA_CONEXAO = "id, username, name, profile_picture_url, status, status_reason, token_expires_at, created_at";
const COLUNAS_DA_REGRA =
  "id, connection_id, name, is_active, post_scope, post_ids, match_type, keywords, dm_message, public_replies, created_at";

export class ContaDeOutraOrganizacaoError extends Error {
  constructor() {
    super("instagram_conta_de_outra_organizacao");
  }
}
export class CifraIndisponivelError extends Error {
  constructor() {
    super("instagram_cifra_indisponivel");
  }
}

/**
 * Grava (ou atualiza) a conexão da conta. Uma conta do Instagram pertence a UMA
 * organização: reconectar na mesma atualiza o token; tentar em outra é recusado —
 * o aviso de comentário traz só o id da conta, e com duas donas não haveria como
 * saber de quem é a regra.
 */
export async function salvarConexao(
  admin: Admin,
  p: { organizationId: string; userId: string; conta: ContaDoInstagram; token: string; expiraEm: Date | null },
): Promise<ConexaoDoInstagram> {
  const cifrado = await encryptWebhookSecret(admin, p.token);
  if (!cifrado) throw new CifraIndisponivelError();

  const { data: existente, error: erroDaBusca } = await admin
    .from("instagram_connections")
    .select("id, organization_id")
    .eq("ig_user_id", p.conta.userId)
    .maybeSingle();
  if (erroDaBusca) throw new Error(`instagram: busca da conexão falhou: ${erroDaBusca.message}`);
  const atual = existente as { id: string; organization_id: string } | null;
  if (atual && atual.organization_id !== p.organizationId) throw new ContaDeOutraOrganizacaoError();

  const linha = {
    organization_id: p.organizationId,
    ig_id: p.conta.id,
    ig_user_id: p.conta.userId,
    username: p.conta.username,
    name: p.conta.name,
    profile_picture_url: p.conta.profilePictureUrl,
    access_token_encrypted: cifrado,
    token_expires_at: p.expiraEm?.toISOString() ?? null,
    status: "active",
    status_reason: null,
  };
  const gravacao = atual
    ? admin.from("instagram_connections").update(linha).eq("id", atual.id)
    : admin.from("instagram_connections").insert({ ...linha, created_by: p.userId });
  const { data, error } = await gravacao.select(COLUNAS_DA_CONEXAO).single();
  if (error) {
    // Corrida de duas conexões da mesma conta em organizações diferentes: o índice único decide.
    if (error.code === "23505") throw new ContaDeOutraOrganizacaoError();
    throw new Error(`instagram: gravação da conexão falhou: ${error.message}`);
  }
  return data as ConexaoDoInstagram;
}

export async function listarConexoes(admin: Admin, organizationId: string): Promise<ConexaoDoInstagram[]> {
  const { data, error } = await admin
    .from("instagram_connections")
    .select(COLUNAS_DA_CONEXAO)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`instagram: leitura das conexões falhou: ${error.message}`);
  return (data ?? []) as ConexaoDoInstagram[];
}

/** O token decifrado de UMA conexão da organização — para listar publicações e desconectar. */
export async function tokenDaConexao(admin: Admin, organizationId: string, conexaoId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("instagram_connections")
    .select("access_token_encrypted")
    .eq("organization_id", organizationId)
    .eq("id", conexaoId)
    .maybeSingle();
  if (error) throw new Error(`instagram: leitura do token falhou: ${error.message}`);
  const cifrado = (data as { access_token_encrypted: string } | null)?.access_token_encrypted;
  return cifrado ? await decryptWebhookSecret(admin, cifrado) : null;
}

export async function removerConexao(admin: Admin, organizationId: string, conexaoId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("instagram_connections")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", conexaoId)
    .select("id");
  if (error) throw new Error(`instagram: remoção da conexão falhou: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function listarRegrasDaOrganizacao(admin: Admin, organizationId: string): Promise<RegraSalva[]> {
  const { data, error } = await admin
    .from("instagram_comment_rules")
    .select(COLUNAS_DA_REGRA)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`instagram: leitura das regras falhou: ${error.message}`);
  return (data ?? []) as RegraSalva[];
}

export async function listarEventos(admin: Admin, organizationId: string, limite = 50): Promise<EventoDeComentario[]> {
  const { data, error } = await admin
    .from("instagram_comment_events")
    .select("id, rule_id, from_username, comment_text, dm_status, public_reply_status, error, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`instagram: leitura do registro falhou: ${error.message}`);
  return (data ?? []) as EventoDeComentario[];
}

/** As pontas de verdade do atendimento de comentário. */
export function depsReaisDosComentarios(admin: Admin): DepsDosComentarios {
  return {
    async acharConexao(contaId): Promise<ConexaoParaComentarios | null> {
      // A Meta chama a conta por um de dois ids, conforme o aviso: confere os dois.
      for (const coluna of ["ig_user_id", "ig_id"] as const) {
        const { data, error } = await admin
          .from("instagram_connections")
          .select("id, organization_id, ig_id, ig_user_id, access_token_encrypted, status")
          .eq(coluna, contaId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(`instagram: busca da conta do aviso falhou: ${error.message}`);
        const l = data as { id: string; organization_id: string; ig_id: string; ig_user_id: string; access_token_encrypted: string } | null;
        if (!l) continue;
        const token = await decryptWebhookSecret(admin, l.access_token_encrypted);
        if (!token) return null;
        return { id: l.id, organizationId: l.organization_id, igId: l.ig_id, igUserId: l.ig_user_id, token };
      }
      return null;
    },

    async listarRegras(conexaoId) {
      const { data, error } = await admin
        .from("instagram_comment_rules")
        .select("id, is_active, post_scope, post_ids, match_type, keywords, dm_message, public_replies")
        .eq("connection_id", conexaoId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`instagram: leitura das regras do aviso falhou: ${error.message}`);
      return (data ?? []) as RegraDeComentario[];
    },

    async registrar({ organizationId, conexaoId, regraId, comentario }) {
      const { data, error } = await admin
        .from("instagram_comment_events")
        .insert({
          organization_id: organizationId,
          connection_id: conexaoId,
          rule_id: regraId,
          comment_id: comentario.commentId,
          media_id: comentario.mediaId,
          from_id: comentario.autorId,
          from_username: comentario.autorUsername,
          comment_text: comentario.texto.slice(0, 2000),
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") return null;
        throw new Error(`instagram: registro do comentário falhou: ${error.message}`);
      }
      return data as { id: string };
    },

    async concluir(eventoId, desfecho) {
      const { error } = await admin
        .from("instagram_comment_events")
        .update({ dm_status: desfecho.dm, public_reply_status: desfecho.publica, error: desfecho.erro })
        .eq("id", eventoId);
      if (error) throw new Error(`instagram: desfecho do comentário não foi gravado: ${error.message}`);
    },

    enviarRespostaPrivada: (token, commentId, texto) => enviarRespostaPrivada(token, commentId, texto),
    responderComentario: (token, commentId, texto) => responderComentario(token, commentId, texto),
  };
}
