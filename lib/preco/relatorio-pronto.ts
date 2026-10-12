/**
 * O RELATÓRIO PRONTO — a cobrança à parte cuja entrega é um PDF feito sob medida, gerado na hora.
 *
 * ─── O que se via em produção ────────────────────────────────────────────────────────────────────────────
 * Medido em 12/10/2026: uma pessoa pagou a "Sinastria Amorosa", mandou os nomes e as datas e esperou uma hora. O
 * agente não tinha como entregar: falou dos signos em texto e disse que ia conferir o pagamento. O PDF foi montado
 * à mão. Entrega que depende de alguém montar não escala e atrasa justamente quem acabou de pagar.
 *
 * ─── A régua ────────────────────────────────────────────────────────────────────────────────────────────
 * O extra declara `report` (o tipo de relatório). Depois de pago, o agente junta os dados e escreve a marca
 * `[[RELATORIO: <nome do extra> | campo | campo…]]`. No envio, o código gera o conteúdo, desenha o PDF e manda o
 * arquivo (`lib/relatorio/*`). A marca só vale com o extra PAGO e uma vez por pagamento; dado faltando ou geração
 * que falha recusa o envio com a explicação, e a marca crua nunca chega à pessoa.
 *
 * Tudo aqui é puro.
 */
import { dataEmIso } from "@/lib/relatorio/astrologia";
import type { PedidoDeRelatorio } from "@/lib/relatorio/gerar";

import { slugDoExtra } from "./extras";
import type { Extra } from "./tipos";

const MARCA = /\[\[\s*RELAT[ÓO]RIO\s*:\s*([^\]|]+?)\s*(?:\|([^\]]*))?\]\]/i;

/** O começo da legenda do arquivo: é por ela que o turno seguinte sabe que o relatório já saiu. */
export const LEGENDA_DO_RELATORIO = "📜";

export const marcaDoRelatorio = (nome: string, campos: string): string => `[[RELATORIO: ${nome} | ${campos}]]`;

export interface MarcaDeRelatorio {
  extra: Extra & { report: NonNullable<Extra["report"]> };
  campos: string[];
  bruto: string;
}

export function temMarcaDeRelatorio(corpo: string): boolean {
  return MARCA.test(corpo);
}

/** A marca do corpo e o extra a que ela se refere. `null` = sem marca; `extra: null` = marca de produto desconhecido. */
export function marcaDeRelatorioNoCorpo(corpo: string, extras: readonly Extra[]): MarcaDeRelatorio | { extra: null; bruto: string } | null {
  const m = MARCA.exec(corpo);
  if (!m) return null;
  const slug = slugDoExtra(m[1] ?? "");
  const extra = extras.find((e) => e.report !== undefined && slugDoExtra(e.name) === slug);
  if (!extra || !extra.report) return { extra: null, bruto: m[0] };
  const campos = (m[2] ?? "").split("|").map((c) => c.trim()).filter((c) => c !== "");
  return { extra: extra as MarcaDeRelatorio["extra"], campos, bruto: m[0] };
}

