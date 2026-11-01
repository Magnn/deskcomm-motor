/**
 * CONFERÊNCIA DO COMPROVANTE PIX — quem paga pela chave da empresa não gera aviso nenhum: o único sinal é a foto.
 *
 * O dono pediu em 01/11/2026 que a agente saiba conferir. Quem decide é este código, nunca o modelo: a imagem vem de quem
 * paga e pode trazer texto escrito para enganar a IA. O modelo de visão só transcreve; a regra lê a transcrição e compara
 * com a cobrança que nós mesmos mandamos na conversa.
 *
 * O que é conferido, e tudo tem de bater. Qualquer dúvida para e chama a equipe:
 *   • o valor é o de uma cobrança enviada nesta conversa, e é o único valor do comprovante;
 *   • o comprovante cita quem recebe (nome ou final da chave);
 *   • tem o ID da transação do Pix (E2E, 32 caracteres), cuja data é posterior à cobrança e recente;
 *   • a data e a hora impressas combinam com a data do ID (o ID vem em UTC, a hora impressa no fuso do banco).
 * O ID já usado, pelo mesmo lead ou por outro, é barrado por quem grava (`comprovante-no-turno.ts`).
 *
 * ⚠️ NADA aqui vê a conta do banco. Decisão do dono em 01/11/2026: com tudo batendo, vale como pago, entra no faturamento
 * e vai à Meta. Um comprovante falsificado com perfeição passa, e o extrato é a conferência final.
 *
 * Pura.
 */
import { cobrancaNoTexto } from "@/lib/pagamentos/como-pagar-pix";
import { slugDoExtra, totaisDoExtra, valorDaCobranca } from "@/lib/preco/extras";
import type { ChavePixDaEmpresa } from "@/lib/preco/chave-pix";
import type { Extra } from "@/lib/preco/tipos";
import { reais } from "@/lib/preco/tipos";
import { valoresDitos } from "@/lib/preco/valor-do-extra";

/** ID de ponta a ponta do Pix: E + ISPB (8) + AAAAMMDDHHMM em UTC (12) + 11 caracteres. */
const ID_DO_PIX = /\bE[0-9A-Z]{8}(\d{12})[0-9A-Za-z]{11}\b/;
const FALA_DE_COMPROVANTE = /comprovante|pix (?:enviado|realizado|efetuado|feito)|transfer[êe]ncia (?:realizada|efetuada|enviada)|id da transa|autentica[çc][ãa]o/i;

/** Quanto tempo depois da cobrança um comprovante ainda vale. */
const VALIDADE_DA_COBRANCA_MS = 72 * 60 * 60 * 1000;
/** Folga para relógio de banco: o pagamento pode constar minutos antes da nossa mensagem ser gravada. */
const FOLGA_MS = 10 * 60 * 1000;
/** O ID vem em UTC e a hora impressa no fuso do banco: no Brasil, de 2 a 5 horas atrás. */
const MAIOR_FUSO_MS = 5 * 60 * 60 * 1000;
const MESES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

export interface FalaDaConversa {
  direction: "inbound" | "outbound";
  body: string;
  sent_at: string;
  type?: string;
}

export interface CobrancaEnviada {
  valorCents: number;
  quantidade: number;
  nome: string | null;
  enviadaEm: Date;
}

