/**
 * O que a página final e a tela da leitura mostram ALÉM do quiz atual, montado no servidor a partir da configuração:
 *
 * - `outrasLeituras`: os outros quizzes LIGADOS da mesma área, para quem acabou de comprar continuar (o upsell dos
 *   funis que escalam, sem página escondida nem preço inventado);
 * - `depoimentosDoQuiz`: os depoimentos cadastrados (reais, com autorização) que valem para este quiz.
 */
import type { ConfigDaArea } from "@/lib/area-do-cliente/config";
import { urlDaMidiaDaArea } from "@/lib/area-do-cliente/midia";

import type { Depoimento, OutraLeitura } from "./_quiz-pecas";

type QuizDaArea = "sinastria" | "prosperidade" | "caminhos" | "par";

export function outrasLeituras(config: ConfigDaArea, slug: string, atual: QuizDaArea, t: (texto: string) => string): OutraLeitura[] {
  const base = `/c/${config.apelido || slug}`;
  const todas: (OutraLeitura & { id: QuizDaArea; ativo: boolean })[] = [
    { id: "sinastria", ativo: !!config.sinastria_quiz?.ativo, titulo: t("Vocês combinam?"), chamada: t("A sinastria de vocês dois, calculada pelas datas de nascimento."), href: `${base}/sinastria` },
    { id: "par", ativo: !!config.quiz_par?.ativo, titulo: t("Com quem você combina de verdade?"), chamada: t("Vênus e o Descendente: o que te atrai e o que te faz bem."), href: `${base}/quiz/par` },
    { id: "prosperidade", ativo: !!config.quiz_prosperidade?.ativo, titulo: t("Qual é o seu número da prosperidade?"), chamada: t("A conta da sua data e o que ela diz sobre como você prospera."), href: `${base}/quiz/prosperidade` },
    { id: "caminhos", ativo: !!config.quiz_caminhos?.ativo, titulo: t("O que abre os seus caminhos?"), chamada: t("Quatro toques e uma carta-chave do tarô para o momento."), href: `${base}/quiz/caminhos` },
  ];
  return todas.filter((o) => o.ativo && o.id !== atual).map(({ titulo, chamada, href }) => ({ titulo, chamada, href }));
}

export function depoimentosDoQuiz(config: ConfigDaArea, atual: QuizDaArea, base: string): Depoimento[] {
  return (config.depoimentos ?? [])
    .filter((d) => !d.quiz || d.quiz === atual)
    .map((d) => ({ nome: d.nome, texto: d.texto, cidade: d.cidade, video: urlDaMidiaDaArea(d.video, base) }));
}
