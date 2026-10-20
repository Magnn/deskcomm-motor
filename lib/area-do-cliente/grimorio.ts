/**
 * O GRIMÓRIO da área do cliente (o modelo Labyrinthos e Golden Thread, sem a coleção para completar): cada carta
 * que já saiu nas leituras pagas dela fica guardada, com quantas vezes apareceu, o sentido de base e a última
 * pergunta em que saiu. É memória da história dela com as cartas, não um álbum que pede mais compras para
 * "fechar" — por isso não há contagem do que falta.
 *
 * Puro: o servidor (`carregarGrimorio`, em `leituras-servidor.ts`) lê as leituras e chama `montarGrimorio`.
 */
import type { CartaDaLeitura, Modalidade } from "./leituras";

export interface LeituraParaOGrimorio {
  modalidade: Modalidade;
  pergunta: string;
  quando: string;
  cartas: readonly CartaDaLeitura[];
}

export interface CartaDoGrimorio {
  modalidade: Modalidade;
  id: number;
  nome: string;
  sentido: string;
  vezes: number;
  /** A pergunta da leitura mais recente em que ela saiu, e quando. */
  ultimaPergunta: string;
  ultimaVez: string;
}

/** Uma entrada por carta (modalidade + id): as que mais saíram primeiro; no empate, a mais recente. */
export function montarGrimorio(leituras: readonly LeituraParaOGrimorio[]): CartaDoGrimorio[] {
  const porCarta = new Map<string, CartaDoGrimorio>();
  for (const l of leituras) {
    // A mesma carta duas vezes na MESMA leitura conta uma (não acontece no sorteio, mas o dado é jsonb).
    const vistas = new Set<number>();
    for (const c of l.cartas) {
      if (vistas.has(c.id)) continue;
      vistas.add(c.id);
      const chave = `${l.modalidade}:${c.id}`;
      const atual = porCarta.get(chave);
      if (!atual) {
        porCarta.set(chave, {
          modalidade: l.modalidade,
          id: c.id,
          nome: c.nome,
          sentido: c.sentido,
          vezes: 1,
          ultimaPergunta: l.pergunta,
          ultimaVez: l.quando,
        });
        continue;
      }
      atual.vezes += 1;
      if (l.quando > atual.ultimaVez) {
        atual.ultimaVez = l.quando;
        atual.ultimaPergunta = l.pergunta;
      }
    }
  }
  return [...porCarta.values()].sort((a, b) => b.vezes - a.vezes || b.ultimaVez.localeCompare(a.ultimaVez));
}
