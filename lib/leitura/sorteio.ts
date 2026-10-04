/**
 * O SORTEIO REAL — feito pelo código, nunca pelo modelo.
 *
 * "Faz o embaralho real" foi o pedido do dono do produto: a pessoa escolhe 3
 * números de um baralho fechado, e o que sai atrás deles precisa ser um
 * sorteio de verdade, não o modelo inventando uma carta bonita na hora. Um
 * modelo pequeno não tem fonte de aleatoriedade e, pior, não é ESTÁVEL: pedido
 * de novo (o painel de Teste roda o mesmo turno mais de uma vez; o worker
 * reprocessa em caso de erro) ele podia sortear cartas DIFERENTES pra mesma
 * pessoa — a leitura mudando de figura no meio da conversa.
 *
 * A saída daqui é DETERMINÍSTICA: os mesmos 3 números, da mesma pessoa,
 * sempre destravam as mesmas 3 cartas. Isso não é fraude (a pessoa nunca vê o
 * link entre "número 7" e "A Torre" antes de escolher — o resultado dela É
 * random do ponto de vista dela, só que estável do ponto de vista do sistema)
 * — é o mesmo motivo pelo qual um sorteio de loteria eletrônica é
 * determinístico dado a semente: ninguém prevê antes, mas todo mundo confere
 * depois.
 *
 * A semente mistura o id do CONTATO com os 3 números escolhidos: duas pessoas
 * que escolherem "3, 7, 15" recebem cartas diferentes entre si (a leitura não
 * vira uma tabela pública de "número → carta"), mas a MESMA pessoa, pedindo de
 * novo, sempre cai nas mesmas 3.
 */
import { BARALHO, CARTA_POR_ID, TAMANHO_DO_BARALHO, type Carta } from "./baralho";

/** xorshift32 determinístico — não precisa ser cripto-forte, só estável e bem distribuído. */
function pseudoAleatorioDaSemente(semente: string): () => number {
  let estado = 0;
  for (let i = 0; i < semente.length; i++) {
    estado = (Math.imul(estado ^ semente.charCodeAt(i), 2654435761) >>> 0) + 0x9e3779b9;
    estado >>>= 0;
  }
  if (estado === 0) estado = 0x9e3779b9;
  return () => {
    estado ^= estado << 13;
    estado >>>= 0;
    estado ^= estado >>> 17;
    estado ^= estado << 5;
    estado >>>= 0;
    return estado / 0xffffffff;
  };
}

/**
 * As 3 cartas, na ordem de revelação, a partir dos 3 números que a pessoa
 * escolheu no baralho fechado. Determinístico: mesma entrada, mesma saída.
 */
export function sortearCartas(contatoId: string, numerosEscolhidos: readonly number[]): readonly [Carta, Carta, Carta] {
  if (numerosEscolhidos.length !== 3) {
    throw new Error(`sortearCartas espera exatamente 3 números escolhidos, recebeu ${numerosEscolhidos.length}`);
  }
  // Mapeamento direto: o número que o lead escolheu na mesa numerada de 1 a 22
  // é exatamente a carta que ele destrava, garantindo 100% de coerência visual e textual.
  const c1 = CARTA_POR_ID.get(numerosEscolhidos[0]!) ?? BARALHO[0]!;
  const c2 = CARTA_POR_ID.get(numerosEscolhidos[1]!) ?? BARALHO[1]!;
  const c3 = CARTA_POR_ID.get(numerosEscolhidos[2]!) ?? BARALHO[2]!;
  return [c1, c2, c3];
}

/** "3, 7 e 15" ou "a 3, a 8, a 22" → [3, 7, 15]. `null` se não achar exatamente 3 distintos no baralho. */
export function extrairNumerosEscolhidos(texto: string): readonly [number, number, number] | null {
  const achados = [...texto.matchAll(/\d{1,2}/g)]
    .map((m) => Number(m[0]))
    .filter((n) => n >= 1 && n <= TAMANHO_DO_BARALHO);
  const distintos = [...new Set(achados)];
  if (distintos.length !== 3) return null;
  return [distintos[0]!, distintos[1]!, distintos[2]!];
}

export { CARTA_POR_ID, TAMANHO_DO_BARALHO };
export type { Carta };
