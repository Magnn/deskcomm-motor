/**
 * OS BOTS CONECTADOS — cada um é uma linha de `channel_sessions` com
 * `provider = 'telegram_bot'`, no mesmo motor dos outros canais.
 *
 * Conectar é colar o token do BotFather:
 *
 *   formato → `getMe` (o token vale? de qual bot?) → grava o canal com o token
 *   CIFRADO → aponta o webhook do bot para a rota genérica por token, com um
 *   segredo que o Telegram devolve em todo aviso → WORKING, ou FAILED com o
 *   motivo que o Telegram deu.
 *
 * Regras que moram aqui:
 *   - toda leitura é da PRÓPRIA organização; quem diz que o bot já atende outra
 *     empresa é o índice único entre ativos (migration 0912), pelo 23505;
 *   - reconectar o mesmo bot troca o token e MANTÉM a URL e o segredo do webhook;
 *   - bot excluído antes RESSUSCITA a mesma linha (`reactivateChannelSession`),
 *     e as conversas continuam ligadas a ela.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { CHANNEL_PROVIDER_TELEGRAM } from "../capabilities";
import { reactivateChannelSession } from "../reactivate";
import { desligarWebhook, idDoBotNoToken, lerBot, ligarWebhook, TelegramApiError, type BotDoTelegram } from "./api";

export class ConexaoDoTelegramError extends Error {
  constructor(
    public readonly codigo: "token_invalido" | "token_recusado" | "bot_de_outra_empresa" | "cifra_indisponivel" | "endereco_publico" | "falha_ao_gravar",
    mensagem: string,
    public readonly status: number,
  ) {
    super(mensagem);
  }
}

export interface BotConectado {
  id: string;
  botId: string;
  nome: string | null;
  status: string;
  falha: string | null;
  conectadoEm: string;
}

interface Linha {
  id: string;
  telegram_bot_id: string;
  display_name: string | null;
  status: string;
  archived_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  webhook_path_token: string | null;
  webhook_secret_encrypted: string | null;
}

async function linhasDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<Linha[]> {
  const { data, error } = await db
    .from("channel_sessions")
    .select("id, telegram_bot_id, display_name, status, archived_at, created_at, metadata, webhook_path_token, webhook_secret_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", CHANNEL_PROVIDER_TELEGRAM);
  if (error) throw new Error(`telegram: leitura dos bots falhou: ${error.message}`);
  return (data ?? []) as Linha[];
}

/** Os bots ATIVOS da organização, para a tela. Nenhum token sai daqui. */
export async function botsDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<BotConectado[]> {
  return (await linhasDaOrganizacao(db, organizationId))
    .filter((l) => !l.archived_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((l) => ({
      id: l.id,
      botId: l.telegram_bot_id,
      nome: l.display_name,
      status: l.status,
      falha: typeof l.metadata?.telegram_falha === "string" ? l.metadata.telegram_falha : null,
      conectadoEm: l.created_at,
    }));
}

/** O token do bot, aberto — só para quem vai falar com o Telegram agora. */
export async function tokenDoBot(db: SupabaseClient, scope: { organizationId: string; botId: string }): Promise<string | null> {
  const { data, error } = await db
    .from("channel_sessions")
    .select("telegram_bot_token_encrypted")
    .eq("organization_id", scope.organizationId)
    .eq("provider", CHANNEL_PROVIDER_TELEGRAM)
    .eq("telegram_bot_id", scope.botId)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const cifrado = (data as { telegram_bot_token_encrypted: string | null }).telegram_bot_token_encrypted;
  return cifrado ? await decryptWebhookSecret(db, cifrado) : null;
}

export interface DepsDoTelegram {
  lerBot: (token: string) => Promise<BotDoTelegram>;
  ligarWebhook: (p: { token: string; url: string; segredo: string }) => Promise<void>;
}

export const depsReaisDoTelegram: DepsDoTelegram = { lerBot: (t) => lerBot(t), ligarWebhook: (p) => ligarWebhook(p) };

export async function conectarBot(
  db: SupabaseClient,
  deps: DepsDoTelegram,
  input: { organizationId: string; userId: string; token: string; publicBase: string },
): Promise<{ channelSessionId: string; username: string; resultado: "conectado" | "reconectado"; recebendo: boolean }> {
  const token = input.token.trim();
  const idPeloFormato = idDoBotNoToken(token);
  if (!idPeloFormato) {
    throw new ConexaoDoTelegramError("token_invalido", "Este não parece um token do BotFather. Ele tem a forma 123456789:AA…", 422);
  }

  let bot: BotDoTelegram;
  try {
    bot = await deps.lerBot(token);
  } catch (err) {
    if (err instanceof TelegramApiError && (err.status === 401 || err.status === 404)) {
      throw new ConexaoDoTelegramError("token_recusado", "O Telegram recusou este token. Confira no BotFather (/token) e cole de novo.", 422);
    }
    throw err;
  }

  const tokenCifrado = await encryptWebhookSecret(db, token);
  if (!tokenCifrado) throw new ConexaoDoTelegramError("cifra_indisponivel", "A chave de cifra da instalação não está disponível: o token não foi gravado.", 422);

  const desteBot = (await linhasDaOrganizacao(db, input.organizationId)).filter((l) => l.telegram_bot_id === bot.id);
  const ativa = desteBot.find((l) => !l.archived_at) ?? null;
  const arquivada =
    desteBot.filter((l) => !!l.archived_at).sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)))[0] ?? null;

  const nome = `Telegram · @${bot.username}`;
  const metadataDaVolta = (atual: Record<string, unknown> | null) => ({ ...(atual ?? {}), social_platform: "telegram", bot_username: bot.username });

  let channelSessionId: string;
  let caminho: string;
  let segredo: string;
  let resultado: "conectado" | "reconectado";

  const existente = ativa ?? arquivada;
  if (existente) {
    // Reconectar MANTÉM a URL e o segredo: só o token muda.
    const segredoAberto = existente.webhook_secret_encrypted ? await decryptWebhookSecret(db, existente.webhook_secret_encrypted) : null;
    if (!segredoAberto || !existente.webhook_path_token) {
      throw new ConexaoDoTelegramError("cifra_indisponivel", "Não foi possível recuperar o segredo do webhook deste bot.", 422);
    }
    const patch = { telegram_bot_token_encrypted: tokenCifrado, display_name: nome, status: "STARTING", metadata: metadataDaVolta(existente.metadata) };
    if (ativa) {
      const { error } = await db.from("channel_sessions").update(patch).eq("organization_id", input.organizationId).eq("id", ativa.id);
      if (error) throw new ConexaoDoTelegramError("falha_ao_gravar", "Não foi possível atualizar o bot.", 500);
    } else {
      const { error } = await reactivateChannelSession(
        db,
        { organizationId: input.organizationId, channelSessionId: existente.id, archivedAt: existente.archived_at },
        patch,
        { userId: input.userId, metadata: { provider: CHANNEL_PROVIDER_TELEGRAM, bot: bot.username } },
      );
      if (error?.code === "23505") throw outraEmpresa();
      if (error) throw new ConexaoDoTelegramError("falha_ao_gravar", "Não foi possível reativar o bot.", 500);
    }
    channelSessionId = existente.id;
    caminho = existente.webhook_path_token;
    segredo = segredoAberto;
    resultado = "reconectado";
  } else {
    segredo = randomBytes(32).toString("hex");
    caminho = randomBytes(24).toString("hex");
    const segredoCifrado = await encryptWebhookSecret(db, segredo);
    if (!segredoCifrado) throw new ConexaoDoTelegramError("cifra_indisponivel", "A chave de cifra da instalação não está disponível: o token não foi gravado.", 422);
    const { data, error } = await db
      .from("channel_sessions")
      .insert({
        organization_id: input.organizationId,
        provider: CHANNEL_PROVIDER_TELEGRAM,
        telegram_bot_id: bot.id,
        telegram_bot_token_encrypted: tokenCifrado,
        webhook_secret_encrypted: segredoCifrado,
        webhook_path_token: caminho,
        display_name: nome,
        status: "STARTING",
        metadata: { ...metadataInicialDoCanal(), ...metadataDaVolta(null) },
      })
      .select("id")
      .single();
    // 23505 = o bot está ativo em OUTRA organização (índice único entre ativos, 0912).
    if (error?.code === "23505") throw outraEmpresa();
    if (error || !data) throw new ConexaoDoTelegramError("falha_ao_gravar", "Não foi possível gravar o bot.", 500);
    channelSessionId = (data as { id: string }).id;
    resultado = "conectado";
  }

  // O canal já existe; se o webhook não ligar, ele fica marcado com o motivo em
  // vez de parecer conectado e nunca receber.
  let recebendo = true;
  let motivo: string | null = null;
  try {
    await deps.ligarWebhook({ token, url: `${input.publicBase}/api/v1/webhooks/channel/${caminho}`, segredo });
  } catch (err) {
    recebendo = false;
    motivo = err instanceof TelegramApiError ? err.descricao : "falha ao falar com o Telegram";
  }
  await marcarEstado(db, { organizationId: input.organizationId, channelSessionId, ok: recebendo, motivo });
  return { channelSessionId, username: bot.username, resultado, recebendo };
}

