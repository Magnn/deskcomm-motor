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
import type { CredencialDeConversao } from "@/lib/plataformas-de-anuncio/types";

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

export type DestinoDaConversao =
  | {
      ok: true;
      credencial: CredencialDeConversao;
      contaDoWhatsApp: string | null;
      pixelDoSite: boolean;
      /** No pixel do site: o clique (`fbc`) e o navegador (`fbp`) da landing, quando a pessoa veio por ela. */
      fbc?: string | null;
      fbp?: string | null;
      cliente?: { ip: string | null; ua: string | null } | null;
    }
  | { ok: false; motivo: "conjunto_de_dados_indisponivel"; detalhe?: string };

/** O valor de um parâmetro da landing que tem forma de identificador da Meta (sem espaço, tamanho razoável). */
function parametroSeguro(valor: unknown): string | null {
  return typeof valor === "string" && /^[\w.-]{8,300}$/.test(valor) ? valor : null;
}

/**
 * O CLIQUE DA LANDING DESTE CONTATO: o `[ref:]` mais recente que casou com ele (`meta_ads_click_refs`), com o que a
 * página repassou na query — `_fbc`/`fbclid` e `_fbp`. É o que liga a venda feita na conversa ao anúncio de site.
 * Pura na regra (`fbcDoClique`), uma leitura no banco.
 */
export function fbcDoClique(query: Record<string, unknown>, criadoEm: string): string | null {
  const pronto = parametroSeguro(query._fbc);
  if (pronto) return pronto;
  const fbclid = parametroSeguro(query.fbclid);
  return fbclid ? `fb.1.${new Date(criadoEm).getTime()}.${fbclid}` : null;
}

async function cliqueDaLanding(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<{ fbc: string | null; fbp: string | null; cliente: { ip: string | null; ua: string | null } | null }> {
  const { data } = await admin
    .from("meta_ads_click_refs")
    .select("query_raw, created_at")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const linha = data as { query_raw: Record<string, unknown> | null; created_at: string } | null;
  if (!linha) return { fbc: null, fbp: null, cliente: null };
  const query = linha.query_raw ?? {};
  // `__ip`/`__ua` não vêm da página: a rota de captura os grava ao receber o clique (ver a rota).
  const ip = typeof query.__ip === "string" ? query.__ip.slice(0, 64) : null;
  const ua = typeof query.__ua === "string" ? query.__ua.slice(0, 400) : null;
  return { fbc: fbcDoClique(query, linha.created_at), fbp: parametroSeguro(query._fbp), cliente: ip || ua ? { ip, ua } : null };
}

/**
 * PARA ONDE VAI A VENDA NA META: o conjunto de mensageria da conta do WhatsApp, quando a conversa passou por um
 * número oficial; senão, o PIXEL DO SITE da tela de Conversões.
 *
 * Medido em 20/10/2026: o número oficial foi banido em 15/10 e o atendimento seguiu num número por QR. O conjunto
 * de mensageria era da conta banida (não dá mais para gerar token para ele), e toda venda era pulada
 * (`sem_conta_do_whatsapp` / `canal_sem_credencial`): a Meta deixou de saber quem compra. No pixel do site a venda
 * não é atribuída ao clique, mas a plataforma volta a conhecer as compradoras pelo telefone — público de quem
 * comprou, para excluir e para buscar semelhantes.
 */
export async function destinoDaConversaoMeta(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  daTela: CredencialDeConversao,
  fetchImpl: typeof fetch = fetch,
): Promise<DestinoDaConversao> {
  const mensageria = await lerDestinoDeMensageria(admin, organizationId, contactId, fetchImpl);
  if (mensageria.ok) {
    return {
      ok: true,
      credencial: { ...daTela, datasetId: mensageria.destino.datasetId, accessToken: mensageria.destino.accessToken },
      contaDoWhatsApp: mensageria.destino.contaDoWhatsApp,
      pixelDoSite: false,
    };
  }
  if (mensageria.motivo === "conjunto_de_dados_indisponivel") {
    return { ok: false, motivo: "conjunto_de_dados_indisponivel", detalhe: mensageria.detalhe };
  }
  const clique = await cliqueDaLanding(admin, organizationId, contactId).catch(() => ({ fbc: null, fbp: null, cliente: null }));
  return { ok: true, credencial: daTela, contaDoWhatsApp: null, pixelDoSite: true, ...clique };
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
