/**
 * O PIX PELA CHAVE DA EMPRESA NA CONVERSA — a opção para quem pede "o número da chave".
 *
 * O padrão continua sendo o Pix criado pelo provedor, que confirma sozinho. Esta é a saída para quem não
 * consegue lidar com link ou cadastro, e para o operador que prefere receber direto na conta: o agente escreve
 * a marca `[[CHAVE PIX: valor]]`, e o envio a troca pela instrução, pelo código copia e cola já com o valor
 * (`lib/pagamentos/pix-estatico.ts`) e pela chave por extenso.
 *
 * Com `primary` ligado, a chave deixa de ser o último recurso: toda cobrança Pix em reais sai por ela (a venda, a
 * entrada, o restante, as avulsas, o fluxo e o botão do atendente), sem provedor. Decisão do dono em 01/11/2026.
 * A pessoa recebe a chave para copiar; o copia e cola fica para quem teve problema com ela: nesse modo, a marca
 * `[[CHAVE PIX: valor]]` manda o código.
 * O cartão continua saindo junto, num link só de cartão do provedor; se ele falhar, o link cadastrado do checkout
 * externo. Quem paga em outra moeda continua no provedor: Pix não atende essa pessoa.
 *
 * O VALOR é escrito pelo modelo, mas só passa se for um dos valores que o turno liberou (o preço em vigor, a
 * entrada, uma cobrança à parte). Valor fora da lista recusa o envio: o modelo não inventa quanto cobrar.
 *
 * O pagamento por chave NÃO confirma sozinho. O bloco manda o agente pedir o comprovante, avisar que a equipe
 * confere e chamar uma pessoa; a entrega só começa quando o pagamento é registrado.
 *
 * Tudo aqui é puro.
 */
import { instrucaoDoPixCopiaECola, PEDIDO_DO_COMPROVANTE } from "@/lib/pagamentos/como-pagar-pix";
import { codigoPixEstatico, chavePixNormalizada } from "@/lib/pagamentos/pix-estatico";

import type { PricingConfig } from "./tipos";
import { reais } from "./tipos";

export type ChavePixDaEmpresa = NonNullable<PricingConfig["pix_key"]>;

/** A chave, quando o operador a escolheu como forma principal de receber Pix. Senão, `null`. */
export function chavePrincipal(pricing: Pick<PricingConfig, "pix_key"> | null | undefined): ChavePixDaEmpresa | null {
  return pricing?.pix_key?.primary === true ? pricing.pix_key : null;
}

/**
 * A chave como vai sozinha num balão, para copiar. `null` quando ela não é uma chave válida.
 *
 * Celular vai SEM o +55 ("69993677810"): é assim que os apps dos bancos pedem a chave de celular, e com o +55 colado
 * a busca falha em vários deles. Visto em 02/11/2026: "não aparece a chave" e "esse número é a chave?". Decisão do
 * dono. O código copia e cola (`codigoDaChave`) continua com o +55, que é o formato que o padrão do Pix exige.
 */
export function chaveParaCopiar(chave: ChavePixDaEmpresa): string | null {
  const n = chavePixNormalizada(chave.key);
  return n === null ? null : celularSemDdi(n);
}

const celularSemDdi = (n: string): string => (/^\+55\d{10,11}$/.test(n) ? n.slice(3) : n);

export type TipoDaChave = "Celular" | "CPF" | "CNPJ" | "E-mail" | "Aleatória";

/** O tipo da chave, como o app do banco pergunta ("Qual o tipo da chave?"). `null` quando ela não é válida. */
export function tipoDaChave(chave: Pick<ChavePixDaEmpresa, "key">): TipoDaChave | null {
  const n = chavePixNormalizada(chave.key);
  if (n === null) return null;
  if (n.startsWith("+")) return "Celular";
  if (n.includes("@")) return "E-mail";
  if (/^\d{14}$/.test(n)) return "CNPJ";
  if (/^\d{11}$/.test(n)) return "CPF";
  return "Aleatória";
}

