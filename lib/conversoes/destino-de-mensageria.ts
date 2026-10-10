/**
 * PARA ONDE VAI A CONVERSÃO DE UMA VENDA QUE NASCEU NUMA CONVERSA DE WHATSAPP.
 *
 * A plataforma não aceita conversão de mensageria em qualquer conjunto de dados: o destino tem de ser
 * o conjunto de dados DA PRÓPRIA conta do WhatsApp Business, e o evento tem de declarar essa conta.
 * Medido em 10/10/2026, no primeiro envio real desta casa — três recusas em sequência, cada uma
 * ensinando um pedaço:
 *
 *   1. sem `whatsapp_business_account_id` em `user_data` → 400, subcódigo 2804116;
 *   2. com a conta, mas mandando para o conjunto de dados do pixel do site → 400, subcódigo 2804132
 *      ("não há uma conta do WhatsApp Business vinculada a este conjunto de dados");
 *   3. o token cadastrado na tela de Conversões só tinha permissão de leitura de qualidade — quem
 *      tem `whatsapp_business_manage_events` é o token do CANAL oficial.
 *
 * Por isso o destino de mensageria não vem da tela de Conversões: vem do canal por onde o contato
 * conversou. A conta, o token e o conjunto de dados são dele. Ninguém cola identificador nenhum.
 *
 * ─── O conjunto de dados da conta ───────────────────────────────────────────────────────────────
 * `GET /<conta>/dataset` devolve o que existe; se não existir, `POST /<conta>/dataset` cria (é o
 * caminho que a própria plataforma manda na recusa nº 2). O id fica guardado no canal
 * (`metadata.conversions_dataset_id`) para não perguntar a cada venda.
 *
 * Nunca lança: destino indisponível é `null` com o motivo, e quem chama registra a pendência.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveMetaCreds } from "@/lib/channels/meta/credentials";
import { VERSAO_PADRAO_DA_GRAPH } from "@/lib/graph-version";
import { logger } from "@/lib/logger";

const TEMPO_LIMITE_MS = 10_000;
const CHAVE_NO_CANAL = "conversions_dataset_id";

export interface DestinoDeMensageria {
  contaDoWhatsApp: string;
  datasetId: string;
  accessToken: string;
}

export type LeituraDoDestino =
  | { ok: true; destino: DestinoDeMensageria }
  | { ok: false; motivo: "sem_conta_do_whatsapp" | "canal_sem_credencial" | "conjunto_de_dados_indisponivel"; detalhe?: string };

interface CanalDoContato {
  id: string;
  meta_waba_id: string;
  meta_phone_number_id: string;
  metadata: Record<string, unknown> | null;
}

/** O canal OFICIAL da conversa mais recente do contato. `null` = ele nunca conversou por um. */
async function canalOficialDoContato(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<CanalDoContato | null> {
  const { data } = await admin
    .from("conversations")
    .select("last_message_at, channel_sessions!inner(id, meta_waba_id, meta_phone_number_id, metadata)")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .not("channel_sessions.meta_waba_id", "is", null)
    .not("channel_sessions.meta_phone_number_id", "is", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1);
  const linha = ((data ?? []) as unknown as Array<{ channel_sessions: CanalDoContato | CanalDoContato[] }>)[0];
  if (!linha) return null;
  const canal = Array.isArray(linha.channel_sessions) ? linha.channel_sessions[0] : linha.channel_sessions;
  return canal && canal.meta_waba_id && canal.meta_phone_number_id ? canal : null;
}

/** O id do conjunto de dados que a resposta da plataforma traz — nos dois formatos que ela usa. Pura. */
export function idDoConjuntoDeDados(corpo: unknown): string | null {
  const c = corpo as { id?: unknown; data?: Array<{ id?: unknown }> } | null;
  const direto = typeof c?.id === "string" && c.id.trim() !== "" ? c.id.trim() : null;
  if (direto) return direto;
  const daLista = c?.data?.find((d) => typeof d?.id === "string" && d.id.trim() !== "")?.id;
  return typeof daLista === "string" ? daLista.trim() : null;
}

async function conjuntoDeDadosDaConta(
  conta: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<{ id: string } | { erro: string }> {
  const url = `https://graph.facebook.com/${VERSAO_PADRAO_DA_GRAPH}/${encodeURIComponent(conta)}/dataset`;
  const cabecalho = { authorization: `Bearer ${token}` };
  try {
    const leitura = await fetchImpl(url, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    const existente = leitura.ok ? idDoConjuntoDeDados(await leitura.json().catch(() => null)) : null;
    if (existente) return { id: existente };
    if (!leitura.ok && leitura.status !== 404) return { erro: `leitura do conjunto de dados: ${leitura.status}` };

    const criacao = await fetchImpl(url, { method: "POST", headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    const criado = criacao.ok ? idDoConjuntoDeDados(await criacao.json().catch(() => null)) : null;
    return criado ? { id: criado } : { erro: `criação do conjunto de dados: ${criacao.status}` };
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "falha de rede" };
  }
}

export async function lerDestinoDeMensageria(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LeituraDoDestino> {
  const canal = await canalOficialDoContato(admin, organizationId, contactId);
  if (canal === null) return { ok: false, motivo: "sem_conta_do_whatsapp" };

  const credenciais = await resolveMetaCreds(admin, { organizationId, phoneNumberId: canal.meta_phone_number_id });
  if (!credenciais?.token) return { ok: false, motivo: "canal_sem_credencial" };

  const guardado = canal.metadata?.[CHAVE_NO_CANAL];
  if (typeof guardado === "string" && guardado.trim() !== "") {
    return { ok: true, destino: { contaDoWhatsApp: canal.meta_waba_id, datasetId: guardado.trim(), accessToken: credenciais.token } };
  }

  const conjunto = await conjuntoDeDadosDaConta(canal.meta_waba_id, credenciais.token, fetchImpl);
  if ("erro" in conjunto) {
    logger.warn("[conversoes] conjunto de dados da conta do WhatsApp indisponível", { organization_id: organizationId, detalhe: conjunto.erro });
    return { ok: false, motivo: "conjunto_de_dados_indisponivel", detalhe: conjunto.erro };
  }

  // Guardar é conveniência: se a escrita falhar, a próxima venda só pergunta de novo.
  await admin
    .from("channel_sessions")
    .update({ metadata: { ...(canal.metadata ?? {}), [CHAVE_NO_CANAL]: conjunto.id } as never })
    .eq("organization_id", organizationId)
    .eq("id", canal.id);

  return { ok: true, destino: { contaDoWhatsApp: canal.meta_waba_id, datasetId: conjunto.id, accessToken: credenciais.token } };
}
