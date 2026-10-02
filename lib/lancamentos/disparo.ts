/**
 * O DISPARO PARA OS GRUPOS — uma mensagem (ou sequência) para todos os grupos do lançamento.
 *
 * Quem dispara é a rodada do relógio (`/api/v1/cron/lancamentos`), minuto a minuto:
 *
 *   1. pega os disparos vencidos e os marca como SEUS por um prazo (`claimed_until`)
 *      — duas rodadas sobrepostas não mandam o mesmo disparo;
 *   2. garante uma linha de ENTREGA por grupo — é ela que impede o envio em dobro:
 *      grupo com entrega `sent` ou `failed` não recebe de novo;
 *   3. manda para um grupo de cada vez, com pausa entre grupos, até o orçamento de
 *      tempo da rodada; o que sobrar fica para a rodada seguinte.
 *
 * ─── Por que falha NÃO é re-tentada sozinha ──────────────────────────────────────
 * Uma sequência de três mensagens que falha na segunda já entregou a primeira.
 * Re-tentar mandaria a primeira de novo para um grupo inteiro. A entrega fica
 * `failed` com o motivo, e reenviar é decisão de quem opera.
 *
 * ─── O que NÃO passa pela cadeia de proteção do 1 a 1 ────────────────────────────
 * Pedido de saída, LGPD e janela de 24h são de UMA pessoa numa conversa. Grupo é
 * outro objeto: quem está nele entrou pelo convite e sai quando quer. O que
 * protege o número aqui é o ritmo — a pausa entre grupos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { planoDeMidiaParaGrupo } from "@/lib/channels/grupos";
import { lerSessaoDeGrupos } from "@/lib/channels/numeros-para-grupos";
import { logger } from "@/lib/logger";

import { itensDoDisparoSchema, type ItemDoDisparo } from "./schemas";
import { grupoEhReserva, type GrupoDoLancamento } from "./servico";

type Admin = SupabaseClient;

/** O pedaço do cliente do WhatsApp que o disparo usa. */
export interface WhatsappDeEnvio {
  sendMessage(session: string, chatId: string, text: string): Promise<unknown>;
  sendMedia(session: string, chatId: string, plan: { endpoint: string; payload: Record<string, unknown> }): Promise<unknown>;
}

export interface DepsDoDisparo {
  admin: Admin;
  whatsapp: WhatsappDeEnvio;
  /** Caminho no bucket → URL que o WhatsApp consegue baixar. `null` = não deu para assinar. */
  urlDaMidia(storagePath: string): Promise<string | null>;
  agora(): Date;
  dormir(ms: number): Promise<void>;
  /** [0,1) — a pausa entre grupos varia para não bater sempre no mesmo intervalo. */
  rng?: () => number;
}

export interface ResultadoDaRodada {
  disparos: number;
  enviados: number;
  falhas: number;
  concluidos: number;
}

/** Quantos disparos uma rodada pega. Pequeno de propósito: cada um pode ter dezenas de grupos. */
const DISPAROS_POR_RODADA = 3;
/** Por quanto tempo um disparo fica reservado à rodada que o pegou. */
const PRAZO_DA_RESERVA_MS = 5 * 60_000;
/** Orçamento de relógio de uma rodada — abaixo do teto que o agendador dá à rota. */
export const ORCAMENTO_DA_RODADA_MS = 35_000;
/** Pausa entre um grupo e o seguinte: base + variação. */
const PAUSA_ENTRE_GRUPOS_MS = 2_500;
const VARIACAO_DA_PAUSA_MS = 2_000;
/** Pausa entre duas mensagens seguidas no MESMO grupo, quando o disparo não pede uma. */
const PAUSA_ENTRE_ITENS_MS = 800;

const TIPO_PARA_WHATSAPP: Record<Exclude<ItemDoDisparo["type"], "text" | "delay">, "image" | "video" | "audio" | "document"> = {
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
};

/** Manda a sequência a UM grupo. Lança no primeiro item que falhar. */
export async function enviarItensAoGrupo(
  deps: Pick<DepsDoDisparo, "whatsapp" | "urlDaMidia" | "dormir">,
  sessionName: string,
  waGroupId: string,
  itens: readonly ItemDoDisparo[],
): Promise<void> {
  let mandouAlgo = false;
  for (const item of itens) {
    if (item.type === "delay") {
      await deps.dormir(item.seconds * 1000);
      continue;
    }
    if (mandouAlgo) await deps.dormir(PAUSA_ENTRE_ITENS_MS);
    if (item.type === "text") {
      await deps.whatsapp.sendMessage(sessionName, waGroupId, item.body);
    } else {
      const url = await deps.urlDaMidia(item.storage_path);
      if (url === null) throw new Error("midia_indisponivel");
      const legenda = "caption" in item ? item.caption : undefined;
      const arquivo = item.type === "document" ? item.filename : undefined;
      await deps.whatsapp.sendMedia(
        sessionName,
        waGroupId,
        planoDeMidiaParaGrupo(TIPO_PARA_WHATSAPP[item.type], {
          url,
          mime: item.mime,
          ...(legenda ? { caption: legenda } : {}),
          ...(arquivo ? { filename: arquivo } : {}),
        }),
      );
    }
    mandouAlgo = true;
  }
}

