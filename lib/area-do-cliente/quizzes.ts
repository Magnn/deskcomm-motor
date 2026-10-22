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

/** Soma os algarismos de `n`. */
const somaDosAlgarismos = (n: number | string) => String(n).split("").reduce((s, d) => s + Number(d), 0);

/**
 * A CONTA do número do destino, passo a passo, como a tela de cálculo mostra: "1+5+0+5+1+9+9+0 = 30", "3+0 = 3".
 * Para em 1–9, ou em 11 e 22 (números mestres, que não se reduzem).
 */
export function contaDoDestino(iso: string): { passos: string[]; numero: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const digitos = iso.replace(/\D/g, "").split("");
  let n = somaDosAlgarismos(digitos.join(""));
  const passos = [`${digitos.join("+")} = ${n}`];
  while (n > 9 && n !== 11 && n !== 22) {
    const prox = somaDosAlgarismos(n);
    passos.push(`${String(n).split("").join("+")} = ${prox}`);
    n = prox;
  }
  return { passos, numero: n };
}

/** O número do destino de quem nasceu em `iso` (AAAA-MM-DD): 1–9, ou 11 e 22 (números mestres). */
export function numeroDoDestino(iso: string): number | null {
  return contaDoDestino(iso)?.numero ?? null;
}

/**
 * O ANO PESSOAL: dia + mês de nascimento + o ano que se quer ler, reduzidos a 1–9 (aqui sem mestres, como na
 * numerologia popular do ano pessoal). De outubro em diante a prévia lê o ano que vem: é o que a pessoa planeja.
 */
export function anoPessoal(iso: string, ano: number): number | null {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  let n = somaDosAlgarismos(`${m[2]}${m[1]}${ano}`);
  while (n > 9) n = somaDosAlgarismos(n);
  return n;
}

export const anoDaLeitura = (hoje: Date = new Date()) => (hoje.getMonth() >= 9 ? hoje.getFullYear() + 1 : hoje.getFullYear());

/** O que cada ano pessoal pede, numa frase — a prévia mostra o número; a leitura completa desenvolve. */
export const TOM_DO_ANO_PESSOAL: Record<number, string> = {
  1: "ano de começar: plantar o que vai crescer nos próximos nove",
  2: "ano de parceria e paciência: o que se constrói junto",
  3: "ano de se mostrar: comunicar, criar, aparecer",
  4: "ano de base: organizar, trabalhar com método",
  5: "ano de mudança: movimento, escolhas e novidade",
  6: "ano de casa e responsabilidade: cuidar do que importa",
  7: "ano de estudo e recolhimento: entender antes de agir",
  8: "ano de colheita e decisões práticas, inclusive com dinheiro",
  9: "ano de fechar ciclos: soltar o que terminou",
};

/** As perguntas da prosperidade, ANTES da data: o jeito de lidar com dinheiro e o que pesa hoje. Sem renda nem dívida. */
export const PERGUNTAS_DA_PROSPERIDADE = [
  { id: "estilo", capitulo: "Você e o dinheiro", texto: "Com dinheiro, você é mais de…", opcoes: ["Guardar", "Gastar com o que dá prazer", "Investir em ideias", "Deixar para depois"] },
  { id: "pesa", capitulo: "Você e o dinheiro", texto: "O que mais pesa hoje?", opcoes: ["Decidir o próximo passo", "Cobrar o quanto valho", "Ter constância", "Começar algo novo"] },
  { id: "trabalho", capitulo: "O seu momento", texto: "Como está o seu trabalho hoje?", opcoes: ["Crescendo", "Estável", "Parado", "Recomeçando"] },
  { id: "quando", capitulo: "O seu momento", texto: "Para quando você quer clareza?", opcoes: ["Para este mês", "Para a virada do ano"] },
] as const;

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

export function previaDaProsperidade(nascimento: string, hoje: Date = new Date()) {
  const conta = contaDoDestino(nascimento);
  if (!conta) return null;
  const ano = anoDaLeitura(hoje);
  const pessoal = anoPessoal(nascimento, ano)!;
  return { numero: conta.numero, passos: conta.passos, ano, anoPessoal: pessoal, tomDoAno: TOM_DO_ANO_PESSOAL[pessoal]!, ...TOM_DO_NUMERO[conta.numero]! };
}

// ─── CAMINHOS ─────────────────────────────────────────────────────────────────────────────

/**
 * Os quatro perfis, cada um com uma CARTA-CHAVE do tarô (os Arcanos Maiores de `lib/leitura/baralho.ts`). A carta
 * sai do perfil por regra fixa e declarada na tela — não é sorteio. Escolhidas para nomear o que o momento pede,
 * sem cartas de medo.
 */