/** O código copia e cola da chave para uma cobrança. `null` quando a chave não gera código. */
export function codigoDaChave(chave: ChavePixDaEmpresa, valorCentavos: number, conversaId: string): string | null {
  return codigoPixEstatico({
    chave: chave.key,
    nome: chave.holder,
    cidade: chave.city,
    valorCentavos,
    identificador: conversaId.replace(/-/g, "").slice(0, 20),
  });
}

const MARCA = /\[\[\s*CHAVE\s+PIX\s*:\s*(?:R\$\s*)?(\d{1,5})(?:[.,](\d{2}))?\s*(?:reais)?\s*\]\]/gi;
const QUALQUER_MARCA = /\[\[\s*CHAVE\s+PIX\b[^\]]*\]\]/i;

/** A chave como a pessoa lê: CNPJ e CPF com pontuação; o resto, como foi cadastrado. */
export function chavePorExtenso(chave: string): string {
  const d = chavePixNormalizada(chave) ?? chave.trim();
  if (/^\+55\d{10,11}$/.test(d)) return `celular ${celularSemDdi(d)}`;
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
  /** Já saiu, nesta conversa, um Pix do provedor, um link ou um boleto? Sem isso a chave ainda não é a vez. */
  outraFormaJaTentada: boolean;
}): SaidaDaChavePix {
  if (!temMarcaDeChavePix(e.corpo)) return { corpo: e.corpo };
  if (!e.outraFormaJaTentada && e.chave?.primary !== true) {
    return { recusa: "A chave Pix da empresa é o ÚLTIMO recurso. Mande primeiro o pagamento do jeito normal (o Pix copia e cola ou o link) e ajude a pessoa a usar. Só use a marca [[CHAVE PIX: …]] se ela tentar e não conseguir." };
  }
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
  const novos = e.chave.primary === true ? [instrucaoDoPixCopiaECola(reais(cents), e.chave.holder), codigo, PEDIDO_DO_COMPROVANTE] : [
    `Pra pagar pela chave Pix: copia o código abaixo e cola no app do seu banco, na opção *Pix Copia e Cola*. Já vai com o valor de *${reais(cents)}* e o nome *${e.chave.holder}*.`,
    codigo,
    `Se preferir digitar a chave, é o ${chavePorExtenso(e.chave.key)}, no valor de ${reais(cents)}. Depois de pagar, me manda o comprovante aqui.`,
  ];
  return { corpo: [...baloes.slice(0, i), ...(resto ? [resto] : []), ...novos, ...baloes.slice(i + 1)].join("\n\n") };
}

/** Que chave é esta, para a agente responder "esse número é a chave?" e o "qual o tipo?" do banco sem inventar. */
function comoEAChave(chave: ChavePixDaEmpresa): string[] {
  const tipo = tipoDaChave(chave);
  if (tipo === null) return [];
  const copiar = chaveParaCopiar(chave);
  const qual = tipo === "Celular" ? `um número de CELULAR (${copiar}), sem o +55` : `do tipo ${tipo}`;
  return [
    `- A chave é ${qual}, em nome de ${chave.holder}. Se ela perguntar "esse número é a chave?", a resposta é SIM. Se o banco perguntar o tipo de chave, é *${tipo}*. É PROIBIDO dizer que a chave é de outro tipo (CNPJ, CPF, e-mail, aleatória) ou que o número enviado não é a chave.`,
  ];
}