type DisparoVencido = {
  id: string;
  organization_id: string;
  launch_id: string;
  items: unknown;
  status: string;
  claimed_until: string | null;
};

/**
 * Uma rodada. Nunca lança por causa de UM disparo: o erro dele fica nele, e os
 * outros seguem.
 */
export async function rodarDisparosVencidos(deps: DepsDoDisparo): Promise<ResultadoDaRodada> {
  const { admin } = deps;
  const inicio = deps.agora();
  const prazo = inicio.getTime() + ORCAMENTO_DA_RODADA_MS;
  const r: ResultadoDaRodada = { disparos: 0, enviados: 0, falhas: 0, concluidos: 0 };

  const { data: vencidos, error } = await admin
    .from("group_launch_broadcasts")
    .select("id, organization_id, launch_id, items, status, claimed_until")
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", inicio.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(DISPAROS_POR_RODADA * 3);
  if (error) throw new Error(`lançamentos: leitura dos disparos falhou: ${error.message}`);

  const livres = ((vencidos ?? []) as DisparoVencido[])
    .filter((d) => !d.claimed_until || Date.parse(d.claimed_until) <= inicio.getTime())
    .slice(0, DISPAROS_POR_RODADA);

  for (const disparo of livres) {
    if (deps.agora().getTime() >= prazo) break;

    // A reserva é condicional ao `claimed_until` que LEMOS: se outra rodada pegou
    // o disparo entre a leitura e aqui, o update não casa e pulamos.
    let reserva = admin
      .from("group_launch_broadcasts")
      .update({
        status: "sending",
        claimed_until: new Date(deps.agora().getTime() + PRAZO_DA_RESERVA_MS).toISOString(),
        ...(disparo.status === "scheduled" ? { started_at: deps.agora().toISOString() } : {}),
      })
      .eq("id", disparo.id)
      .eq("status", disparo.status);
    reserva = disparo.claimed_until ? reserva.eq("claimed_until", disparo.claimed_until) : reserva.is("claimed_until", null);
    const { data: reservado, error: erroDaReserva } = await reserva.select("id");
    if (erroDaReserva || (reservado?.length ?? 0) === 0) continue;
    r.disparos++;

    try {
      const terminou = await enviarUmDisparo(deps, disparo, prazo, r);
      if (terminou) r.concluidos++;
    } catch (err) {
      logger.error("[lançamentos] disparo interrompido", { disparo: disparo.id, erro: err instanceof Error ? err.message : String(err) });
      // Solta a reserva: a próxima rodada retoma de onde as entregas pararam.
      await admin.from("group_launch_broadcasts").update({ claimed_until: null }).eq("id", disparo.id);
    }
  }
  return r;
}

