/**
 * O PIX QUE NÃO COLOU — a pessoa quer pagar e o código não funcionou.
 *
 * Medido em 21/10/2026, em 21 cobranças não pagas do dia: três eram gente querendo pagar e travada no Pix.
 * "Está dando inválido o código" (o código vence em 1 hora — `VALIDADE_DO_PIX_S` —, e quem volta depois cola um
 * código morto), "não cola" e "não mandou o Pix ainda pra mim" (não reconheceu o texto comprido como o Pix). A
 * agente repetia "o código está aí em cima" ou mandava o link "do cartão", sem dizer que o link também tem Pix.
 *
 * A regra: a última fala da pessoa diz que o Pix não funcionou, e a conversa tem um código Pix enviado nas últimas
 * 24 h → o turno ganha um bloco que manda reenviar a cobrança (o envio gera um código novo e o link) e apontar o
 * link, que tem o Pix com botão de copiar. Pura.
 */
import type { MensagemDoHistorico } from "@/lib/preco/pos-venda";

const PROBLEMA_NO_PIX =
  /inv[aá]lid|n[aã]o (est[aá] |t[aá] )?(cola|colou|colando|deu|dando|funciona|funcionou|aceita|aceitou|vai|foi|consigo|consegui|acho|achei)|deu erro|(c[oó]digo|pix) (errado|vencid|expir)|n[aã]o (mandou|mandaste|enviou|recebi|chegou|veio)( (o|a|esse|essa))? ?(pix|c[oó]digo|chave|link)|cad[eê] o (pix|c[oó]digo|link)/i;

/** A fala diz que o Pix não funcionou. */
export function relatouProblemaNoPix(texto: string): boolean {
  return PROBLEMA_NO_PIX.test(texto);
}

const CODIGO_PIX = /^0002010102\d/m;
const JANELA_MS = 24 * 3_600_000;

/** O bloco do turno. Vazio quando não se aplica. */
export function blocoDoPixQueNaoColou(mensagens: readonly MensagemDoHistorico[], agora: Date): string {
  const quando = (m: MensagemDoHistorico) => (m.sent_at ? Date.parse(m.sent_at) : Number.NaN);
  let ultimaDela: MensagemDoHistorico | null = null;
  for (const m of mensagens) {
    if (m.direction !== "inbound") continue;
    if (ultimaDela === null || !(quando(m) < quando(ultimaDela))) ultimaDela = m;
  }
  if (ultimaDela === null || !relatouProblemaNoPix(ultimaDela.body ?? "")) return "";
  const pixRecente = mensagens.some((m) => {
    if (m.direction !== "outbound" || !CODIGO_PIX.test(m.body ?? "")) return false;
    const t = quando(m);
    return Number.isNaN(t) || agora.getTime() - t <= JANELA_MS;
  });
  if (!pixRecente) return "";
  return [
    "",
    "PIX QUE NÃO FUNCIONOU (a última mensagem dela diz que o Pix deu erro, não colou ou não chegou):",
    "- Ela QUER pagar. Não desista do pagamento, não ofereça desconto, não troque de assunto e não mande chave CNPJ.",
    "- O código do Pix vence em 1 hora: NÃO diga para ela usar o código lá de cima. Mande de novo o link de pagamento do que ela está comprando, sozinho num balão: o sistema troca por um código NOVO e pelo link.",
    "- Antes do link, diga em uma frase: \"Te mando um código novo. Se não colar, é só abrir o link que vem junto: lá tem o Pix com botão de copiar, e também cartão.\"",
  ].join("\n");
}