/** O bloco do turno. '' quando não há chave configurada ou nenhum valor liberado. */
export function blocoDaChavePix(chave: ChavePixDaEmpresa | null | undefined, valoresPermitidosCents: readonly number[]): string {
  const valores = [...new Set(valoresPermitidosCents)].sort((a, b) => b - a);
  if (!chave || valores.length === 0) return "";
  const confirmacao = `- O pagamento pela chave NÃO confirma sozinho: quem confere é o sistema, lendo o comprovante, e o resultado aparece neste bloco (PAGAMENTO CONFIRMADO, COMPROVANTE LIDO ou COMPROVANTE NÃO CONFERE). Se ela disser que pagou sem mandar a imagem, peça o comprovante. Se mandou e nada disso apareceu, diga em um balão que a equipe está conferindo e que você avisa assim que confirmar, e chame o atendimento humano com o motivo "Pix pela chave: conferir o comprovante e registrar o pagamento". NÃO entregue nada e NÃO diga que o pagamento caiu antes de o sistema confirmar.`;
  if (chave.primary === true) {
    return [
      "",
      "",
      "PIX PELA CHAVE DA EMPRESA (é a forma PRINCIPAL de receber; esta regra vence qualquer frase do roteiro sobre pagamento)",
      `- Todo Pix sai pela chave, em nome de ${chave.holder}. Cobre do jeito de sempre (o link do produto ou a marca [[PIX: …]]): o sistema troca pela chave para copiar e pelo link de cartão. Onde o roteiro disser "código", diga "chave". Se perguntarem por que aparece esse nome, é quem cuida do financeiro.`,
      `- O link de cartão sai junto com o código. Se ela pedir cartão, cobre de novo do jeito de sempre e aponte o link. O cartão confirma sozinho, sem comprovante. A chave não vence: NUNCA diga que vai expirar.`,
      `- Se ela pedir a chave de novo, cobre de novo do jeito de sempre. NUNCA digite a chave você mesma, e é PROIBIDO dizer que não trabalha com chave.`,
      ...comoEAChave(chave),
      `- A chave SÓ chega pela cobrança que você escreve NESTE envio (o link do produto ou a marca [[PIX: …]]). É PROIBIDO dizer "a chave vai aqui embaixo", "aqui está a chave", "te mandei a chave" ou "a chave está aí em cima" sem a cobrança no mesmo envio ou sem a chave já enviada na conversa. Se não há valor liberado para cobrar o que ela quer, diga o valor que está liberado; nunca finja que mandou.`,
      `- O link do cartão tem o valor fixo do produto e NÃO tem campo de valor: nunca mande digitar ou trocar o valor no link. Valor diferente (entrada, avulsa) é pela chave.`,
      `- SÓ se ela disser que a chave não funcionou ou que não conseguiu pagar com ela, escreva sozinha num balão a marca com o valor em reais, assim: [[CHAVE PIX: ${Math.round(valores[0]! / 100)}]]. O sistema troca a marca pelo Pix copia e cola. Valores liberados para esta pessoa agora: ${valores.map(reais).join(", ")}. Nunca use essa marca antes de ela ter problema com a chave.`,
      confirmacao,
    ].join("\n");
  }
  return [
    "",
    "",
    "PIX PELA CHAVE DA EMPRESA (opção; o jeito padrão de cobrar continua sendo o descrito acima)",
    `- É o ÚLTIMO RECURSO. Use SÓ depois de ter mandado o pagamento normal (o Pix copia e cola, o link ou o boleto) e a pessoa ter tentado e NÃO ter conseguido, mesmo com a sua ajuda passo a passo. Nunca ofereça a chave por iniciativa sua e nunca como primeira forma de pagar.`,
    `- Quando ela disser que o código ou o link não funcionou e pedir a chave ou o número do Pix, mande a chave NESTE turno, sem novo passo a passo. Esta regra vence qualquer frase do roteiro: é PROIBIDO dizer que não trabalha com chave.`,
    `- Para mandar, escreva sozinha num balão a marca com o valor em reais, assim: [[CHAVE PIX: ${Math.round(valores[0]! / 100)}]]. Valores liberados para esta pessoa agora: ${valores.map(reais).join(", ")}. O sistema troca a marca pelo código, pela chave e pelo nome ${chave.holder}. NUNCA digite a chave você mesma.`,
    confirmacao,
  ].join("\n");
}