const primeiroNome = (t: string): string => {
  const limpo = t.replace(/[^\p{L}\s'-]/gu, " ").trim().split(/\s+/)[0] ?? "";
  return limpo === "" ? "" : limpo[0]!.toUpperCase() + limpo.slice(1).toLowerCase();
};

export type PedidoDaMarca = { pedido: PedidoDeRelatorio } | { erro: string };

/** Os campos da marca viram o pedido de geração. Dado faltando ou inválido volta como instrução para o agente. */
export function pedidoDaMarca(marca: MarcaDeRelatorio, assinatura: string, contexto: string): PedidoDaMarca {
  const produto = marca.extra.report.title ?? marca.extra.name;
  const comum = { produto, assinatura, contexto, ...(marca.extra.report.guidance ? { orientacao: marca.extra.report.guidance } : {}) };
  if (marca.extra.report.kind === "sinastria") {
    const [nomeA, dataA, nomeB, dataB] = marca.campos;
    const a = primeiroNome(nomeA ?? "");
    const b = primeiroNome(nomeB ?? "");
    const da = dataEmIso(dataA ?? "");
    const db = dataEmIso(dataB ?? "");
    if (a === "" || b === "" || da === null || db === null) {
      return {
        erro: `Para gerar "${marca.extra.name}" faltam dados válidos. A marca é ${marcaDoRelatorio(marca.extra.name, "nome dela | DD/MM/AAAA | nome da outra pessoa | DD/MM/AAAA")}. ${da === null || db === null ? "Uma das datas de nascimento não é uma data válida: confirme com ela o dia, o mês e o ano com quatro dígitos." : "Falta o nome de uma das duas pessoas."} Peça SÓ o que falta e não envie a marca até ter tudo.`,
      };
    }
    return { pedido: { tipo: "sinastria", ...comum, a: { nome: a, data: da }, b: { nome: b, data: db } } };
  }
  const nome = primeiroNome(marca.campos[0] ?? "");
  const querSaber = marca.campos.slice(1).join(" | ");
  if (nome === "" || querSaber.length < 15) {
    return { erro: `Para gerar "${marca.extra.name}" a marca é ${marcaDoRelatorio(marca.extra.name, "primeiro nome dela | o que ela quer entender, com as palavras dela")}. Falta ${nome === "" ? "o nome" : "dizer o que ela quer entender"}.` };
  }
  return { pedido: { tipo: "leitura", ...comum, a: { nome }, contexto: `${querSaber}\n\n${contexto}`.trim() } };
}

/** O corpo sem o balão da marca. */
export function corpoSemAMarcaDeRelatorio(corpo: string, bruto: string): string {
  return corpo
    .split(/\n{2,}/)
    .map((b) => b.replace(bruto, "").trim())
    .filter((b) => b !== "")
    .join("\n\n");
}

export const legendaDoRelatorio = (extra: Extra): string => `${LEGENDA_DO_RELATORIO} ${extra.report?.title ?? extra.name}`;

/** O relatório deste extra já saiu nesta conversa (pela legenda do arquivo)? */
export function relatorioJaEntregue(mensagens: readonly { direction: string; body?: string | null }[], extra: Extra): boolean {
  const legenda = legendaDoRelatorio(extra);
  return mensagens.some((m) => m.direction === "outbound" && (m.body ?? "").startsWith(legenda));
}

/** O "como entregar" de um extra cuja entrega é um relatório gerado: o que pedir e a marca a escrever. */
export function comoEntregarRelatorio(extra: Extra): string {
  if (!extra.report) return "";
  const pede =
    extra.report.kind === "sinastria"
      ? "o primeiro nome e a data de nascimento (dia, mês e ano) dela e da outra pessoa"
      : "o primeiro nome dela e o que ela quer entender, com as palavras dela";
  const campos = extra.report.kind === "sinastria" ? "nome dela | DD/MM/AAAA | nome da outra pessoa | DD/MM/AAAA" : "primeiro nome dela | o que ela quer entender";
  return [
    `a entrega é um PDF feito sob medida, que o SISTEMA gera e envia. Você precisa de: ${pede}. Confira no histórico o que ela já mandou e peça SÓ o que falta, em uma mensagem.`,
    `Com tudo em mãos, responda em três balões: 1º "Recebi tudo, [nome]. Me dá um minutinho que eu preparo a sua leitura."; 2º sozinha no balão, a marca ${marcaDoRelatorio(extra.name, campos)}; 3º "Abre com calma. Quando terminar de ler, me conta o que mais te tocou."`,
    `NÃO escreva o conteúdo do relatório em texto, NÃO resuma o que ele vai dizer e NÃO envie a marca sem os dados completos. Depois que o arquivo sair, não gere de novo: responda as dúvidas dela sobre o que leu.`,
  ].join(" ");
}
