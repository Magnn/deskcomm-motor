/**
 * O CONTEÚDO DE UM RELATÓRIO SOB MEDIDA — o que o modelo escreve e o PDF desenha.
 *
 * O modelo devolve JSON neste formato; nada fora dele entra no documento. Os tetos de tamanho existem porque o
 * documento é lido no celular: capítulo curto, uma ideia por bloco.
 */
import { z } from "zod";

const paragrafo = z.string().trim().min(20).max(900);

export const blocoSchema = z.object({
  /** `descoberta` ganha moldura e título; `texto` é parágrafo corrido. */
  tipo: z.enum(["texto", "descoberta"]),
  titulo: z.string().trim().max(140).optional(),
  texto: z.array(paragrafo).min(1).max(3),
  /** Uma pergunta ou exercício para a pessoa aplicar à própria vida. */
  aplique: z.string().trim().max(400).optional(),
});

export const capituloSchema = z.object({
  titulo: z.string().trim().min(3).max(70),
  abre: z.string().trim().max(260).optional(),
  blocos: z.array(blocoSchema).min(1).max(5),
});

export const conteudoDoRelatorioSchema = z.object({
  /** Uma frase sob o título da capa. */
  capa: z.string().trim().min(20).max(260),
  capitulos: z.array(capituloSchema).min(3).max(8),
  /** Atitudes práticas, numeradas. */
  chaves: z.array(z.object({ titulo: z.string().trim().min(3).max(80), texto: paragrafo })).max(5).default([]),
  /** Um passo por dia. */
  dias: z.array(z.object({ titulo: z.string().trim().min(3).max(60), texto: z.string().trim().min(10).max(320) })).max(7).default([]),
  /** A carta final, em parágrafos curtos. */
  carta: z.array(z.string().trim().min(3).max(420)).min(2).max(6),
});
export type ConteudoDoRelatorio = z.infer<typeof conteudoDoRelatorioSchema>;

/** O que o relatório promete que não pode prometer: resultado na vida de outra pessoa, prazo, garantia. */
const PROMESSA =
  /\b(vai|ir[áa]|vão)\s+(voltar|te\s+procurar|ligar|pedir\s+perd[ãa]o|se\s+arrepender)\b|\bgaranto\b|\bgarantid[oa]\b|\bcom\s+certeza\s+(ele|ela)\b|\bem\s+\d+\s+dias?\s+(ele|ela)\b|\b(ele|ela)\s+(te\s+ama|ainda\s+te\s+ama|sente\s+sua\s+falta|pensa\s+em\s+voc[êe])\b/i;

/** As frases do conteúdo que afirmam o que não dá para afirmar. Vazio = pode sair. */
export function promessasNoConteudo(c: ConteudoDoRelatorio): string[] {
  const textos = [
    c.capa,
    ...c.capitulos.flatMap((k) => [k.titulo, k.abre ?? "", ...k.blocos.flatMap((b) => [b.titulo ?? "", ...b.texto, b.aplique ?? ""])]),
    ...c.chaves.flatMap((k) => [k.titulo, k.texto]),
    ...c.dias.flatMap((d) => [d.titulo, d.texto]),
    ...c.carta,
  ];
  return textos.filter((t) => PROMESSA.test(t)).map((t) => t.slice(0, 120));
}