/** A data e a hora impressas, lidas como se fossem UTC: "01/11/2026 às 12:10" ou "01 NOV 2026 - 12:10:05". */
export function dataImpressa(texto: string): Date | null {
  const numerica = texto.match(/\b(\d{2})\/(\d{2})\/(\d{4})\D{1,8}(\d{2}):(\d{2})/);
  if (numerica) return new Date(Date.UTC(Number(numerica[3]), Number(numerica[2]) - 1, Number(numerica[1]), Number(numerica[4]), Number(numerica[5])));
  const escrita = semAcento(texto).match(/\b(\d{1,2})\s+(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s+(?:de\s+)?(\d{4})\D{1,8}(\d{2}):(\d{2})/);
  if (escrita) return new Date(Date.UTC(Number(escrita[3]), MESES[escrita[2]!]! - 1, Number(escrita[1]), Number(escrita[4]), Number(escrita[5])));
  return null;
}

export type Conferencia =
  | { tipo: "nenhum" }
  | { tipo: "nao_confere"; motivo: string }
  | { tipo: "confere_extra"; extra: Extra; quantidade: number; valorCents: number; idDoPix: string; pagoEm: Date }
  | { tipo: "confere_principal"; valorCents: number; idDoPix: string; pagoEm: Date }
  | { tipo: "confere_produto"; produto: string; valorCents: number; idDoPix: string; pagoEm: Date };

const semAcento = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O que o sistema leu da mídia, sem a legenda: legenda é texto digitado por quem pagou. */
export function textoDaMidia(corpo: string): string {
  const marca = "Conteúdo: ";
  const i = corpo.indexOf(marca);
  return i < 0 ? "" : corpo.slice(i + marca.length);
}

export const pareceComprovante = (texto: string): boolean => ID_DO_PIX.test(texto) || FALA_DE_COMPROVANTE.test(texto);

/** A data embutida no ID do Pix, ou `null` se ela não é uma data de verdade. */
function dataDoId(digitos: string): Date | null {
  const [a, me, d, h, mi] = [digitos.slice(0, 4), digitos.slice(4, 6), digitos.slice(6, 8), digitos.slice(8, 10), digitos.slice(10, 12)].map(Number) as [number, number, number, number, number];
  const data = new Date(Date.UTC(a, me - 1, d, h, mi));
  return data.getUTCMonth() === me - 1 && data.getUTCDate() === d && data.getUTCHours() === h ? data : null;
}

/** Cita quem recebe: primeiro e último nome, ou os 8 últimos dígitos da chave (bancos mascaram o resto). */
function citaQuemRecebe(texto: string, chave: ChavePixDaEmpresa): boolean {
  const normalizado = semAcento(texto);
  const nomes = semAcento(chave.holder).split(/\s+/).filter(Boolean);
  if (nomes.length >= 2 && normalizado.includes(nomes[0]!) && normalizado.includes(nomes[nomes.length - 1]!)) return true;
  const digitos = chave.key.replace(/\D/g, "");
  return digitos.length >= 8 && texto.replace(/\D/g, "").includes(digitos.slice(-8));
}

/** As cobranças pela chave que nós mandamos nesta conversa, da mais nova para a mais velha. */
export function cobrancasEnviadas(mensagens: readonly FalaDaConversa[]): CobrancaEnviada[] {
  const achadas: CobrancaEnviada[] = [];
  for (const m of mensagens) {
    if (m.direction !== "outbound") continue;
    const c = cobrancaNoTexto(m.body ?? "");
    if (c) achadas.push({ ...c, enviadaEm: new Date(m.sent_at) });
  }
  return achadas.sort((a, b) => b.enviadaEm.getTime() - a.enviadaEm.getTime());
}

/**
 * As entradas que a agente fechou na conversa ("você entra com R$ 30 agora"). O restante não entra aqui: ele não inicia
 * entrega e segue para a equipe conferir.
 */
export function entradasCombinadas(mensagens: readonly FalaDaConversa[]): number[] {
  return mensagens.flatMap((m) =>
    m.direction === "outbound"
      ? [...(m.body ?? "").matchAll(/\bentra(?:r)?\s+com\s+\*?R\$\s?\d[\d.,]*/gi)].flatMap((a) => valoresDitos(a[0]))
      : [],
  );
}

/** Qual cobrança avulsa é esta: pelo nome, quando a cobrança o traz; senão, a única com aquele preço unitário. */
function extraDaCobranca(cobranca: CobrancaEnviada, extras: readonly Extra[]): Extra | null {
  if (cobranca.nome !== null) {
    const nome = slugDoExtra(cobranca.nome);
    return extras.find((e) => slugDoExtra(e.name) === nome && totaisDoExtra(e).includes(cobranca.valorCents)) ?? null;
  }
  const mesmas = extras.filter((e) => e.price_cents === cobranca.valorCents);
  return mesmas.length === 1 ? mesmas[0]! : null;
}

export function conferirComprovante(e: {
  texto: string;
  chave: ChavePixDaEmpresa;
  cobrancas: readonly CobrancaEnviada[];
  extras: readonly Extra[];
  /** Valores do produto principal: mesmo valor de uma avulsa fica com a pessoa, que sabe qual foi. */
  valoresDoPrincipal: readonly number[];
  /**
   * Os produtos de preço fechado que não são o principal nem cobrança avulsa: pós-venda e catálogo. Medido em 01/11/2026: a
   * Oração dos Sonhos (R$ 35, pós-venda) foi paga, a agente entregou, e a venda não entrou no faturamento.
   */
  outrosProdutos?: ReadonlyArray<{ produto: string; valor_cents: number }>;
  /** `entradasCombinadas`: a entrada tem o valor que ela disse, que pode não existir em tabela nenhuma. */
  entradas?: readonly number[];
  agora: Date;
}): Conferencia {
  if (e.texto.trim() === "" || !pareceComprovante(e.texto)) return { tipo: "nenhum" };
  if (e.cobrancas.length === 0) return { tipo: "nao_confere", motivo: "não há cobrança pela chave nesta conversa" };
  const valores = [...new Set(valoresDitos(e.texto))];
  if (valores.length > 1) return { tipo: "nao_confere", motivo: "o comprovante mostra mais de um valor" };
  const cobranca = e.cobrancas.find((c) => valores.includes(c.valorCents));
  if (!cobranca) {
    return { tipo: "nao_confere", motivo: `o valor do comprovante não é o da cobrança (${reais(e.cobrancas[0]!.valorCents)})` };
  }
  if (!citaQuemRecebe(e.texto, e.chave)) return { tipo: "nao_confere", motivo: `não aparece ${e.chave.holder} como quem recebeu` };
  const id = e.texto.match(ID_DO_PIX);
  if (!id) return { tipo: "nao_confere", motivo: "não dá para ler o ID da transação do Pix (começa com E, 32 caracteres)" };
  const pagoEm = dataDoId(id[1]!);
  if (pagoEm === null) return { tipo: "nao_confere", motivo: "o ID da transação não é válido" };
  const instante = pagoEm.getTime();
  if (instante < cobranca.enviadaEm.getTime() - FOLGA_MS || instante > cobranca.enviadaEm.getTime() + VALIDADE_DA_COBRANCA_MS || instante > e.agora.getTime() + FOLGA_MS) {
    return { tipo: "nao_confere", motivo: "a data do pagamento não combina com a data da cobrança" };
  }
  const impressa = dataImpressa(e.texto);
  if (impressa === null) return { tipo: "nao_confere", motivo: "não dá para ler a data e a hora do pagamento" };
  const diferenca = instante - impressa.getTime();
  if (diferenca < -FOLGA_MS || diferenca > MAIOR_FUSO_MS + FOLGA_MS) {
    return { tipo: "nao_confere", motivo: "a hora impressa não combina com o ID da transação" };
  }
  if (e.entradas?.includes(cobranca.valorCents)) {
    return { tipo: "confere_principal", valorCents: cobranca.valorCents, idDoPix: id[0], pagoEm };
  }
  if (e.valoresDoPrincipal.includes(cobranca.valorCents)) {
    // Mesmo valor de uma avulsa (Acompanhamento e trabalho, ambos R$ 60): só a pessoa sabe qual foi.
    if (extraDaCobranca(cobranca, e.extras) !== null) return { tipo: "nao_confere", motivo: "o valor vale para mais de um produto" };
    return { tipo: "confere_principal", valorCents: cobranca.valorCents, idDoPix: id[0], pagoEm };
  }
  const extra = extraDaCobranca(cobranca, e.extras);
  // Entrada, restante e valor combinado à parte: o valor sozinho não diz se quitou.
  if (extra === null || valorDaCobranca(extra, cobranca.quantidade) !== cobranca.valorCents) {
    const mesmos = (e.outrosProdutos ?? []).filter((p) => p.valor_cents === cobranca.valorCents);
    // Dois produtos no mesmo valor: só a pessoa sabe qual foi.
    if (mesmos.length === 1) {
      return { tipo: "confere_produto", produto: mesmos[0]!.produto, valorCents: cobranca.valorCents, idDoPix: id[0], pagoEm };
    }
    return { tipo: "nao_confere", motivo: "este valor não é o de um produto fechado (entrada, restante ou valor combinado)" };
  }
  return { tipo: "confere_extra", extra, quantidade: cobranca.quantidade, valorCents: cobranca.valorCents, idDoPix: id[0], pagoEm };
}

/** Qual produto principal a conversa estava vendendo: o último citado pelo nome nas nossas falas. */
export function produtoCitado(mensagens: readonly FalaDaConversa[], nomes: readonly string[]): string | null {
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const m = mensagens[i]!;
    if (m.direction !== "outbound") continue;
    const corpo = semAcento(m.body ?? "");
    const achado = nomes.find((n) => n.trim() !== "" && corpo.includes(semAcento(n)));
    if (achado) return achado;
  }
  return null;
}

