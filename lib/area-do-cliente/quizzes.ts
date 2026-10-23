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

import { ALMA_NO_AMOR, letrasQueVibram, numeroDaAlma, retratoDoPar } from "./retrato-do-par";

/** Os quizzes de uma pessoa; o mesmo conjunto do CHECK de `area_quiz_pedidos.tipo` (0943, 0945). */
export const TIPOS_DE_QUIZ = ["prosperidade", "caminhos", "par"] as const;
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

// ─── O RETRATO DO PAR ─────────────────────────────────────────────────────────────────────

/**
 * As perguntas do Retrato do Par, antes da data. A hora e o lugar de nascimento entram nas respostas (`hora`,
 * `lugar`), porque o pedido já guarda as respostas como texto curto — o Descendente sai delas.
 */
/**
 * Uma pergunta de quiz. `tipo`: `unica` (avança no toque, o padrão), `multipla` (marca várias e confirma) ou `escala`
 * (1 a 5, com `rotulos` nas pontas). `apoio` é a linha pequena abaixo do título. `mecanismoAntes` põe a tela do
 * mecanismo (com o vídeo da guia) ANTES desta pergunta — como o "break" no meio do quiz dos funis que escalam; sem
 * nenhuma marcada, o mecanismo vem depois da última.
 */
export interface PerguntaDeQuiz {
  id: string;
  capitulo: string;
  texto: string;
  opcoes: readonly string[];
  tipo?: "unica" | "multipla" | "escala";
  apoio?: string;
  rotulos?: readonly [string, string];
  mecanismoAntes?: boolean;
}

/**
 * O Retrato do Par, modelado tela a tela no quiz de relacionamento que mais escala no Meta (5 blocos, ~27 toques,
 * a fala da guia entre os blocos e o vídeo depois de "O que ficou"). As perguntas são do mesmo tipo; o que muda é o
 * mecanismo do resultado — Vênus e o Descendente calculados, nunca uma "pessoa destinada". A hora e o lugar de
 * nascimento entram nas respostas (`hora`, `lugar`); o nome completo, no pedido.
 */