export const PERFIS_DOS_CAMINHOS = {
  recomeco: { titulo: "Recomeço", texto: "Você está numa fase de fechar um ciclo e abrir outro. O seu caminho se abre quando você solta o que já terminou.", carta: "A Estrela", sentidoDaCarta: "A Estrela vem depois da tempestade: é a esperança que volta e o primeiro passo de um ciclo novo." },
  clareza: { titulo: "Clareza", texto: "Você tem muitas portas e pouca certeza. O seu caminho se abre quando você escolhe uma direção e dá o primeiro passo.", carta: "Os Enamorados", sentidoDaCarta: "Os Enamorados são a carta da escolha: o caminho abre quando uma porta é escolhida de coração." },
  coragem: { titulo: "Coragem", texto: "Você já sabe o que quer, mas algo segura o passo. O seu caminho se abre quando você age antes de estar pronto.", carta: "O Carro", sentidoDaCarta: "O Carro é a vontade em movimento: a direção já existe, falta segurar as rédeas e ir." },
  paz: { titulo: "Paz interior", texto: "Você carrega cansaço e preocupação. O seu caminho se abre quando você recupera o seu centro antes de correr atrás.", carta: "A Temperança", sentidoDaCarta: "A Temperança é o equilíbrio: misturar descanso e ação na medida, sem pressa e sem parar." },
} as const;
export type PerfilDosCaminhos = keyof typeof PERFIS_DOS_CAMINHOS;

export const PERGUNTAS_DOS_CAMINHOS = [
  { id: "area", capitulo: "Onde está travado", texto: "Em que área você mais quer ver o caminho se abrir?", opcoes: [["Trabalho e dinheiro", "coragem"], ["Amor", "recomeco"], ["Família e casa", "paz"], ["Não sei, tudo ao mesmo tempo", "clareza"]] },
  { id: "sente", capitulo: "Onde está travado", texto: "Como você se sente hoje?", opcoes: [["Cansada de tentar", "paz"], ["Perdida, sem saber por onde ir", "clareza"], ["Pronta, mas com medo", "coragem"], ["Querendo deixar o passado para trás", "recomeco"]] },
  { id: "decide", capitulo: "O seu jeito", texto: "Diante de uma escolha, você costuma…", opcoes: [["Esperar até ter certeza", "coragem"], ["Ficar entre duas opções", "clareza"], ["Pensar no que já passou", "recomeco"], ["Ir no impulso e depois se cansar", "paz"]] },
  { id: "precisa", capitulo: "O que você quer", texto: "O que você mais precisa agora?", opcoes: [["Um sinal de qual é o caminho", "clareza"], ["Força para agir", "coragem"], ["Fechar um ciclo", "recomeco"], ["Calma para respirar", "paz"]] },
] as const satisfies ReadonlyArray<{ id: string; capitulo: string; texto: string; opcoes: ReadonlyArray<readonly [string, PerfilDosCaminhos]> }>;

/** Para a tela de cálculo: o perfil que CADA resposta apontou, na ordem das perguntas. */
export function votosDosCaminhos(respostas: Record<string, string>): { resposta: string; perfil: PerfilDosCaminhos }[] {
  const votos: { resposta: string; perfil: PerfilDosCaminhos }[] = [];
  for (const p of PERGUNTAS_DOS_CAMINHOS) {
    const escolhida = p.opcoes.find(([texto]) => texto === respostas[p.id]);
    if (escolhida) votos.push({ resposta: escolhida[0], perfil: escolhida[1] });
  }
  return votos;
}

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

/**
 * A prévia de cada quiz, ou `null` quando falta o dado de que ela depende. `fato` é o dado calculado a mais que a
 * prévia mostra (o ano pessoal; a carta-chave) — ele vai também para o pedido da leitura, para a leitura completa
 * entregar o que a prévia anunciou.
 */
export function previaDoQuiz(
  tipo: TipoDeQuiz,
  d: { nascimento?: string | null; respostas: Record<string, string> },
  hoje: Date = new Date(),
): { titulo: string; texto: string; detalhe: string; fato: string } | null {
  if (tipo === "prosperidade") {
    const p = d.nascimento ? previaDaProsperidade(d.nascimento, hoje) : null;
    return p ? { titulo: p.titulo, texto: p.texto, detalhe: `Número ${p.numero}`, fato: `Ano pessoal de ${p.ano}: ${p.anoPessoal} (${p.tomDoAno})` } : null;
  }
  const c = previaDosCaminhos(d.respostas);
  return { titulo: c.titulo, texto: c.texto, detalhe: c.perfil, fato: `Carta-chave: ${c.carta}. ${c.sentidoDaCarta}` };
}
