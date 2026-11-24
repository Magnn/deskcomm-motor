/**
 * CONFERÊNCIA DE META — o conjunto de VENDAS que leva ao WhatsApp e otimiza para outra coisa.
 *
 * A meta de desempenho decide para QUEM a plataforma mostra o anúncio. Num conjunto de vendas que
 * leva à conversa, "Maximizar o número de conversas" (CONVERSATIONS) entrega para quem conversa, não
 * para quem compra — e a plataforma não deixa trocar a meta depois de publicar: o conserto é recriar
 * o conjunto. Foi um erro real (teste publicado otimizando para conversas), e o painel só via o gasto.
 *
 * Regra pura: o conjunto ATIVO numa campanha de objetivo vendas, com destino de mensagem, precisa
 * otimizar para compra. Tudo o mais passa (campanha de tráfego, de engajamento, destino site...).
 */

/** Metas que otimizam para compra; qualquer outra num conjunto de vendas com destino de mensagem é erro. */
const METAS_DE_COMPRA = new Set(["MESSAGING_PURCHASE_CONVERSION", "OFFSITE_CONVERSIONS", "VALUE"]);
const DESTINOS_DE_MENSAGEM = new Set(["WHATSAPP", "MESSENGER", "INSTAGRAM_DIRECT", "MESSAGING_MESSENGER_WHATSAPP", "MESSAGING_INSTAGRAM_DIRECT_WHATSAPP", "MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP"]);

export interface ConjuntoAtivo {
  id: string;
  nome: string;
  campanhaId: string | null;
  meta: string | null;
  destino: string | null;
}

export interface MetaErrada {
  conjuntoId: string;
  conjunto: string;
  campanha: string;
  /** A meta crua da plataforma (ex.: `CONVERSATIONS`); a tela traduz. */
  meta: string;
}

export function conferirMetas(
  conjuntos: readonly ConjuntoAtivo[],
  campanhas: readonly { id: string; nome: string; objetivo: string | null }[],
): MetaErrada[] {
  const porId = new Map(campanhas.map((c) => [c.id, c]));
  return conjuntos.flatMap((s) => {
    const campanha = s.campanhaId ? porId.get(s.campanhaId) : undefined;
    if (campanha?.objetivo !== "OUTCOME_SALES") return [];
    if (!s.destino || !DESTINOS_DE_MENSAGEM.has(s.destino)) return [];
    if (!s.meta || METAS_DE_COMPRA.has(s.meta)) return [];
    return [{ conjuntoId: s.id, conjunto: s.nome, campanha: campanha.nome, meta: s.meta }];
  });
}
