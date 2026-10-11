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
 * A semente mistura o id do CONTATO com os 3 números escolhidos (e, quando a conversa
 * a tem, a RODADA — o instante da mensagem em que a pessoa escolheu): duas pessoas
 * que escolherem "3, 7, 15" recebem cartas diferentes entre si (a leitura não
 * vira uma tabela pública de "número → carta"), e a mesma pessoa que volta outro
 * dia e escolhe os mesmos números ganha outra leitura (pedido do dono do produto:
 * "cada leitura diferente da outra"). DENTRO de uma leitura, porém, a semente não
 * muda — todo turno re-deriva as mesmas 3 a partir da mesma mensagem de escolha.
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
export function sortearCartas(
  contatoId: string,
  numerosEscolhidos: readonly number[],
  rodada?: string,
): readonly [Carta, Carta, Carta] {
  if (numerosEscolhidos.length !== 3) {
    throw new Error(`sortearCartas espera exatamente 3 números escolhidos, recebeu ${numerosEscolhidos.length}`);
  }
  const numeros = [...numerosEscolhidos].sort((a, b) => a - b).join(",");
  const semente = rodada ? `${contatoId}:${numeros}:${rodada}` : `${contatoId}:${numeros}`;
  const rng = pseudoAleatorioDaSemente(semente);
  // Fisher-Yates com o rng determinístico — embaralha o baralho inteiro e
  // pega as 3 primeiras, então duas pessoas com a mesma semente nunca tiram
  // carta repetida entre si na mesma leitura.
  const baralho = [...BARALHO];
  for (let i = baralho.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [baralho[i], baralho[j]] = [baralho[j]!, baralho[i]!];
  }
  return [baralho[0]!, baralho[1]!, baralho[2]!];
}

/**
 * COMO AS PESSOAS ESCREVEM OS 3 NÚMEROS. Medido em produção em 11/10/2026: de cada quatro cartas
 * reveladas, uma saía sem a foto e com a carta inventada pelo modelo, porque a escolha só era
 * reconhecida numa forma — três algarismos separados, numa mensagem só. O que chegava de verdade:
 *   "469" e "789" (colados), "7" · "10" · "19" (um por mensagem), "Dez quinze um" e
 *   "três, onze e vinte dois" (por extenso, inclusive de áudio transcrito).
 */
const POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16,
  dezessete: 17, dezassete: 17, dezoito: 18, dezenove: 19, dezanove: 19, vinte: 20,
};

/** Palavras que acompanham uma escolha sem mudar o sentido ("escolho a número 3 e a 8"). */
const ENCHIMENTO = new Set([
  'numero', 'numeros', 'n', 'no', 'nº', 'e', 'a', 'o', 'as', 'os', 'carta', 'cartas', 'escolho', 'escolhi', 'quero', 'vou', 'de',
  'da', 'do', 'eu', 'meu', 'meus', 'sao', 'foi', 'foram', 'os', 'mais', 'tambem', 'depois', 'audio', 'transcricao', 'ok', 'pronto',
]);

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
}

/**
 * Os números do baralho que a mensagem traz, na ordem, sem repetição — e se a mensagem é SÓ isso.
 * `soNumeros` separa "7" e "dez quinze um" (respostas ao pedido) de "tenho um problema há 2 anos"
 * (conversa): número por extenso e número solto só valem como escolha quando a mensagem é só números.
 */
export function numerosNaMensagem(texto: string): { numeros: number[]; soNumeros: boolean } {
  const limpo = semAcento(texto).replace(/\[[^\]]*\]/g, ' ');
  const palavras = limpo.split(/[^a-z0-9º]+/).filter((p) => p !== '');
  const numeros: number[] = [];
  let sobra = 0;
  const por = (n: number) => {
    if (n >= 1 && n <= TAMANHO_DO_BARALHO && !numeros.includes(n)) numeros.push(n);
  };
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i]!;
    if (/^\d+$/.test(p)) {
      if (p.length <= 2) por(Number(p));
      // "469": três algarismos colados são três cartas de um algarismo.
      else if (p.length === 3) for (const d of p) por(Number(d));
      // "101519": seis algarismos colados são três cartas de dois.
      else if (p.length === 6) for (const par of p.match(/\d{2}/g) ?? []) por(Number(par));
      else sobra += 1;
      continue;
    }
    const valor = POR_EXTENSO[p];
    if (valor !== undefined) {
      // "vinte e um", "vinte dois"
      const j = palavras[i + 1] === 'e' ? i + 2 : i + 1;
      const unidade = valor === 20 ? POR_EXTENSO[palavras[j] ?? ''] : undefined;
      if (unidade !== undefined && unidade >= 1 && unidade <= 2) {
        por(20 + unidade);
        i = j;
      } else por(valor);
      continue;
    }
    if (!ENCHIMENTO.has(p)) sobra += 1;
  }
  return { numeros, soNumeros: sobra === 0 && numeros.length > 0 };
}

/**
 * A escolha feita numa mensagem só: `null` se ela não trouxer exatamente 3 números distintos do baralho.
 * Algarismos valem em qualquer frase ("quero a 3, a 8 e a 22"); por extenso e colados, só quando a
 * mensagem é só números.
 */
export function extrairNumerosEscolhidos(texto: string): readonly [number, number, number] | null {
  const achados = [...texto.matchAll(/\d{1,2}/g)]
    .map((m) => Number(m[0]))
    .filter((n) => n >= 1 && n <= TAMANHO_DO_BARALHO);
  const distintos = [...new Set(achados)];
  const semColados = !/\d{3,}/.test(texto);
  if (semColados && distintos.length === 3) return [distintos[0]!, distintos[1]!, distintos[2]!];
  if (semColados && distintos.length > 3) return null;
  const lido = numerosNaMensagem(texto);
  if (lido.soNumeros && lido.numeros.length === 3) return [lido.numeros[0]!, lido.numeros[1]!, lido.numeros[2]!];
  return null;
}

export { CARTA_POR_ID, TAMANHO_DO_BARALHO };
export type { Carta };
