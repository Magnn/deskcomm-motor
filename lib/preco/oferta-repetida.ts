/**
 * A OFERTA DUAS VEZES SEGUIDAS. Em 20/11/2026 a Cigana ofereceu o Acompanhamento (R$ 75), a cliente respondeu
 * "Se até terça nada significativo acontecer vou propor" — sem aceitar —, e a resposta seguinte ofereceu de novo,
 * com o mesmo valor, já pedindo para mandar a chave. Insistir em cima de quem não disse sim é o que faz a pessoa
 * sumir (e, no WhatsApp, denunciar).
 *
 * A regra: um valor (R$) que estava na resposta ANTERIOR da agente não volta na resposta seguinte, a menos que a
 * pessoa, no meio, tenha dado abertura (sim, quero, pediu a chave, perguntou o valor, como pagar…). Valor NOVO
 * (outra oferta, outro preço da escada) não é repetição. Balões do MESMO turno também não: o valor costuma ir num
 * balão e a marca do Pix no seguinte.
 */

export interface MensagemDaConversa {
  direction: "inbound" | "outbound" | string;
  body: string | null;
}

const VALOR = /R\$\s?(\d{1,4}(?:[.,]\d{2})?)/gi;
const RECUSA = /\bn[ãa]o (quero|posso|tenho|vou|d[áa])\b|\bagora n[ãa]o\b|\bsem (dinheiro|condi[çc])|\bdepois (eu )?(vejo|penso|falo)/i;
const ABERTURA =
  /\b(sim|quero|aceito|pode (mandar|ser|fazer)|mand[ae]|vamos|bora|fechado|fechou|ok|t[áa] bom|combinado|como (eu )?(pago|fa[çc]o)|chave|pix|cart[ãa]o|link|quanto|valor|pre[çc]o|parcel|paguei|fiz o|como funciona|me explica|o que (vem|inclui|tem))/i;

function valores(texto: string): Set<string> {
  return new Set([...texto.matchAll(VALOR)].map((m) => m[1]!.replace(",", ".").replace(/\.00$/, "")));
}

/** A recusa (texto para a agente) quando `corpo` repete um valor da resposta anterior sem abertura; senão null. */
export function ofertaRepetidaSeguida(corpo: string, historico: readonly MensagemDaConversa[]): string | null {
  const agora = valores(corpo);
  if (agora.size === 0) return null;

  // A última fala da pessoa (o bloco de mensagens seguidas dela) e a resposta da agente logo antes desse bloco.
  let fim = historico.length - 1;
  while (fim >= 0 && historico[fim]!.direction !== "inbound") fim--;
  if (fim < 0) return null;
  let inicio = fim;
  while (inicio > 0 && historico[inicio - 1]!.direction === "inbound") inicio--;
  const fala = historico.slice(inicio, fim + 1).map((m) => m.body ?? "").join(" ");
  const anterior: string[] = [];
  for (let i = inicio - 1; i >= 0 && historico[i]!.direction !== "inbound"; i--) anterior.push(historico[i]!.body ?? "");

  const antes = valores(anterior.join(" "));
  const repetidos = [...agora].filter((v) => antes.has(v));
  if (repetidos.length === 0) return null;
  if (!RECUSA.test(fala) && ABERTURA.test(fala)) return null;

  return (
    `Você já ofereceu R$ ${repetidos.join(", R$ ")} na sua resposta anterior, e ela respondeu sem aceitar. ` +
    "NÃO repita a oferta nem o valor agora: responda ao que ela disse, com cuidado, e siga a conversa. " +
    "A oferta só volta quando ela der abertura (disser que quer, perguntar o valor ou como pagar) ou em outro dia."
  );
}