export const PERGUNTAS_DO_PAR: readonly PerguntaDeQuiz[] = [
  // Sobre você
  { id: "gen", capitulo: "Sobre você", texto: "Para começar, como você se identifica?", apoio: "O mapa fala de amor de um jeito diferente para cada pessoa.", opcoes: ["Mulher", "Homem", "Prefiro não dizer"] },
  { id: "idade", capitulo: "Sobre você", texto: "Qual é a sua faixa de idade?", opcoes: ["18 a 29 anos", "30 a 39 anos", "40 a 49 anos", "50 a 59 anos", "60 anos ou mais"] },
  { id: "momento", capitulo: "Sobre você", texto: "Como está o seu coração hoje?", opcoes: ["Estou só e quero encontrar a pessoa certa", "Tenho alguém, mas não sei se é a pessoa certa", "Vivo uma relação e quero entender o que me faz bem", "Saí de uma relação e quero recomeçar"] },
  { id: "tempo", capitulo: "Sobre você", texto: "Há quanto tempo você sente que o amor não flui na sua vida?", opcoes: ["Menos de 1 ano", "De 1 a 3 anos", "De 3 a 10 anos", "Mais de 10 anos", "Sinto que nunca fluiu de verdade"] },
  { id: "frequencia", capitulo: "Sobre você", texto: "Com que frequência você pensa na sua vida amorosa?", opcoes: ["Todos os dias", "Algumas vezes por semana", "Raramente, tento não pensar"] },
  // A sua história
  { id: "amou", capitulo: "A sua história", texto: "Quantas vezes você já amou de verdade?", opcoes: ["Acho que nunca", "Uma vez", "Duas ou três vezes", "Mais do que isso"] },
  { id: "termina", capitulo: "A sua história", texto: "Como terminou o seu último relacionamento importante?", opcoes: ["A outra pessoa foi embora", "Eu fui embora", "Houve traição", "Foi se apagando aos poucos", "Ainda estou nele"] },
  { id: "repete", capitulo: "A sua história", texto: "Você sente que os seus relacionamentos repetem a mesma história?", opcoes: ["Sim, sempre a mesma história", "Às vezes", "Não, cada um foi diferente"] },
  { id: "marcas", capitulo: "A sua história", tipo: "multipla", texto: "O que já aconteceu com você no amor?", apoio: "Pode marcar mais de uma.", opcoes: ["Dei muito mais do que recebi", "Fui traída ou enganada", "Me senti invisível ao lado de alguém", "Fui cobrada o tempo todo", "Me afastei por medo de sofrer", "Nenhuma dessas"] },
  { id: "errada", capitulo: "A sua história", texto: "Você já ficou com alguém sabendo, lá no fundo, que não era a pessoa certa?", opcoes: ["Sim", "Não", "Prefiro não responder"] },
  // O que ficou
  { id: "dor", capitulo: "O que ficou", texto: "Qual dessas frases mais pesa em você?", opcoes: ["“Será que o amor não é pra mim?”", "“Perdi tempo demais com a pessoa errada.”", "“Tenho medo de passar o resto da vida só.”", "“Já não consigo confiar em ninguém.”"] },
  { id: "chorou", capitulo: "O que ficou", texto: "Você já chorou por alguém que não merecia?", opcoes: ["Muitas vezes", "Algumas vezes", "Nunca"] },
  { id: "coracao", capitulo: "O que ficou", texto: "Depois da última desilusão, o seu coração ficou…", opcoes: ["Fechado", "Cansado", "Esperançoso, apesar de tudo", "Com raiva"] },
  { id: "desistir", capitulo: "O que ficou", texto: "Você já pensou em desistir do amor?", opcoes: ["Já desisti", "Pensei várias vezes", "Nunca"] },
  { id: "falta", capitulo: "O que ficou", tipo: "escala", texto: "De 1 a 5, quanto você sente falta de alguém que te entenda de verdade?", rotulos: ["Pouco", "Demais"], opcoes: ["1", "2", "3", "4", "5"] },
  { id: "passado", capitulo: "O que ficou", texto: "Existe alguém do passado que você ainda não esqueceu?", opcoes: ["Sim", "Não sei dizer", "Não"] },
  { id: "saudade", capitulo: "O que ficou", texto: "Do que você mais sente falta?", opcoes: ["Carinho", "Companheirismo", "Ser a escolha de alguém", "Conversa de verdade", "Fazer planos a dois"] },
  // Os sinais (o vídeo da guia vem antes)
  { id: "acredita", capitulo: "Os sinais", mecanismoAntes: true, texto: "Você acredita que existe alguém que combina de verdade com você?", opcoes: ["Acredito muito", "Quero acreditar", "Tenho dúvidas"] },
  { id: "ligacao", capitulo: "Os sinais", texto: "Já sentiu uma ligação sem explicação com alguém que tinha acabado de conhecer?", opcoes: ["Sim, muito forte", "Uma vez", "Nunca"] },
  { id: "sonho", capitulo: "Os sinais", texto: "Você já sonhou com alguém que não conhecia?", opcoes: ["Sim, e parecia real", "Às vezes, não tenho certeza", "Nunca"] },
  { id: "sente", capitulo: "Os sinais", texto: "Você já sentiu alguém pensando em você, sem motivo nenhum?", opcoes: ["Sim, várias vezes", "Uma ou duas vezes", "Nunca percebi"] },
  { id: "numeros", capitulo: "Os sinais", texto: "Você costuma ver números repetidos, como 11:11 ou 22:22?", opcoes: ["Sempre", "Às vezes", "Nunca reparei"] },
  { id: "consultou", capitulo: "Os sinais", texto: "Você já buscou respostas no tarô, na astrologia ou com uma sensitiva?", opcoes: ["Sim, várias vezes", "Uma vez", "Nunca, esta é a primeira vez"] },
  // O que você quer
  { id: "atrai", capitulo: "O que você quer", texto: "O que mais te atrai em alguém, logo de cara?", opcoes: ["Confiança e atitude", "Mistério e intensidade", "Conversa e humor", "Carinho e cuidado"] },
  { id: "busca", capitulo: "O que você quer", texto: "O que você mais busca no amor?", opcoes: ["Estabilidade e segurança", "Uma conexão profunda", "Crescer junto com alguém", "Alguém que me complete"] },
  { id: "quer", capitulo: "O que você quer", tipo: "multipla", texto: "O que você mais quer entender?", apoio: "Pode marcar mais de uma.", opcoes: ["Quem combina comigo de verdade", "Por que repito o mesmo padrão", "O que eu preciso numa relação", "Como reconhecer quem me faz bem", "Se a pessoa de agora combina comigo"] },
  { id: "pronta", capitulo: "O que você quer", texto: "Você quer mesmo saber, mesmo que isso mude o que você pensa sobre o amor?", opcoes: ["Sim, quero saber", "Tenho medo, mas quero"] },
];

