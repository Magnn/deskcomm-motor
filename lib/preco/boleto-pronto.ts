/**
 * O BOLETO PRONTO NA CONVERSA — para quem paga na lotérica e não sabe preencher uma página de pagamento.
 *
 * ─── Por que existe ───────────────────────────────────────────────────────────────────
 * Medido em 12/10/2026: 38 pessoas em uma semana disseram que só pagam na lotérica, por boleto, ou que não têm
 * Pix nem cartão. O link de pagamento resolve para quem consegue preencher nome, CPF e endereço numa página;
 * parte desse público escreveu que não sabe ler direito ou "não sabe mexer em link". Para elas, o agente pede
 * três dados na conversa e entrega o boleto já emitido.
 *
 * ─── Como funciona ────────────────────────────────────────────────────────────────────
 * O agente pede nome completo, CPF e CEP, e escreve a marca `[[BOLETO: valor | nome | CPF | CEP]]`. O envio
 * confere o valor contra os que o turno liberou, confere o CPF, busca o endereço pelo CEP, emite o boleto no
 * provedor e troca a marca pelo link do boleto e pela linha digitável. O CPF NÃO volta no texto enviado.
 *
 * Aqui mora a parte pura: a leitura da marca, a conferência do CPF, o bloco do turno e a reescrita do corpo.
 * Quem fala com a rede é `lib/agent-engine/agent/boleto-no-envio.ts`.
 */
import { reais } from "./tipos";

export interface PedidoDeBoletoNaMarca {
  valorCents: number;
  nome: string;
  cpf: string;
  cep: string;
  email: string | null;
  /** O texto exato da marca no corpo, para a troca. */
  texto: string;
}

const MARCA = /\[\[\s*BOLETO\s*:\s*([^\]]*)\]\]/gi;
const QUALQUER_MARCA = /\[\[\s*BOLETO\b[^\]]*\]\]/i;

/** O corpo traz alguma marca de boleto, bem formada ou não? Quem chama usa para nunca deixá-la passar crua. */
export const temMarcaDeBoleto = (corpo: string): boolean => QUALQUER_MARCA.test(corpo);

/** CPF com os dois dígitos verificadores certos (e que não seja um dígito repetido onze vezes). */
export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

export type MarcaDeBoleto = { tipo: "nenhuma" } | { tipo: "uma"; pedido: PedidoDeBoletoNaMarca } | { tipo: "invalida"; motivo: string };

const FORMATO = "[[BOLETO: 130 | Nome Completo | 000.000.000-00 | 00000-000]]";

/** Lê a marca: nenhuma, uma bem formada, ou o motivo de não servir (que volta ao modelo). Pura. */
export function marcaDeBoletoNoCorpo(corpo: string): MarcaDeBoleto {
  if (!temMarcaDeBoleto(corpo)) return { tipo: "nenhuma" };
  const achadas = [...corpo.matchAll(MARCA)];
  if (achadas.length !== 1) return { tipo: "invalida", motivo: `Escreva UMA marca de boleto, neste formato: ${FORMATO}` };
  const partes = (achadas[0]![1] ?? "").split("|").map((p) => p.trim());
  if (partes.length < 4) return { tipo: "invalida", motivo: `Faltam dados na marca. O formato é: ${FORMATO}. Se a pessoa ainda não mandou nome completo, CPF e CEP, peça os três antes.` };
  const valor = /^(?:R\$\s*)?(\d{1,5})(?:[.,](\d{2}))?$/i.exec(partes[0] ?? "");
  if (!valor) return { tipo: "invalida", motivo: `O primeiro campo da marca é o valor em reais, só o número. Formato: ${FORMATO}` };
  const nome = (partes[1] ?? "").replace(/\s+/g, " ");
  if (nome.split(" ").length < 2 || nome.length > 80) return { tipo: "invalida", motivo: "Para o boleto é preciso o NOME COMPLETO (nome e sobrenome). Peça de novo, com carinho." };
  const cpf = (partes[2] ?? "").replace(/\D/g, "");
  if (!cpfValido(cpf)) return { tipo: "invalida", motivo: "O CPF informado não confere (são 11 números). Peça para ela conferir e mandar de novo. NÃO invente nem corrija o CPF." };
  const cep = (partes[3] ?? "").replace(/\D/g, "");
  if (cep.length !== 8) return { tipo: "invalida", motivo: "O CEP tem 8 números. Peça o CEP de novo; se ela não souber, peça o CEP da rua ou da cidade dela." };
  const email = (partes[4] ?? "").trim();
  return {
    tipo: "uma",
    pedido: {
      valorCents: Number(valor[1]) * 100 + Number(valor[2] ?? 0),
      nome,
      cpf,
      cep,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
      texto: achadas[0]![0],
    },
  };
}

/**
 * Reescreve o corpo: o balão da marca vira o link do boleto, a linha digitável sozinha (para copiar) e o aviso
 * do prazo. O CPF e o CEP da marca somem do que é enviado. Pura.
 */
export function corpoComBoleto(corpo: string, pedido: PedidoDeBoletoNaMarca, boleto: { url: string; linhaDigitavel: string | null }): string {
  const baloes = corpo.split(/\n{2,}/);
  const i = baloes.findIndex((b) => b.includes(pedido.texto));
  if (i < 0) return corpo;
  const resto = baloes[i]!.replace(pedido.texto, "").trim();
  const novos = [
    `O seu boleto de *${reais(pedido.valorCents)}* está pronto. É só abrir e pagar na lotérica, no caixa do banco ou no aplicativo: ${boleto.url}`,
    ...(boleto.linhaDigitavel ? [boleto.linhaDigitavel] : []),
    "Depois de pago, o boleto leva até 1 dia útil pra confirmar. Assim que confirmar eu vejo aqui e sigo com você.",
  ];
  return [...baloes.slice(0, i), ...(resto ? [resto] : []), ...novos, ...baloes.slice(i + 1)].join("\n\n");
}

/** O bloco do turno. '' quando não há valor liberado. */
export function blocoDoBoletoPronto(valoresPermitidosCents: readonly number[]): string {
  const valores = [...new Set(valoresPermitidosCents)].sort((a, b) => b - a);
  if (valores.length === 0) return "";
  return [
    "",
    "",
    "BOLETO PRONTO (para quem paga na lotérica, por boleto ou depósito, ou não tem Pix nem cartão)",
    `- Quando a pessoa disser isso, NÃO insista no Pix: diga que você emite o boleto pra ela pagar na lotérica, no banco ou no aplicativo, e peça numa mensagem só: *nome completo*, *CPF* e *CEP* de onde ela mora. Diga que é o que o banco exige para emitir o boleto.`,
    `- Quando ela mandar os três, escreva sozinha num balão a marca, com o valor em reais na frente: [[BOLETO: ${Math.round(valores[0]! / 100)} | Nome Completo | CPF | CEP]]. Valores liberados para esta pessoa agora: ${valores.map(reais).join(", ")}. O sistema emite o boleto e troca a marca pelo link e pela linha digitável.`,
    "- NÃO repita o CPF nem o CEP dela em nenhuma outra mensagem. NÃO invente dado que ela não mandou. Se faltar um dos três, peça só o que falta.",
    "- O boleto leva até 1 dia útil para confirmar depois de pago. NÃO diga que o pagamento caiu e NÃO entregue nada antes de o sistema confirmar.",
  ].join("\n");
}
