/**
 * O BLOCO DE OFERTA — o que o agente lê sobre o que a empresa vende, montado dos CAMPOS que o dono
 * preencheu na aba "Oferta" (`tipos.ts`).
 *
 * Vai no FIM do prompt do turno, logo depois da identidade na fila de blocos (`blocos-do-turno.ts`); o que
 * vem depois — anúncio, estilo, leitura, preço, entrega — vence em conflito. Trocar um campo na tela vale
 * no PRÓXIMO turno, sem publicar versão.
 *
 * ─── "Use SÓ estes fatos" ─────────────────────────────────────────────────────────────────────────
 * O bloco existe para tirar do agente a licença de completar. O cabeçalho diz que os fatos são os da lista
 * e que nada além deles pode ser afirmado, e a garantia sai como uma frase entre aspas que ele repete sem
 * acrescentar prazo, condição ou promessa — o defeito medido de uma versão anterior do agente foi negar um
 * reembolso que a empresa dava, e prometer um que ela não dava.
 *
 * ─── O preço fica de fora ───────────────────────────────────────────────────────────────────────
 * O cabeçalho manda o agente buscar valor e desconto no bloco de preço. Este bloco nunca carrega número de
 * dinheiro: o que o dono escreve aqui entra como dado, e se ele digitar um valor no resumo, o bloco de preço
 * continua sendo a autoridade (a trava de promessas vigia o piso).
 *
 * ─── O que o cliente digita é dado ────────────────────────────────────────────────────────────────
 * Cada texto vira UMA linha, sem aspas duplas, sem controles nem separadores de linha do Unicode.
 *
 * ─── Sem campo, sem bloco ────────────────────────────────────────────────────────────────────────
 * `null`, desligado ou sem produto, garantia nem exclusão devolve '' — o system segue idêntico.
 */
import type { OfertaConfig } from "./tipos";

/** Troca por espaço o que não é texto: controles, DEL e os separadores de linha/parágrafo do Unicode. */
function semControle(texto: string): string {
  let saida = "";
  for (const ch of texto) {
    const c = ch.codePointAt(0) ?? 0;
    saida += c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029 ? " " : ch;
  }
  return saida;
}

/** O texto do cliente como UMA linha, sem aspas duplas nem caracteres de controle. */
function umaLinha(texto: string): string {
  return semControle(texto).replace(/["“”]/g, "'").replace(/\s+/g, " ").trim();
}

const lista = (itens: readonly string[]): string =>
  itens
    .map(umaLinha)
    .filter((i) => i !== "")
    .join("; ");

export function blocoDeOferta(oferta: OfertaConfig | null): string {
  if (oferta === null || !oferta.enabled) return "";

  const linhas: string[] = [];
  for (const p of oferta.produtos) {
    const nome = umaLinha(p.nome);
    if (nome === "") continue;
    const resumo = umaLinha(p.resumo ?? "");
    linhas.push(resumo !== "" ? `- ${nome}: ${resumo}` : `- ${nome}`);
    const inclui = lista(p.inclui);
    if (inclui !== "") linhas.push(`  Inclui: ${inclui}.`);
    const paraQuem = umaLinha(p.para_quem ?? "");
    if (paraQuem !== "") linhas.push(`  Para quem: ${paraQuem}`);
    const entrega = umaLinha(p.entrega ?? "");
    if (entrega !== "") linhas.push(`  Entrega: ${entrega}`);
  }

  const garantia = umaLinha(oferta.garantia ?? "");
  if (garantia !== "") {
    linhas.push(
      `- Garantia e reembolso: se a pessoa perguntar, diga só isto, sem acrescentar prazo, condição ou promessa: "${garantia}"`,
    );
  }
  const naoOferecemos = lista(oferta.nao_oferecemos);
  if (naoOferecemos !== "") linhas.push(`- Nunca prometa nem ofereça: ${naoOferecemos}.`);

  if (linhas.length === 0) return "";
  return [
    "",
    "",
    "OFERTA (o que a empresa vende, definido pelo dono do negócio; use SÓ estes fatos e não invente nada além deles; valores e descontos vêm do bloco de preço, nunca daqui)",
    ...linhas,
  ].join("\n");
}
