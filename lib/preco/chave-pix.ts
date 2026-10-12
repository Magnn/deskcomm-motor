/**
 * O PIX PELA CHAVE DA EMPRESA NA CONVERSA — a opção para quem pede "o número da chave".
 *
 * O padrão continua sendo o Pix criado pelo provedor, que confirma sozinho. Esta é a saída para quem não
 * consegue lidar com link ou cadastro, e para o operador que prefere receber direto na conta: o agente escreve
 * a marca `[[CHAVE PIX: valor]]`, e o envio a troca pela instrução, pelo código copia e cola já com o valor
 * (`lib/pagamentos/pix-estatico.ts`) e pela chave por extenso.
 *
 * O VALOR é escrito pelo modelo, mas só passa se for um dos valores que o turno liberou (o preço em vigor, a
 * entrada, uma cobrança à parte). Valor fora da lista recusa o envio: o modelo não inventa quanto cobrar.
 *
 * O pagamento por chave NÃO confirma sozinho. O bloco manda o agente pedir o comprovante, avisar que a equipe
 * confere e chamar uma pessoa; a entrega só começa quando o pagamento é registrado.
 *
 * Tudo aqui é puro.
 */
import { codigoPixEstatico, chavePixNormalizada } from "@/lib/pagamentos/pix-estatico";

import type { PricingConfig } from "./tipos";
import { reais } from "./tipos";

export type ChavePixDaEmpresa = NonNullable<PricingConfig["pix_key"]>;

const MARCA = /\[\[\s*CHAVE\s+PIX\s*:\s*(?:R\$\s*)?(\d{1,5})(?:[.,](\d{2}))?\s*(?:reais)?\s*\]\]/gi;
const QUALQUER_MARCA = /\[\[\s*CHAVE\s+PIX\b[^\]]*\]\]/i;

/** A chave como a pessoa lê: CNPJ e CPF com pontuação; o resto, como foi cadastrado. */
export function chavePorExtenso(chave: string): string {
  const d = chavePixNormalizada(chave) ?? chave.trim();
  if (/^\d{14}$/.test(d)) return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (/^\d{11}$/.test(d)) return `CPF ${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
}

/** O corpo traz alguma marca de chave Pix, bem formada ou não? Quem chama usa para nunca deixá-la passar crua. */
export const temMarcaDeChavePix = (corpo: string): boolean => QUALQUER_MARCA.test(corpo);

export type SaidaDaChavePix = { corpo: string } | { recusa: string };

/**
 * Troca a marca pela instrução, pelo código e pela chave. Recusa quando não há chave configurada, quando o
 * valor não é um dos liberados no turno, quando há mais de uma marca ou quando o código não pôde ser gerado.
 */
export function pixPelaChaveNoLugarDaMarca(e: {
  corpo: string;
  chave: ChavePixDaEmpresa | null | undefined;
  valoresPermitidosCents: readonly number[];
  identificador: string;
}): SaidaDaChavePix {
  if (!temMarcaDeChavePix(e.corpo)) return { corpo: e.corpo };
  const lista = [...new Set(e.valoresPermitidosCents)].sort((a, b) => b - a).map(reais).join(", ");
  if (!e.chave) return { recusa: "Não há chave Pix da empresa configurada. NÃO use a marca [[CHAVE PIX: …]] e NÃO envie chave nenhuma: mande o pagamento do jeito de sempre." };
  const achadas = [...e.corpo.matchAll(MARCA)];
  if (achadas.length !== 1) {
    return { recusa: `Escreva UMA marca só, com o valor em reais, assim: [[CHAVE PIX: 130]]. Valores liberados agora: ${lista || "nenhum"}.` };
  }
  const cents = Number(achadas[0]![1]) * 100 + Number(achadas[0]![2] ?? 0);
  if (!e.valoresPermitidosCents.includes(cents)) {
    return { recusa: `O valor ${reais(cents)} não está liberado para esta pessoa agora. Valores liberados: ${lista || "nenhum"}. Reescreva a marca com um deles.` };
  }
  const codigo = codigoPixEstatico({ chave: e.chave.key, nome: e.chave.holder, cidade: e.chave.city, valorCentavos: cents, identificador: e.identificador });
  if (codigo === null) return { recusa: "A chave Pix da empresa está cadastrada de um jeito que não gera código. NÃO envie a marca: mande o pagamento do jeito de sempre." };
  const baloes = e.corpo.split(/\n{2,}/);
  const i = baloes.findIndex((b) => b.includes(achadas[0]![0]));
  const resto = baloes[i]!.replace(achadas[0]![0], "").trim();
  const novos = [
    `Pra pagar pela chave Pix: copia o código abaixo e cola no app do seu banco, na opção *Pix Copia e Cola*. Já vai com o valor de *${reais(cents)}* e o nome *${e.chave.holder}*.`,
    codigo,
    `Se preferir digitar a chave, é o ${chavePorExtenso(e.chave.key)}, no valor de ${reais(cents)}. Depois de pagar, me manda o comprovante aqui.`,
  ];
  return { corpo: [...baloes.slice(0, i), ...(resto ? [resto] : []), ...novos, ...baloes.slice(i + 1)].join("\n\n") };
}

/** O bloco do turno. '' quando não há chave configurada ou nenhum valor liberado. */
export function blocoDaChavePix(chave: ChavePixDaEmpresa | null | undefined, valoresPermitidosCents: readonly number[]): string {
  const valores = [...new Set(valoresPermitidosCents)].sort((a, b) => b - a);
  if (!chave || valores.length === 0) return "";
  return [
    "",
    "",
    "PIX PELA CHAVE DA EMPRESA (opção; o jeito padrão de cobrar continua sendo o descrito acima)",
    `- Use SÓ quando a pessoa pedir "a chave Pix" ou "o número do Pix", disser que não sabe ou não consegue pagar pelo código ou pelo link, ou pedir para outra pessoa fazer a transferência.`,
    `- Para mandar, escreva sozinha num balão a marca com o valor em reais, assim: [[CHAVE PIX: ${Math.round(valores[0]! / 100)}]]. Valores liberados para esta pessoa agora: ${valores.map(reais).join(", ")}. O sistema troca a marca pelo código, pela chave e pelo nome ${chave.holder}. NUNCA digite a chave você mesma.`,
    `- O pagamento pela chave NÃO confirma sozinho. Quando ela mandar o comprovante, diga em um balão que a equipe está conferindo e que você avisa assim que confirmar, e chame o atendimento humano com o motivo "Pix pela chave: conferir o comprovante e registrar o pagamento". NÃO entregue nada e NÃO diga que o pagamento caiu antes de o sistema confirmar.`,
  ].join("\n");
}