/** `true` = o disparo terminou (todos os grupos têm desfecho). */
async function enviarUmDisparo(
  deps: DepsDoDisparo,
  disparo: DisparoVencido,
  prazo: number,
  r: ResultadoDaRodada,
): Promise<boolean> {
  const { admin } = deps;
  const org = disparo.organization_id;
  const encerrar = async (status: "sent" | "failed") => {
    await admin
      .from("group_launch_broadcasts")
      .update({ status, claimed_until: null, finished_at: deps.agora().toISOString() })
      .eq("id", disparo.id);
    return true;
  };

  const itens = itensDoDisparoSchema.safeParse(disparo.items);
  if (!itens.success) {
    logger.error("[lançamentos] disparo com conteúdo inválido", { disparo: disparo.id });
    return encerrar("failed");
  }

  const { data: lancamento } = await admin
    .from("group_launches")
    .select("id, channel_session_id, status")
    .eq("organization_id", org)
    .eq("id", disparo.launch_id)
    .maybeSingle();
  const l = lancamento as { id: string; channel_session_id: string; status: string } | null;
  if (!l || l.status === "archived") return encerrar("failed");
  // Lançamento pausado ou número fora do ar: o disparo ESPERA (a reserva vence e
  // ele volta à fila) em vez de falhar — pausar é justamente para segurar o envio.
  if (l.status === "paused") {
    await admin.from("group_launch_broadcasts").update({ claimed_until: null }).eq("id", disparo.id);
    return false;
  }
  const sessao = await lerSessaoDeGrupos(admin, org, l.channel_session_id);
  if (!sessao?.conectado) {
    await admin.from("group_launch_broadcasts").update({ claimed_until: null }).eq("id", disparo.id);
    return false;
  }

  const { data: gruposRaw, error: erroDosGrupos } = await admin
    .from("group_launch_groups")
    .select("id, launch_id, position, wa_group_id, name, invite_url, members_count, members_checked_at, status")
    .eq("organization_id", org)
    .eq("launch_id", l.id)
    .order("position", { ascending: true });
  if (erroDosGrupos) throw new Error(`leitura dos grupos falhou: ${erroDosGrupos.message}`);
  // Vai para todo grupo de verdade que não foi fechado à mão — inclusive os lotados.
  const grupos = ((gruposRaw ?? []) as GrupoDoLancamento[]).filter((g) => !grupoEhReserva(g) && g.status !== "closed");
  if (grupos.length === 0) return encerrar("failed");

  // Uma entrega por grupo. `ignoreDuplicates`: quem já tem desfecho NÃO volta a `pending`.
  const { error: erroDasEntregas } = await admin.from("group_launch_deliveries").upsert(
    grupos.map((g) => ({ organization_id: org, broadcast_id: disparo.id, group_id: g.id, status: "pending" })),
    { onConflict: "broadcast_id,group_id", ignoreDuplicates: true },
  );
  if (erroDasEntregas) throw new Error(`criação das entregas falhou: ${erroDasEntregas.message}`);

  const { data: pendentesRaw, error: erroDasPendentes } = await admin
    .from("group_launch_deliveries")
    .select("id, group_id")
    .eq("organization_id", org)
    .eq("broadcast_id", disparo.id)
    .eq("status", "pending");
  if (erroDasPendentes) throw new Error(`leitura das entregas falhou: ${erroDasPendentes.message}`);
  const pendentes = (pendentesRaw ?? []) as Array<{ id: string; group_id: string }>;

  const rng = deps.rng ?? Math.random;
  let primeiro = true;
  let sobrou = pendentes.length;
  for (const entrega of pendentes) {
    if (deps.agora().getTime() >= prazo) break;
    const grupo = grupos.find((g) => g.id === entrega.group_id);
    if (!grupo) {
      // O grupo foi fechado ou removido depois de a entrega nascer.
      await admin.from("group_launch_deliveries").update({ status: "failed", error: "grupo_fechado" }).eq("id", entrega.id);
      sobrou--;
      r.falhas++;
      continue;
    }
    if (!primeiro) await deps.dormir(PAUSA_ENTRE_GRUPOS_MS + Math.floor(rng() * VARIACAO_DA_PAUSA_MS));
    primeiro = false;

    // Marca ANTES de mandar o desfecho que vale se o processo morrer no meio: a
    // entrega fica `failed` com `interrompido`, nunca `pending` — pendente seria
    // re-enviada, e o grupo receberia em dobro o que já tinha saído.
    await admin.from("group_launch_deliveries").update({ status: "failed", error: "interrompido" }).eq("id", entrega.id);
    try {
      await enviarItensAoGrupo(deps, sessao.sessionName, grupo.wa_group_id, itens.data);
      await admin
        .from("group_launch_deliveries")
        .update({ status: "sent", error: null, sent_at: deps.agora().toISOString() })
        .eq("id", entrega.id);
      r.enviados++;
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      await admin.from("group_launch_deliveries").update({ status: "failed", error: motivo.slice(0, 300) }).eq("id", entrega.id);
      logger.warn("[lançamentos] envio a um grupo falhou", { disparo: disparo.id, grupo: grupo.id, erro: motivo });
      r.falhas++;
    }
    sobrou--;
  }

  if (sobrou > 0) {
    // Acabou o tempo da rodada: solta a reserva para a seguinte continuar.
    await admin.from("group_launch_broadcasts").update({ claimed_until: null }).eq("id", disparo.id);
    return false;
  }

  const { count: enviadas } = await admin
    .from("group_launch_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org)
    .eq("broadcast_id", disparo.id)
    .eq("status", "sent");
  // Chegou a pelo menos um grupo = enviado (as falhas aparecem por grupo na tela).
  return encerrar((enviadas ?? 0) > 0 ? "sent" : "failed");
}
