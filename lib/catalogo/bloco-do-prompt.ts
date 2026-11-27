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
import { moldeComDesejo } from "@/lib/preco/molde-com-desejo";
import { reais } from "@/lib/preco/tipos";
import { umaLinha } from "@/lib/prompt/texto-do-cliente";

import type { OfertaDaVez } from "./oferta-da-vez";
import type { ProdutoDoCatalogo } from "./tipos";

const dadosAPedir = (p: ProdutoDoCatalogo): string =>
  p.pede
    .map(umaLinha)
    .filter((d) => d !== "")
    .join("; ");

export function blocoDaOfertaDoCatalogo(
  oferta: OfertaDaVez | null,
  /**
   * O turno é uma oferta proativa de OUTRA coisa (o id da oferta não é deste produto). Uma fonte por decisão: neste
   * turno a oferta é a do motivo do retorno, e o produto do catálogo não disputa com ela. Medido em 27/11/2026: a
   * oferta proativa pediu a Pergunta nova como passo menor para quem estava sem dinheiro, e o turno ofereceu a
   * Limpeza de R$ 60, porque o bloco do catálogo também dizia "ofereça NESTE turno".
   */
  outraOfertaNoTurno = false,
): string {
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

  if (outraOfertaNoTurno) {
    linhas.push(
      `- NESTE turno a oferta é a do motivo do retorno: ofereça só ela, e NÃO ofereça ${nome} agora. ${nome} fica para quando o assunto dela encaixar numa conversa. Se ELA pedir ${nome} ou o link, mande o link.`,
    );
  } else if (oferta.livre === true) {
    linhas.push(
      `- O PRÓXIMO PASSO para ela é ${nome}. Ofereça sempre que o assunto dela encaixar, quantas vezes encaixar: quem já comprou é cliente da casa. Primeiro desperte o desejo com o que ELA contou, depois o valor.`,
      `- ACOLHER JUNTO: se ela contou uma dificuldade, acolha PRIMEIRO com as palavras dela e, na MESMA resposta, ofereça ${nome} ligado ao que ela contou.`,
    );
    if (oferta.jaOferecida) {
      linhas.push(
        `- Você já ofereceu ${nome} há pouco. Volte a ele quando a conversa tocar de novo no assunto, por OUTRO caminho (outro desejo, outra imagem) e sem repetir frase que você já mandou. Se ELA pedir o link ou disser que quer, mande o link.`,
      );
    } else {
      linhas.push(`- Ofereça NESTE turno se o assunto encaixa, ${moldeComDesejo(nome, valor, descricao)}`);
    }
    linhas.push(
      "- DAR UM TEMPO só em dois casos: ela disse não a esta oferta, ou disse que está sem dinheiro. Aí acolha e não ofereça nas próximas respostas. Quando ela voltar ao assunto: se o problema era dinheiro, ofereça o passo menor — a cobrança mais barata do assunto dela, ou a entrada agora com o restante depois; se foi um não, ofereça outra coisa que sirva ao assunto dela.",
      "- SEGURAR também diante de algo grave agora (doença séria, hospital, luto, violência, risco à vida): só acolha.",
      '- Sem prazo, sem "só hoje", sem vaga, e NUNCA diga que o que ela comprou não funciona, ou que algo ruim acontece, sem este produto.',
    );
  } else if (oferta.diaria === true) {
    if (oferta.jaOferecida) {
      linhas.push(
        `- A OFERTA DE HOJE (${nome}, ${valor}) JÁ FOI FEITA. NÃO ofereça de novo nem ofereça outra coisa hoje. Se ELA pedir o link ou disser que quer, mande só o link. Siga o acompanhamento do que ela comprou.`,
      );
    } else {
      linhas.push(
        `- A OFERTA DE HOJE é ${nome}. Uma oferta por dia: quem já comprou é cliente da casa, e você oferece o próximo passo todos os dias.`,
        // Medido em 26/11/2026: "dificuldade" segurava a oferta em quase toda compradora (23 de 44 contavam uma
        // a cada mensagem) e só 5 de 37 ouviram a oferta do dia. Acolher e oferecer cabem na mesma resposta.
        `- ACOLHER JUNTO: se ela contou uma dificuldade (briga, solidão, cansaço, decepção, noite sem dormir, ansiedade, saudade), acolha PRIMEIRO com as palavras dela e, na MESMA resposta, ofereça ${nome} ligado ao que ela contou.`,
        "- SEGURAR só em dois casos: algo grave agora (doença séria, hospital, luto, violência, risco à vida) ou ela disse NESTA mensagem que está sem dinheiro. Aí acolha, termine com uma pergunta e ofereça na próxima resposta dela. Segurar é UMA vez: se a sua última resposta já segurou, ofereça agora.",
        `- Nos outros casos, ofereça NESTE turno, ${moldeComDesejo(nome, valor, descricao)}`,
        '- Sem prazo, sem "só hoje", sem vaga, e NUNCA diga que o que ela comprou não funciona, ou que algo ruim acontece, sem este produto. Se ela disser não, agradeça em uma frase e siga o acompanhamento: amanhã vem outra oferta.',
      );
    }
  } else if (oferta.jaOferecida) {
    linhas.push(
      `- Você JÁ ofereceu ${nome} por ${valor} nesta conversa. NÃO ofereça de novo e não insista. Se ELA pedir o link ou disser que quer, mande só o link.`,
    );
  } else {
    linhas.push(
      `- OFERTA (uma vez só): primeiro responda o que ela disse e acompanhe o que ela já comprou. Se a conversa estiver boa, você PODE oferecer ${nome}, ligando ao que ELA contou. Use ESTE molde, ${moldeComDesejo(nome, valor, descricao)}`,
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
