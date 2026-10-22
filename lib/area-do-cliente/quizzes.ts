/**
 * OS QUIZZES DE UMA PESSOA (migration 0943) — vendidos na página como a sinastria (`sinastria.ts`).
 *
 *   • PROSPERIDADE: o número do destino pela numerologia popular (a soma dos algarismos da data de nascimento,
 *     reduzida a 1–9, guardando 11 e 22), e o tom de cada número. A leitura completa é "Seu Mapa da Prosperidade".
 *   • CAMINHOS: o perfil pela maioria das respostas (cada opção aponta um dos quatro perfis). A leitura completa é
 *     um ritual guiado de 7 dias para fazer em casa.
 *
 * A prévia é CALCULADA, não inventada. Nada aqui promete dinheiro, resultado ou prazo, nem fala em "bloqueio" ou
 * "energia ruim": é orientação e autoconhecimento. Pura.
 */
import { z } from "zod";

export const TIPOS_DE_QUIZ = ["prosperidade", "caminhos"] as const;
export type TipoDeQuiz = (typeof TIPOS_DE_QUIZ)[number];
export const EXTRA_DO_QUIZ = (tipo: TipoDeQuiz) => `quiz-${tipo}`;
export const tipoDoExtra = (extra: string): TipoDeQuiz | null =>
  (TIPOS_DE_QUIZ as readonly string[]).includes(extra.replace(/^quiz-/, "")) && extra.startsWith("quiz-")
    ? (extra.replace(/^quiz-/, "") as TipoDeQuiz)
    : null;

// ─── PROSPERIDADE ─────────────────────────────────────────────────────────────────────────

/** O número do destino de quem nasceu em `iso` (AAAA-MM-DD): 1–9, ou 11 e 22 (números mestres). */
export function numeroDoDestino(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  let n = iso.replace(/\D/g, "").split("").reduce((s, d) => s + Number(d), 0);
  while (n > 9 && n !== 11 && n !== 22) n = String(n).split("").reduce((s, d) => s + Number(d), 0);
  return n;
}

const TOM_DO_NUMERO: Record<number, { titulo: string; texto: string }> = {
  1: { titulo: "O Iniciador", texto: "A sua prosperidade nasce quando você toma a frente. O seu desafio é não esperar a permissão de ninguém para começar." },
  2: { titulo: "O Parceiro", texto: "Você prospera em parceria e com paciência. O seu desafio é valorizar o que você mesmo traz para a mesa." },
  3: { titulo: "O Comunicador", texto: "A sua prosperidade vem da sua voz e da sua criatividade. O seu desafio é terminar o que começa." },
  4: { titulo: "O Construtor", texto: "Você prospera com método, um tijolo por dia. O seu desafio é não deixar o medo do risco travar o próximo passo." },
  5: { titulo: "O Explorador", texto: "A sua prosperidade gosta de movimento e de novidade. O seu desafio é dar constância ao que funciona." },
  6: { titulo: "O Cuidador", texto: "Você prospera quando cuida e é cuidado. O seu desafio é não se esquecer de você no meio de tanta gente." },
  7: { titulo: "O Sábio", texto: "A sua prosperidade vem do conhecimento e da intuição. O seu desafio é confiar no que você já sabe." },
  8: { titulo: "O Realizador", texto: "Você tem força para conquistar e administrar. O seu desafio é equilibrar ambição e descanso." },
  9: { titulo: "O Generoso", texto: "A sua prosperidade cresce quando circula. O seu desafio é aprender a receber tanto quanto dá." },
  11: { titulo: "O Intuitivo", texto: "Número mestre: a sua prosperidade passa pela inspiração. O seu desafio é transformar visão em passo concreto." },
  22: { titulo: "O Mestre Construtor", texto: "Número mestre: você tem visão grande e mão firme. O seu desafio é não carregar tudo sozinho." },
};

export function previaDaProsperidade(nascimento: string) {
  const numero = numeroDoDestino(nascimento);
  if (numero === null) return null;
  const tom = TOM_DO_NUMERO[numero]!;
  return { numero, ...tom };
}

// ─── CAMINHOS ─────────────────────────────────────────────────────────────────────────────

