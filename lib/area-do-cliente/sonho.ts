/**
 * A INTERPRETAÇÃO DE SONHOS (migration 0952) — pedido dos comentários das lojas (02/11/2026): "queria um lugar
 * para contar meus sonhos e entender o que significam".
 *
 * O caminho, no molde da leitura da mão (`mao.ts`): a pessoa escreve o sonho, a IA separa os símbolos que
 * aparecem nele (de 2 a 4) e lê cada um ligado ao que ela contou. O PRIMEIRO símbolo aparece inteiro de graça; os
 * outros mostram só o nome, e a leitura deles, a mensagem do sonho e um passo abrem com créditos, Pix ou cartão.
 *
 * Sonho não é previsão: sonhar com morte, doença ou acidente é lido como símbolo (fim de um ciclo, medo, cuidado),
 * nunca como aviso de que vai acontecer. Texto que não é um sonho (pedido, teste, instrução) é recusado sem cobrar.
 *
 * Pura.
 */
export const EXTRA_DO_SONHO = "leitura-do-sonho";

export const RELATO_MINIMO = 20;
export const RELATO_MAXIMO = 1500;

/** Quantos sonhos uma pessoa pode contar por dia: cada um é uma chamada de IA paga por nós. */
export const SONHOS_POR_DIA = 3;

export interface SimboloDoSonho {
  simbolo: string;
  leitura: string;
}

export interface LeituraDoSonho {
  simbolos: SimboloDoSonho[];
  mensagem: string;
  passo: string;
}

export interface ConfigDoSonho {
  ativo: boolean;
  preco_cents: number;
}

/**
 * A interpretação de sonhos é LIGADA pela empresa (chave própria no painel, "Interpretação de sonhos"): não herda
 * a Mesa, porque precisa da tabela da migration 0952 aplicada antes de aparecer. Sem preço, R$ 12.
 */
export function configDoSonho(
  sonho: { ativo?: boolean; preco_cents?: number } | undefined,
): ConfigDoSonho {
  return {
    ativo: sonho?.ativo ?? false,
    preco_cents: sonho?.preco_cents ?? 1200,
  };
}

/** O relato limpo (espaços sobrando, linhas em branco em excesso) ou `null` fora do tamanho. */
export function relatoValido(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const r = bruto.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return r.length >= RELATO_MINIMO && r.length <= RELATO_MAXIMO ? r : null;
}

const texto = (v: unknown, teto: number): string => (typeof v === "string" ? v.trim().slice(0, teto) : "");

/**
 * Lê a resposta da IA. `"nao_e_sonho"` quando o texto não conta um sonho; `null` quando a resposta não serve
 * (JSON quebrado, menos de 2 símbolos, mensagem faltando).
 */
export function lerLeituraDoSonho(bruto: string): LeituraDoSonho | "nao_e_sonho" | null {
  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  let j: { eh_sonho?: unknown; simbolos?: unknown; mensagem?: unknown; passo?: unknown };
  try {
    j = JSON.parse(bruto.slice(inicio, fim + 1)) as typeof j;
  } catch {
    return null;
  }
  if (j.eh_sonho === false) return "nao_e_sonho";
  if (!Array.isArray(j.simbolos)) return null;
  const simbolos = (j.simbolos as Array<{ simbolo?: unknown; leitura?: unknown } | null>)
    .map((s) => ({ simbolo: texto(s?.simbolo, 80), leitura: texto(s?.leitura, 1500) }))
    .filter((s) => s.simbolo && s.leitura)
    .slice(0, 4);
  if (simbolos.length < 2) return null;
  const mensagem = texto(j.mensagem, 1500);
  const passo = texto(j.passo, 600);
  if (!mensagem || !passo) return null;
  return { simbolos, mensagem, passo };
}

/** O que vai à tela: tudo se paga; senão o primeiro símbolo inteiro e, nos outros, só o nome. */
export function sonhoNaTela(l: LeituraDoSonho, paga: boolean): {
  simbolos: Array<{ simbolo: string; leitura: string | null }>;
  mensagem: string | null;
  passo: string | null;
} {
  return {
    simbolos: l.simbolos.map((s, i) => (paga || i === 0 ? s : { simbolo: s.simbolo, leitura: null })),
    mensagem: paga ? l.mensagem : null,
    passo: paga ? l.passo : null,
  };
}
