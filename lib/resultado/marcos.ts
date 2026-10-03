/**
 * MARCOS DA CONVERSA — reconhecer, por REGRA, que uma oferta foi apresentada ou
 * que uma objeção apareceu, e gravar o fato (`conversation_milestones`, 0913).
 *
 * As regras são as que o motor JÁ usa para decidir na hora do envio, e não uma
 * segunda definição: o preço dito (`PRECO_DITO`) e a reclamação de valor
 * (`RECLAMACAO_DE_VALOR`) vêm de `lib/preco/estado-da-negociacao.ts`. O que
 * muda é que agora o reconhecimento vira um registro, em vez de ser esquecido.
 *
 *   mensagem que SAIU  + preço dito ou link de pagamento → `oferta_apresentada`
 *   mensagem que CHEGOU + reclamação de valor            → `objecao` (preço)
 *   mensagem que CHEGOU + frase cadastrada na aba Objeções → `objecao` (a frase)
 *
 * Quem classifica é uma rotina periódica, e não cada caminho de envio: agente,
 * fluxo e atendente escrevem por portas diferentes, e pendurar a regra em cada
 * uma seria esquecer a próxima. A rotina anda por um cursor
 * (`watchdog_cursors`), então também preenche o histórico de antes dela existir,
 * e passar duas vezes pela mesma mensagem não duplica nada (índice único).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerObjecoes } from "@/lib/objecoes/tipos";
import { PRECO_DITO, RECLAMACAO_DE_VALOR } from "@/lib/preco/estado-da-negociacao";

export type TipoDeMarco = "oferta_apresentada" | "objecao";

export interface Marco {
  tipo: TipoDeMarco;
  categoria: string | null;
}

export const CATEGORIA_PRECO = "preco";
export const CATEGORIA_LINK = "link_de_pagamento";

/** Links de pagamento conhecidos — mandar um é apresentar a oferta, mesmo sem dizer o preço. */
const LINK_DE_PAGAMENTO = /pay\.cakto\.com\.br|mpago\.la|pag\.ae|\/checkout(?:[/?#]|\b)/i;

/** Sem acento, sem pontuação, minúsculo, um espaço só — para a frase cadastrada casar com o jeito de digitar. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Frase curta demais casaria com qualquer coisa ("não", "ok"). */
const MINIMO_DA_FRASE = 6;

/** Os marcos de UMA mensagem. Puro. */
export function marcosDaMensagem(
  msg: { direction: string; body: string | null | undefined },
  frasesDeObjecao: readonly string[],
): Marco[] {
  const corpo = (msg.body ?? "").trim();
  if (corpo === "") return [];

  if (msg.direction === "outbound") {
    if (PRECO_DITO.test(corpo)) return [{ tipo: "oferta_apresentada", categoria: CATEGORIA_PRECO }];
    if (LINK_DE_PAGAMENTO.test(corpo)) return [{ tipo: "oferta_apresentada", categoria: CATEGORIA_LINK }];
    return [];
  }

  if (msg.direction !== "inbound") return [];
  if (RECLAMACAO_DE_VALOR.test(corpo)) return [{ tipo: "objecao", categoria: CATEGORIA_PRECO }];
  const dito = normalizar(corpo);
  for (const frase of frasesDeObjecao) {
    const n = normalizar(frase);
    if (n.length >= MINIMO_DA_FRASE && dito.includes(n)) return [{ tipo: "objecao", categoria: frase.slice(0, 120) }];
  }
  return [];
}

// ── A rotina ────────────────────────────────────────────────────────────────

export const CONSUMIDOR = "marcos_da_conversa";
const LOTE = 500;
const ID_ZERO = "00000000-0000-0000-0000-000000000000";

interface MensagemLida {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  direction: string;
  body: string | null;
  created_at: string;
  sent_at: string | null;
}

/** As frases de objeção dos agentes PUBLICADOS da organização. */
async function frasesDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<string[]> {
  // A configuração do agente (onde mora a aba Objeções) fica em `ai_agents.config`
  // — a MESMA coluna que o motor lê no turno (`agent-config.ts`, `a.config`). A
  // versão publicada não tem coluna de configuração.
  const { data, error } = await db
    .from("ai_agents")
    .select("config, published_version_id")
    .eq("organization_id", organizationId)
    .is("archived_at", null);
  if (error) throw new Error(`marcos: leitura dos agentes falhou: ${error.message}`);
  const frases = new Set<string>();
  for (const a of (data ?? []) as { config: unknown; published_version_id: string | null }[]) {
    // Só agente PUBLICADO: rascunho não atende ninguém.
    if (!a.published_version_id) continue;
    for (const o of lerObjecoes(a.config)?.objecoes ?? []) frases.add(o.quando);
  }
  return [...frases];
}

export interface ResultadoDaRodada {
  lidas: number;
  marcos: number;
  /** Ainda há mensagens depois deste lote — a próxima rodada continua. */
  haMais: boolean;
}

/**
 * Uma rodada: lê o próximo lote de mensagens depois do cursor, grava os marcos
 * e avança o cursor. O cursor só anda DEPOIS da gravação: se ela falhar, a
 * próxima rodada refaz o mesmo lote (e o índice único absorve o que já entrou).
 */
export async function classificarNovasMensagens(db: SupabaseClient): Promise<ResultadoDaRodada> {
  const { data: cursorLido, error: erroCursor } = await db
    .from("watchdog_cursors")
    .select("last_created_at, last_event_id")
    .eq("consumer", CONSUMIDOR)
    .maybeSingle();
  if (erroCursor) throw new Error(`marcos: leitura do cursor falhou: ${erroCursor.message}`);
  const cursor = (cursorLido as { last_created_at: string; last_event_id: string } | null) ?? {
    last_created_at: new Date(0).toISOString(),
    last_event_id: ID_ZERO,
  };

  // Lote por data; o id desempata mensagens do mesmo instante que já foram lidas.
  const { data, error } = await db
    .from("messages")
    .select("id, organization_id, conversation_id, contact_id, direction, body, created_at, sent_at")
    .gte("created_at", cursor.last_created_at)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(LOTE + 1);
  if (error) throw new Error(`marcos: leitura das mensagens falhou: ${error.message}`);

  const todas = ((data ?? []) as MensagemLida[]).filter(
    (m) => m.created_at > cursor.last_created_at || m.id > cursor.last_event_id,
  );
  const lote = todas.slice(0, LOTE);
  if (lote.length === 0) return { lidas: 0, marcos: 0, haMais: false };

  const frasesPorOrg = new Map<string, string[]>();
  const linhas: Record<string, unknown>[] = [];
  for (const m of lote) {
    if (!m.conversation_id) continue;
    let frases = frasesPorOrg.get(m.organization_id);
    if (!frases) {
      frases = m.direction === "inbound" ? await frasesDaOrganizacao(db, m.organization_id) : [];
      if (m.direction === "inbound") frasesPorOrg.set(m.organization_id, frases);
    }
    for (const marco of marcosDaMensagem(m, frases)) {
      linhas.push({
        organization_id: m.organization_id,
        conversation_id: m.conversation_id,
        contact_id: m.contact_id,
        message_id: m.id,
        kind: marco.tipo,
        category: marco.categoria,
        source: "regra",
        occurred_at: m.sent_at ?? m.created_at,
      });
    }
  }

  if (linhas.length > 0) {
    const { error: erroGravacao } = await db
      .from("conversation_milestones")
      .upsert(linhas, { onConflict: "message_id,kind", ignoreDuplicates: true });
    if (erroGravacao) throw new Error(`marcos: gravação falhou: ${erroGravacao.message}`);
  }

  const ultima = lote[lote.length - 1]!;
  const { error: erroAvanco } = await db.from("watchdog_cursors").upsert(
    { consumer: CONSUMIDOR, last_created_at: ultima.created_at, last_event_id: ultima.id, updated_at: new Date().toISOString() },
    { onConflict: "consumer" },
  );
  if (erroAvanco) throw new Error(`marcos: cursor não avançou: ${erroAvanco.message}`);

  return { lidas: lote.length, marcos: linhas.length, haMais: todas.length > LOTE };
}