export const PERFIS_DOS_CAMINHOS = {
  recomeco: { titulo: "Recomeço", texto: "Você está numa fase de fechar um ciclo e abrir outro. O seu caminho se abre quando você solta o que já terminou." },
  clareza: { titulo: "Clareza", texto: "Você tem muitas portas e pouca certeza. O seu caminho se abre quando você escolhe uma direção e dá o primeiro passo." },
  coragem: { titulo: "Coragem", texto: "Você já sabe o que quer, mas algo segura o passo. O seu caminho se abre quando você age antes de estar pronto." },
  paz: { titulo: "Paz interior", texto: "Você carrega cansaço e preocupação. O seu caminho se abre quando você recupera o seu centro antes de correr atrás." },
} as const;
export type PerfilDosCaminhos = keyof typeof PERFIS_DOS_CAMINHOS;

export const PERGUNTAS_DOS_CAMINHOS = [
  { id: "area", texto: "Em que área você mais quer ver o caminho se abrir?", opcoes: [["Trabalho e dinheiro", "coragem"], ["Amor", "recomeco"], ["Família e casa", "paz"], ["Não sei, tudo ao mesmo tempo", "clareza"]] },
  { id: "sente", texto: "Como você se sente hoje?", opcoes: [["Cansada de tentar", "paz"], ["Perdida, sem saber por onde ir", "clareza"], ["Pronta, mas com medo", "coragem"], ["Querendo deixar o passado para trás", "recomeco"]] },
  { id: "precisa", texto: "O que você mais precisa agora?", opcoes: [["Um sinal de qual é o caminho", "clareza"], ["Força para agir", "coragem"], ["Fechar um ciclo", "recomeco"], ["Calma para respirar", "paz"]] },
] as const satisfies ReadonlyArray<{ id: string; texto: string; opcoes: ReadonlyArray<readonly [string, PerfilDosCaminhos]> }>;

/** O perfil pela maioria das respostas; empate fica com a ordem das perguntas (a última resposta desempata). */
export function perfilDosCaminhos(respostas: Record<string, string>): PerfilDosCaminhos {
  const conta: Record<PerfilDosCaminhos, number> = { recomeco: 0, clareza: 0, coragem: 0, paz: 0 };
  let ultimo: PerfilDosCaminhos = "clareza";
  for (const p of PERGUNTAS_DOS_CAMINHOS) {
    const escolhida = p.opcoes.find(([texto]) => texto === respostas[p.id]);
    if (escolhida) {
      conta[escolhida[1]] += 1;
      ultimo = escolhida[1];
    }
  }
  const max = Math.max(...Object.values(conta));
  if (max === 0) return "clareza";
  const empatados = (Object.keys(conta) as PerfilDosCaminhos[]).filter((k) => conta[k] === max);
  return empatados.includes(ultimo) ? ultimo : empatados[0]!;
}

export function previaDosCaminhos(respostas: Record<string, string>) {
  const perfil = perfilDosCaminhos(respostas);
  return { perfil, ...PERFIS_DOS_CAMINHOS[perfil] };
}

// ─── O PEDIDO ─────────────────────────────────────────────────────────────────────────────

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => v >= "1920-01-01" && v <= "2012-12-31" && numeroDoDestino(v) !== null, "data inválida");

export const pedidoDeQuizSchema = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  nascimento: data.optional(),
  email: z.string().trim().toLowerCase().email().max(200),
  respostas: z.record(z.string().max(20), z.string().max(80)).default({}),
  forma: z.enum(["pix", "cartao"]),
  /** A moeda que a página propôs pelo fuso; o valor sai da oferta, no servidor (`moeda-do-visitante.ts`). */
  moeda: z.enum(["BRL", "EUR", "USD"]).default("BRL"),
  /** A visita anônima do funil (0944): liga a visita ao contato no painel ao vivo. */
  visita: z.string().uuid().optional(),
});
export type PedidoDeQuiz = z.infer<typeof pedidoDeQuizSchema>;

/** A prévia de cada quiz, ou `null` quando falta o dado de que ela depende. */
export function previaDoQuiz(tipo: TipoDeQuiz, d: { nascimento?: string | null; respostas: Record<string, string> }): { titulo: string; texto: string; detalhe: string } | null {
  if (tipo === "prosperidade") {
    const p = d.nascimento ? previaDaProsperidade(d.nascimento) : null;
    return p ? { titulo: p.titulo, texto: p.texto, detalhe: `Número ${p.numero}` } : null;
  }
  const c = previaDosCaminhos(d.respostas);
  return { titulo: c.titulo, texto: c.texto, detalhe: c.perfil };
}
