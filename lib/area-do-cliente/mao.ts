/**
 * A LEITURA DA MÃO pela foto (migration 0951) — pedido de 02/11/2026, modelado no MagicWay e no que os
 * comentários dele pedem.
 *
 * O caminho: a pessoa fotografa a palma, a IA de visão olha as linhas e escreve a leitura das cinco (coração,
 * cabeça, vida, destino, sol). A do CORAÇÃO aparece de graça na hora; as outras quatro e a síntese abrem com
 * créditos, Pix ou cartão. Mostrar antes de cobrar é a resposta à reclamação nº 1 dos comentários ("cobra
 * antes de mostrar qualquer coisa").
 *
 * A FOTO NÃO É GUARDADA: vai para a IA e é descartada; fica só o texto. Nada de "quanto tempo vai viver",
 * doença ou morte — a linha da vida fala de vitalidade e de como ela vive, não de duração.
 *
 * Pura.
 */
export const EXTRA_DA_MAO = "leitura-da-mao";

export const LINHAS_DA_MAO = ["coracao", "cabeca", "vida", "destino", "sol"] as const;
export type LinhaDaMao = (typeof LINHAS_DA_MAO)[number];

/** A linha que sai de graça, antes de cobrar. */
export const LINHA_GRATIS: LinhaDaMao = "coracao";

export const NOME_DA_LINHA: Record<LinhaDaMao, string> = {
  coracao: "Linha do coração",
  cabeca: "Linha da cabeça",
  vida: "Linha da vida",
  destino: "Linha do destino",
  sol: "Linha do sol",
};

/** O que cada linha fala, para a tela e para o pedido à IA. */
export const TEMA_DA_LINHA: Record<LinhaDaMao, string> = {
  coracao: "amor, afeto e o jeito de se entregar",
  cabeca: "pensamento, decisões e intuição",
  vida: "vitalidade, raízes e o jeito de viver as mudanças (nunca duração da vida)",
  destino: "caminho, trabalho e propósito",
  sol: "brilho, reconhecimento e alegria",
};

/** Quantas fotos de mão uma pessoa pode mandar por dia: cada foto é uma chamada de visão paga por nós. */
export const FOTOS_POR_DIA = 3;

/** Teto da foto recebida (a câmera do celular passa disso; a tela reduz antes de mandar). */
export const TETO_DA_FOTO_BYTES = 8 * 1024 * 1024;
export const TIPOS_DA_FOTO: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface LeituraDaLinha {
  linha: LinhaDaMao;
  /** O que a IA viu na foto ("longa e curva, termina entre o indicador e o médio"). */
  visto: string;
  leitura: string;
}

export interface LeituraDaMao {
  linhas: LeituraDaLinha[];
  sintese: string;
  passo: string;
}

export interface ConfigDaMao {
  ativo: boolean;
  preco_cents: number;
}

/**
 * A configuração da leitura da mão. Sem bloco próprio, ela segue a Mesa de leituras (é o mesmo tipo de
 * produto, na mesma prateleira) e custa R$ 15.
 */
export function configDaMao(
  mao: { ativo?: boolean; preco_cents?: number } | undefined,
  leituras: { ativo?: boolean } | undefined,
): ConfigDaMao {
  return {
    ativo: mao?.ativo ?? leituras?.ativo ?? false,
    preco_cents: mao?.preco_cents ?? 1500,
  };
}

const texto = (v: unknown, teto: number): string => (typeof v === "string" ? v.trim().slice(0, teto) : "");

/**
 * Lê a resposta da IA. `"nao_e_mao"` quando a foto não mostra uma palma legível; `null` quando a resposta
 * não serve (JSON quebrado, linha faltando).
 */
export function lerLeituraDaMao(bruto: string): LeituraDaMao | "nao_e_mao" | null {
  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  let j: { eh_mao?: unknown; linhas?: unknown; sintese?: unknown; passo?: unknown };
  try {
    j = JSON.parse(bruto.slice(inicio, fim + 1)) as typeof j;
  } catch {
    return null;
  }
  if (j.eh_mao === false) return "nao_e_mao";
  if (!j.linhas || typeof j.linhas !== "object") return null;
  const brutas = j.linhas as Record<string, { visto?: unknown; leitura?: unknown } | undefined>;
  const linhas: LeituraDaLinha[] = [];
  for (const linha of LINHAS_DA_MAO) {
    const b = brutas[linha];
    const leitura = texto(b?.leitura, 2000);
    if (!leitura) return null;
    linhas.push({ linha, visto: texto(b?.visto, 300), leitura });
  }
  const sintese = texto(j.sintese, 2000);
  const passo = texto(j.passo, 600);
  if (!sintese || !passo) return null;
  return { linhas, sintese, passo };
}

/**
 * O que vai à tela: a leitura inteira se paga; senão a linha grátis inteira e, nas outras, só o que foi VISTO
 * na foto ("longa e funda") — a prova de que a leitura é da mão dela —, com a interpretação fechada.
 */
export function leituraNaTela(l: LeituraDaMao, paga: boolean): {
  linhas: Array<{ linha: LinhaDaMao; visto: string; leitura: string | null }>;
  sintese: string | null;
  passo: string | null;
} {
  return {
    linhas: l.linhas.map((x) => (paga || x.linha === LINHA_GRATIS ? x : { linha: x.linha, visto: x.visto, leitura: null })),
    sintese: paga ? l.sintese : null,
    passo: paga ? l.passo : null,
  };
}
