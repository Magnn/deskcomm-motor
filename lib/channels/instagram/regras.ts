/**
 * COMENTOU, RECEBE DIRECT — as regras, puras.
 *
 * Uma regra diz: em quais publicações, com quais palavras no comentário, qual
 * mensagem vai no direct e (se houver) qual resposta pública aparece embaixo do
 * comentário. Aqui mora o que decide se um comentário é atendido e por qual
 * regra — sem banco e sem rede, para ser testável.
 *
 * Os vocabulários são os mesmos dos CHECKs da migration 0910.
 */

export const ESCOPO_DAS_PUBLICACOES = ["all", "specific"] as const;
export type EscopoDasPublicacoes = (typeof ESCOPO_DAS_PUBLICACOES)[number];

export const TIPO_DE_CASAMENTO = ["any", "contains", "exact"] as const;
export type TipoDeCasamento = (typeof TIPO_DE_CASAMENTO)[number];

export const STATUS_DO_DIRECT = ["pending", "sent", "failed"] as const;
export type StatusDoDirect = (typeof STATUS_DO_DIRECT)[number];

export const STATUS_DA_RESPOSTA_PUBLICA = ["pending", "sent", "failed", "skipped"] as const;
export type StatusDaRespostaPublica = (typeof STATUS_DA_RESPOSTA_PUBLICA)[number];

export const STATUS_DA_CONEXAO = ["active", "error"] as const;
export type StatusDaConexao = (typeof STATUS_DA_CONEXAO)[number];

export interface RegraDeComentario {
  id: string;
  is_active: boolean;
  post_scope: EscopoDasPublicacoes;
  post_ids: string[];
  match_type: TipoDeCasamento;
  keywords: string[];
  dm_message: string;
  public_replies: string[];
}

const ACENTOS = /[̀-ͯ]/g;

/**
 * Como um comentário e uma palavra-chave são comparados: sem acento, sem caixa e
 * com espaços colapsados. Quem comenta "QUERO!!" ou "quéro" quis dizer "quero".
 */
export function normalizarComentario(texto: string): string {
  return texto.normalize("NFD").replace(ACENTOS, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Só letras, números e espaços — para o casamento EXATO não tropeçar em "quero!" ou "quero 🙏". */
function soPalavras(texto: string): string {
  return normalizarComentario(texto)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** O comentário aciona a regra, pelas palavras? */
export function comentarioCasa(texto: string, regra: Pick<RegraDeComentario, "match_type" | "keywords">): boolean {
  if (regra.match_type === "any") return true;
  const palavras = regra.keywords.map(soPalavras).filter((p) => p !== "");
  // Regra por palavra SEM palavra não casa com nada: casar com tudo mandaria
  // direct a todo comentário de uma conta por causa de um campo esquecido.
  if (palavras.length === 0) return false;
  const comentario = soPalavras(texto);
  if (comentario === "") return false;
  if (regra.match_type === "exact") return palavras.includes(comentario);
  // "contém": a palavra inteira, não um pedaço — "eu" não casa com "meu".
  const cercado = ` ${comentario} `;
  return palavras.some((p) => cercado.includes(` ${p} `));
}

/** A regra vale para esta publicação? */
export function regraValeParaAPublicacao(regra: Pick<RegraDeComentario, "post_scope" | "post_ids">, mediaId: string | null): boolean {
  if (regra.post_scope === "all") return true;
  return mediaId !== null && regra.post_ids.includes(mediaId);
}

/**
 * A regra que atende o comentário: a primeira ATIVA, na ordem dada, que vale para
 * a publicação e casa com o texto. Regra de publicação específica vem antes de
 * regra de "todas as publicações" — quem montou uma regra para um post quer que
 * ela ganhe da regra geral.
 */
export function regraQueAtende<R extends RegraDeComentario>(
  regras: readonly R[],
  comentario: { texto: string; mediaId: string | null },
): R | null {
  const ativas = regras.filter((r) => r.is_active && regraValeParaAPublicacao(r, comentario.mediaId));
  const ordenadas = [...ativas.filter((r) => r.post_scope === "specific"), ...ativas.filter((r) => r.post_scope === "all")];
  return ordenadas.find((r) => comentarioCasa(comentario.texto, r)) ?? null;
}

/** Uma das respostas públicas, ao acaso — variar evita o mesmo texto repetido embaixo de vários comentários. */
export function escolherRespostaPublica(variacoes: readonly string[], rng: () => number = Math.random): string | null {
  const validas = variacoes.map((v) => v.trim()).filter((v) => v !== "");
  if (validas.length === 0) return null;
  return validas[Math.min(validas.length - 1, Math.floor(rng() * validas.length))] ?? null;
}

/** `{{usuario}}` na mensagem vira o @ de quem comentou. Sem nome de usuário, a marca some sem deixar buraco. */
export function preencherMensagem(mensagem: string, quem: { username: string | null }): string {
  const arroba = quem.username ? `@${quem.username}` : "";
  return mensagem
    .replace(/\{\{\s*usuario\s*\}\}/gi, arroba)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.!?])/g, "$1")
    .trim();
}
