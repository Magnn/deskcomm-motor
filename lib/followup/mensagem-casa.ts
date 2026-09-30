/**
 * O predicado do gatilho «mensagem recebida» (`trigger_config.kind='inbound_message'`).
 *
 * Puro de propósito: o PRODUTOR (`gatilho-mensagem.ts`) e o SILENCIADOR do agente
 * (`ceder-turno-a-mensagem.ts`) precisam decidir "esta mensagem dispara o fluxo?"
 * pela MESMA regra — duas cópias é como o cliente passa a receber a voz do fluxo
 * E a do agente, ou nenhuma das duas.
 */

export type ModoDaMensagem = "any" | "first_message" | "keyword";
export type ModoDaPalavra = "contains" | "equals";

export interface ParamsDaMensagem {
  match: ModoDaMensagem;
  keywords?: string[];
  keyword_mode?: ModoDaPalavra;
}

/**
 * Minúsculas, sem acento e sem pontuação nas pontas. O cliente escreve «QUERO»,
 * «Quero!» e «quéro» — um gatilho que só casa a forma digitada pelo dono do
 * fluxo dispara para metade das pessoas.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A palavra aparece como PALAVRA (não como pedaço de outra): «sim» não casa «simples». */
function contemPalavra(textoNormalizado: string, palavra: string): boolean {
  if (palavra === "") return false;
  const alvo = ` ${textoNormalizado} `;
  return alvo.replace(/[^\p{L}\p{N}]+/gu, " ").includes(` ${palavra} `);
}

export function palavraCasa(texto: string | null, palavras: readonly string[], modo: ModoDaPalavra): boolean {
  if (texto === null) return false;
  const t = normalizarTexto(texto);
  if (t === "") return false;
  return palavras.some((p) => {
    const alvo = normalizarTexto(p);
    if (alvo === "") return false;
    return modo === "equals" ? t === alvo : contemPalavra(t, alvo);
  });
}

/**
 * @param texto  corpo da mensagem (`null` para mídia sem legenda)
 * @param primeiraDoContato  `true` quando não existe inbound anterior deste contato
 */
export function mensagemDisparaFluxo(
  params: ParamsDaMensagem,
  texto: string | null,
  primeiraDoContato: boolean,
): boolean {
  switch (params.match) {
    case "any":
      return true;
    case "first_message":
      return primeiraDoContato;
    case "keyword":
      return palavraCasa(texto, params.keywords ?? [], params.keyword_mode ?? "contains");
  }
}
