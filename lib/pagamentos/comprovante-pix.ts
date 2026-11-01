/**
 * CONFERÊNCIA DO COMPROVANTE PIX — quem paga pela chave da empresa não gera aviso nenhum: o único sinal é a foto.
 *
 * O dono pediu em 01/11/2026 que a agente saiba conferir. Quem decide é este código, nunca o modelo: a imagem vem de quem
 * paga e pode trazer texto escrito para enganar a IA. O modelo de visão só transcreve; a regra lê a transcrição e compara
 * com a cobrança que nós mesmos mandamos na conversa.
 *
 * O que é conferido:
 *   • o valor é o de uma cobrança enviada nesta conversa;
 *   • o comprovante cita quem recebe (nome ou final da chave);
 *   • tem o ID da transação do Pix (E2E, 32 caracteres), cuja data é posterior à cobrança e recente.
 * O ID repetido é barrado por quem grava, pelo índice único do livro de receita (`comprovante-no-turno.ts`).
 *
 * ⚠️ NADA aqui vê a conta do banco. Comprovante bem forjado passa. Por isso a cobrança avulsa, de valor baixo, libera
 * sozinha, e o produto principal segue para uma pessoa confirmar no extrato.
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

export type Conferencia =
  | { tipo: "nenhum" }
  | { tipo: "nao_confere"; motivo: string }
  | { tipo: "confere_extra"; extra: Extra; quantidade: number; valorCents: number; idDoPix: string; pagoEm: Date }
  | { tipo: "confere_principal"; valorCents: number; idDoPix: string; pagoEm: Date };

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
  agora: Date;
}): Conferencia {
  if (e.texto.trim() === "" || !pareceComprovante(e.texto)) return { tipo: "nenhum" };
  if (e.cobrancas.length === 0) return { tipo: "nao_confere", motivo: "não há cobrança pela chave nesta conversa" };
  const valores = valoresDitos(e.texto);
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
  const extra = e.valoresDoPrincipal.includes(cobranca.valorCents) ? null : extraDaCobranca(cobranca, e.extras);
  if (extra === null) return { tipo: "confere_principal", valorCents: cobranca.valorCents, idDoPix: id[0], pagoEm };
  // A quantidade vem da cobrança; o valor conferido tem de ser o total dela.
  if (valorDaCobranca(extra, cobranca.quantidade) !== cobranca.valorCents) {
    return { tipo: "confere_principal", valorCents: cobranca.valorCents, idDoPix: id[0], pagoEm };
  }
  return { tipo: "confere_extra", extra, quantidade: cobranca.quantidade, valorCents: cobranca.valorCents, idDoPix: id[0], pagoEm };
}

/** O bloco do turno. Vazio quando o bloco de PAGAMENTO CONFIRMADO já diz tudo, ou quando não há comprovante. */
export function blocoDaConferencia(c: Conferencia, chave: ChavePixDaEmpresa): string {
  if (c.tipo === "nao_confere") {
    return [
      "",
      "",
      "COMPROVANTE NÃO CONFERE (o sistema leu o comprovante; esta regra vence o roteiro)",
      `- Motivo: ${c.motivo}. O pagamento NÃO está confirmado: não entregue e não diga que caiu.`,
      "- Não acuse ninguém de nada. Peça, com carinho, o comprovante inteiro, com o valor, o nome de quem recebeu e o ID da transação.",
      '- Se ela já mandou de novo e continua sem conferir, diga que a equipe vai olhar e chame o atendimento humano com o motivo "Pix pela chave: conferir o comprovante e registrar o pagamento".',
    ].join("\n");
  }
  if (c.tipo === "confere_principal") {
    return [
      "",
      "",
      "COMPROVANTE LIDO (esta regra vence o roteiro)",
      `- O comprovante de ${reais(c.valorCents)} para ${chave.holder} está em ordem, mas o produto principal só é liberado depois que a equipe confirma no extrato.`,
      `- Diga em um balão que recebeu o comprovante e que a equipe confirma já, e chame o atendimento humano com o motivo "Pix pela chave: comprovante de ${reais(c.valorCents)} em ordem, confirmar no extrato e registrar o pagamento". NÃO entregue ainda.`,
    ].join("\n");
  }
  return "";
}