/**
 * A prévia do Retrato do Par: Vênus sempre; Descendente e o encontro dos dois quando há hora e lugar. `detalhe`
 * guarda os signos para o pedido da leitura; `fato` é a frase calculada que a leitura completa precisa desenvolver.
 */
export function previaDoPar(nascimento: string, respostas: Record<string, string>, nome?: string | null) {
  const r = retratoDoPar({ nascimento, hora: respostas.hora ?? null, lugar: respostas.lugar ?? null });
  if (!r) return null;
  const alma = nome ? numeroDaAlma(nome) : null;
  const titulo = r.descendente ? `Vênus em ${r.venus.signo}, Descendente em ${r.descendente.signo}` : `Vênus em ${r.venus.signo}`;
  const texto = r.descendente
    ? `O que te atrai: ${r.venus.atrai}. O que te faz bem: ${r.descendente.fazBem}.`
    : `O que te atrai: ${r.venus.atrai}. Com a hora de nascimento, a leitura mostra também o que te faz bem.`;
  const fato = [
    `Vênus em ${r.venus.signo} (${r.venus.elemento})`,
    r.descendente ? `Descendente em ${r.descendente.signo} (${r.descendente.elemento}), Ascendente em ${r.descendente.ascendente}` : "sem hora de nascimento: Descendente não calculado",
    r.encontro === "conversam" ? "Vênus e Descendente em elementos que conversam" : r.encontro === "desencontram" ? "Vênus e Descendente em elementos que se desencontram (atração e bem-estar apontam para lados diferentes)" : "",
    `signos do perfil que combina: ${r.combinam.join(", ")}`,
    alma ? `número da alma ${alma} (${ALMA_NO_AMOR[alma]})` : "",
    alma ? `letras que vibram com o número da alma, pela tabela pitagórica: ${letrasQueVibram(alma).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return { titulo, texto, detalhe: titulo, fato, retrato: r, alma, almaNoAmor: alma ? ALMA_NO_AMOR[alma]! : null, letras: alma ? letrasQueVibram(alma) : [] };
}

// ─── O PEDIDO ─────────────────────────────────────────────────────────────────────────────

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => v >= "1920-01-01" && v <= "2012-12-31" && numeroDoDestino(v) !== null, "data inválida");

export const pedidoDeQuizSchema = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  nascimento: data.optional(),
  email: z.string().trim().toLowerCase().email().max(200),
  // 200: a resposta de uma pergunta de múltipla escolha são as opções marcadas, juntas.
  respostas: z.record(z.string().max(20), z.string().max(200)).default({}),
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
  d: { nascimento?: string | null; respostas: Record<string, string>; nome?: string | null },
  hoje: Date = new Date(),
): { titulo: string; texto: string; detalhe: string; fato: string } | null {
  if (tipo === "par") {
    const p = d.nascimento ? previaDoPar(d.nascimento, d.respostas, d.nome) : null;
    return p ? { titulo: p.titulo, texto: p.texto, detalhe: p.detalhe, fato: p.fato } : null;
  }
  if (tipo === "prosperidade") {
    const p = d.nascimento ? previaDaProsperidade(d.nascimento, hoje) : null;
    return p ? { titulo: p.titulo, texto: p.texto, detalhe: `Número ${p.numero}`, fato: `Ano pessoal de ${p.ano}: ${p.anoPessoal} (${p.tomDoAno})` } : null;
  }
  const c = previaDosCaminhos(d.respostas);
  return { titulo: c.titulo, texto: c.texto, detalhe: c.perfil, fato: `Carta-chave: ${c.carta}. ${c.sentidoDaCarta}` };
}
