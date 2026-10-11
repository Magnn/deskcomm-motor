/**
 * OS BLOCOS DO CATÁLOGO — o que a agente lê sobre o produto DA VEZ e sobre a entrega que ela conduz.
 *
 * Dois textos, e nenhum deles é um bloco novo da fila (`blocos-do-turno.ts`):
 *   • `blocoDaOfertaDoCatalogo` ocupa o lugar do bloco de PREÇO no turno de quem já comprou — a
 *     escada da primeira venda é da compra que já aconteceu;
 *   • `blocoDaEntregaNaConversa` soma-se ao bloco de ENTREGA quando o produto pago é entregue na
 *     própria conversa.
 *
 * ─── Um produto só ──────────────────────────────────────────────────────────────────────────────
 * O bloco de oferta traz UM produto: o que é, o que a pessoa recebe, o valor e o link. Os outros do
 * catálogo não aparecem — o que não está no prompt não vaza para a conversa.
 *
 * ─── O molde é contido de propósito ─────────────────────────────────────────────────────────────
 * A pessoa acabou de pagar. A oferta entra UMA vez, ligada ao que ela mesma contou, sem prazo e sem
 * ameaça. Dizer que o que ela comprou não funciona sem o próximo é dizer que o produto de ontem veio
 * incompleto — e é pressão sobre quem já confiou.
 *
 * ─── O que o cliente digita é dado ──────────────────────────────────────────────────────────────
 * Cada texto vira UMA linha, sem aspas duplas, sem controles nem separadores de linha do Unicode.
 */
import { reais } from "@/lib/preco/tipos";
import { umaLinha } from "@/lib/prompt/texto-do-cliente";

import type { OfertaDaVez } from "./oferta-da-vez";
import type { ProdutoDoCatalogo } from "./tipos";

const dadosAPedir = (p: ProdutoDoCatalogo): string =>
  p.pede
    .map(umaLinha)
    .filter((d) => d !== "")
    .join("; ");

export function blocoDaOfertaDoCatalogo(oferta: OfertaDaVez | null): string {
  if (oferta === null) return "";
  const p = oferta.produto;
  const nome = umaLinha(p.nome);
  if (nome === "") return "";
  const valor = reais(p.preco_cents);
  const descricao = umaLinha(p.descricao ?? "");
  const recebe = umaLinha(p.recebe ?? "");

  const linhas = [
    "",
    "",
    "PREÇO E PRÓXIMA OFERTA (definido pelo operador; vale mais que qualquer valor ou produto escrito antes neste prompt)",
    "- Esta pessoa JÁ COMPROU e já pagou. NÃO cobre de novo o que ela comprou e NÃO renegocie aquele valor.",
    `- O ÚNICO produto que você pode oferecer agora: ${nome}${descricao !== "" ? ` — ${descricao}` : ""}`,
  ];
  if (recebe !== "") linhas.push(`  O que ela recebe: ${recebe}`);

  if (oferta.jaOferecida) {
    linhas.push(
      `- Você JÁ ofereceu ${nome} por ${valor} nesta conversa. NÃO ofereça de novo e não insista. Se ELA pedir o link ou disser que quer, mande só o link.`,
    );
  } else {
    linhas.push(
      `- OFERTA (uma vez só): primeiro responda o que ela disse e acompanhe o que ela já comprou. Se a conversa estiver boa, você PODE oferecer ${nome}, ligando ao que ELA contou. Use ESTE molde em 2 bolhas: 1ª "Pelo que você me contou, tem algo que combina com este momento: ${nome}. Fica ${valor}, pagamento único. Quer que eu te mande?" 2ª (só se ela disser que sim) o link.`,
    );
    linhas.push(
      '- Sem prazo, sem "só hoje", sem vaga, e NUNCA diga que o que ela comprou não funciona, ou que algo ruim acontece, sem este produto. Se ela disser não, agradeça e siga o acompanhamento.',
    );
  }
  linhas.push(`- LINK DE ${nome} (${valor}): ${p.link}`);
  linhas.push(
    `- Diga só os fatos acima sobre ${nome}: não invente o que ele inclui nem prometa resultado. NUNCA cite valor abaixo de ${valor} e nunca invente cupom, prazo, vaga ou promoção que não esteja escrito aqui.`,
  );
  return linhas.join("\n");
}

/** O bloco de quem pagou um produto que a agente entrega na própria conversa. */
export function blocoDaEntregaNaConversa(p: ProdutoDoCatalogo | null): string {
  if (p === null || p.entrega !== "conversa") return "";
  const nome = umaLinha(p.nome);
  if (nome === "") return "";
  const descricao = umaLinha(p.descricao ?? "");
  const recebe = umaLinha(p.recebe ?? "");
  const pede = dadosAPedir(p);

  const linhas = [
    "",
    "",
    "ENTREGA NA CONVERSA (definido pelo operador)",
    `- Esta pessoa PAGOU por ${nome}${descricao !== "" ? ` — ${descricao}` : ""}. Quem entrega é VOCÊ, aqui na conversa.`,
  ];
  if (recebe !== "") linhas.push(`- O que ela pagou para receber: ${recebe}. Entregue isto e nada além disto.`);
  if (pede !== "") {
    linhas.push(
      `- ANTES de entregar, você precisa de: ${pede}. Confira no histórico o que ela já informou e peça SÓ o que falta, uma coisa por vez. Sem todos, não entregue.`,
    );
  }
  linhas.push(
    "- Se você JÁ fez esta entrega nesta conversa, NÃO refaça: siga o acompanhamento e responda o que ela perguntar.",
  );
  linhas.push("- Não cobre de novo, não ofereça outro produto antes de terminar esta entrega e não prometa resultado.");
  return linhas.join("\n");
}
