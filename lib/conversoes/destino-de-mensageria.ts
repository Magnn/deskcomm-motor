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

import { conjuntoDeDadosDaConta } from "@/lib/channels/meta/conjunto-de-dados-da-conta";
import { resolveMetaCreds } from "@/lib/channels/meta/credentials";
import { logger } from "@/lib/logger";
import { lerCredencial } from "@/lib/plataformas-de-anuncio/credenciais";

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

/**
 * O CONJUNTO DE DADOS DA EMPRESA, para a conversa que não passou por canal oficial.
 *
 * Medido em 20/10/2026: o número oficial foi banido em 15/10 e arquivado (o token saiu com ele); o atendimento
 * passou para um número por QR, e as duas campanhas ativas seguiram apontando para o MESMO conjunto de dados da
 * conta do WhatsApp. Daí em diante toda venda foi pulada — `sem_conta_do_whatsapp` para quem chegou pelo número
 * novo, `canal_sem_credencial` para quem tinha conversado no antigo — e as campanhas otimizavam por compra sem
 * receber compra nenhuma.
 *
 * A regra: o canal oficial mais recente da empresa que tem conjunto de dados guardado — arquivado ou não, porque
 * o conjunto continua sendo o destino das campanhas. A conta e o conjunto vêm dele; o token, quando o do canal
 * não existe mais, é o da tela de Conversões (que precisa ter a permissão de eventos de mensageria).
 */
async function canalOficialDaEmpresa(admin: SupabaseClient, organizationId: string): Promise<CanalDoContato | null> {
  const { data } = await admin
    .from("channel_sessions")
    .select("id, meta_waba_id, meta_phone_number_id, metadata, created_at")
    .eq("organization_id", organizationId)
    .not("meta_waba_id", "is", null)
    .not(`metadata->>${CHAVE_NO_CANAL}`, "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const canal = ((data ?? []) as unknown as CanalDoContato[])[0];
  return canal && canal.meta_waba_id ? canal : null;
}

/** O token da tela de Conversões: o que sobra quando o canal oficial não tem mais o dele. */
async function tokenDaTelaDeConversoes(admin: SupabaseClient, organizationId: string): Promise<string | null> {
  const lida = await lerCredencial(admin, organizationId, "meta_ads");
  return lida.ok && lida.credencial.accessToken ? lida.credencial.accessToken : null;
}

export async function lerDestinoDeMensageria(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LeituraDoDestino> {
  const doContato = await canalOficialDoContato(admin, organizationId, contactId);
  const canal = doContato ?? (await canalOficialDaEmpresa(admin, organizationId));
  if (canal === null) return { ok: false, motivo: "sem_conta_do_whatsapp" };

  const doCanal = canal.meta_phone_number_id
    ? await resolveMetaCreds(admin, { organizationId, phoneNumberId: canal.meta_phone_number_id })
    : null;
  const token = doCanal?.token ?? (await tokenDaTelaDeConversoes(admin, organizationId));
  if (!token) return { ok: false, motivo: "canal_sem_credencial" };
  const credenciais = { token };

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