/** O bloco do turno. Vazio quando o bloco de PAGAMENTO CONFIRMADO já diz tudo, ou quando não há comprovante. */
export function blocoDaConferencia(c: Conferencia, chave: ChavePixDaEmpresa, venda?: { produto: string; entregaSozinha: boolean }): string {
  if (c.tipo === "nao_confere") {
    return [
      "",
      "",
      "COMPROVANTE COM DÚVIDA (o sistema leu o comprovante; esta regra vence o roteiro)",
      `- Motivo interno: ${c.motivo}. O pagamento NÃO está confirmado: não entregue, não diga que caiu e não cobre de novo.`,
      `- Não acuse ninguém e não peça outro comprovante. Diga em um balão que recebeu e que a equipe vai conferir, e chame o atendimento humano AGORA com o motivo "Pix pela chave: conferir o comprovante (${c.motivo})".`,
    ].join("\n");
  }
  if ((c.tipo === "confere_principal" || c.tipo === "confere_produto") && venda) {
    return [
      "",
      "",
      "PAGAMENTO CONFIRMADO PELO COMPROVANTE (esta regra vence o roteiro)",
      `- ${reais(c.valorCents)} de *${venda.produto}*, para ${chave.holder}: conferido e registrado. NÃO cobre de novo e NÃO diga que a equipe vai conferir.`,
      venda.entregaSozinha
        ? "- Diga que o pagamento caiu e que a entrega já começa."
        : '- Diga que o pagamento caiu e siga o roteiro de quem pagou. Se o roteiro não disser como entregar, chame o atendimento humano com o motivo "Pix conferido: iniciar a entrega".',
    ].join("\n");
  }
  return "";
}