function outraEmpresa(): ConexaoDoTelegramError {
  return new ConexaoDoTelegramError("bot_de_outra_empresa", "Este bot já atende outra empresa nesta instalação. Um bot só pode estar em um lugar.", 409);
}

async function marcarEstado(
  db: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; ok: boolean; motivo: string | null },
): Promise<void> {
  const { data } = await db
    .from("channel_sessions")
    .select("metadata")
    .eq("organization_id", input.organizationId)
    .eq("id", input.channelSessionId)
    .maybeSingle();
  const metadata = { ...((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) };
  if (input.ok) delete metadata.telegram_falha;
  else metadata.telegram_falha = (input.motivo ?? "").slice(0, 300);
  const { error } = await db
    .from("channel_sessions")
    .update({ status: input.ok ? "WORKING" : "FAILED", metadata })
    .eq("organization_id", input.organizationId)
    .eq("id", input.channelSessionId);
  if (error) throw new Error(`telegram: estado do bot não gravado: ${error.message}`);
}

/**
 * Desliga o webhook do bot no Telegram — chamado pela rota padrão de excluir
 * canal ANTES de ela zerar o token. Best-effort: o desfecho vai para a auditoria
 * e não impede a exclusão.
 */
export async function desligarWebhookDoBot(
  db: SupabaseClient,
  input: { tokenCifrado: string | null },
): Promise<"desfeito" | "sem_credencial" | "falhou"> {
  if (!input.tokenCifrado) return "sem_credencial";
  const token = await decryptWebhookSecret(db, input.tokenCifrado);
  if (!token) return "sem_credencial";
  try {
    await desligarWebhook(token);
    return "desfeito";
  } catch {
    return "falhou";
  }
}
