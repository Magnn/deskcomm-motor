/**
 * A SINASTRIA DO QUIZ — "Vocês combinam?", vendida direto na página, sem WhatsApp (migration 0942).
 *
 * O começo do resultado é CALCULADO, não inventado: o signo solar de cada um sai da data de nascimento, e o
 * elemento (fogo, terra, ar, água) do signo. A combinação dos dois elementos dá o tom da prévia grátis. A leitura
 * completa é escrita pela IA depois do pagamento (`gerarSinastria`, em `circulo-ia.ts`), a partir desses dados e
 * das respostas do quiz. Nada aqui promete resultado nem diz o que a outra pessoa sente: é orientação.
 *
 * Pura.
 */
import { z } from "zod";

export const EXTRA_DA_SINASTRIA = "sinastria-quiz";

export const SIGNOS = [
  "Capricórnio", "Aquário", "Peixes", "Áries", "Touro", "Gêmeos",
  "Câncer", "Leão", "Virgem", "Libra", "Escorpião", "Sagitário",
] as const;
export type Signo = (typeof SIGNOS)[number];
export type Elemento = "fogo" | "terra" | "ar" | "água";

/** Dia do mês em que cada signo começa, na ordem de `SIGNOS` (Capricórnio começa em 22/12). */
const INICIO: ReadonlyArray<[number, number]> = [
  [12, 22], [1, 20], [2, 19], [3, 21], [4, 20], [5, 21], [6, 21], [7, 23], [8, 23], [9, 23], [10, 23], [11, 22],
];

const ELEMENTO: Record<Signo, Elemento> = {
  Áries: "fogo", Leão: "fogo", Sagitário: "fogo",
  Touro: "terra", Virgem: "terra", Capricórnio: "terra",
  Gêmeos: "ar", Libra: "ar", Aquário: "ar",
  Câncer: "água", Escorpião: "água", Peixes: "água",
};

/** O signo solar de quem nasceu em `iso` (AAAA-MM-DD). `null` para data inválida. */
export function signoDe(iso: string): Signo | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  let escolhido: Signo = "Capricórnio";
  for (let i = 1; i < INICIO.length; i++) {
    const [mi, di] = INICIO[i]!;
    if (mes > mi || (mes === mi && dia >= di)) escolhido = SIGNOS[i]!;
  }
  // Depois de 22/12 volta a ser Capricórnio.
  if (mes === 12 && dia >= 22) escolhido = "Capricórnio";
  return escolhido;
}

export const elementoDe = (s: Signo): Elemento => ELEMENTO[s];

/**
 * O tom da combinação de dois elementos — a prévia grátis, curta e sem promessa: um PONTO FORTE e um PONTO DE
 * ATENÇÃO com nome. `texto` junta os dois, para quem ainda lê o formato antigo.
 */
export function tomDaCombinacao(a: Elemento, b: Elemento): { titulo: string; forte: string; atencao: string; texto: string } {
  const par = [a, b].sort().join("+");
  const tons: Record<string, { titulo: string; forte: string; atencao: string }> = {
    "fogo+fogo": { titulo: "Duas chamas", forte: "Vocês se acendem rápido e se reconhecem na coragem.", atencao: "Quando os dois querem a última palavra." },
    "terra+terra": { titulo: "Chão firme", forte: "Vocês buscam o que é concreto e duradouro.", atencao: "A rotina apagar o carinho sem ninguém perceber." },
    "ar+ar": { titulo: "Conversa sem fim", forte: "Vocês se conectam pela mente e pelas palavras.", atencao: "Ficar na conversa e não chegar ao sentimento." },
    "água+água": { titulo: "Mar profundo", forte: "Vocês sentem tudo com intensidade e se entendem sem falar.", atencao: "Guardar mágoa em vez de dizer o que doeu." },
    "ar+fogo": { titulo: "Vento que aviva", forte: "Um inspira o outro e a relação ganha movimento.", atencao: "Manter a constância depois da empolgação." },
    "fogo+terra": { titulo: "Fogo e chão", forte: "Um traz a paixão, o outro traz a segurança.", atencao: "O ritmo: um quer agora, o outro quer certeza." },
    "fogo+água": { titulo: "Vapor", forte: "Uma atração forte, feita de opostos.", atencao: "A emoção de um apagar o entusiasmo do outro." },
    "ar+terra": { titulo: "Ideias e raízes", forte: "Um sonha, o outro constrói.", atencao: "Um achar o outro frio, e o outro achar o um distante." },
    "terra+água": { titulo: "Terra fértil", forte: "Uma das combinações que mais acolhem: um dá forma, o outro dá sentimento.", atencao: "Evitar falar do que dói para não balançar o que está firme." },
    "ar+água": { titulo: "Névoa", forte: "Encantamento de um lado, sensibilidade do outro.", atencao: "A razão de um encontrar o coração do outro." },
  };
  const t = tons[par] ?? { titulo: "Um encontro único", forte: "O encontro de vocês tem um desenho próprio.", atencao: "Entender o ritmo de cada um." };
  return { ...t, texto: `${t.forte} O ponto de atenção: ${t.atencao.charAt(0).toLowerCase()}${t.atencao.slice(1)}` };
}

/**
 * As perguntas do quiz, em capítulos, ANTES dos nomes e datas: começar tocando é mais leve que começar digitando.
 * As respostas viram contexto da leitura (e a prévia as repete), nunca mudam o preço.
 */
export const PERGUNTAS_DO_QUIZ = [
  { id: "momento", capitulo: "A história de vocês", texto: "Como está a história de vocês hoje?", opcoes: ["Juntos e bem", "Juntos, mas distantes", "Nos conhecendo", "Gosto de alguém", "Separados"] },
  { id: "tempo", capitulo: "A história de vocês", texto: "Há quanto tempo vocês se conhecem?", opcoes: ["Menos de 6 meses", "De 6 meses a 2 anos", "De 2 a 5 anos", "Mais de 5 anos"] },
  { id: "aperta", capitulo: "O que se repete", texto: "O que mais aperta o seu coração nessa história?", opcoes: ["Não entendo o que a outra pessoa sente", "Brigamos sempre pelo mesmo motivo", "Um se aproxima e o outro se afasta", "Medo de investir e me frustrar"] },
  { id: "briga", capitulo: "O que se repete", texto: "Quando vocês se desentendem, quase sempre é por…", opcoes: ["Tempo e atenção", "Ciúme e confiança", "Planos e dinheiro", "O jeito de falar", "Quase não brigamos"] },
  { id: "carinho", capitulo: "O que se repete", texto: "Como você mais sente o carinho de alguém?", opcoes: ["Palavras", "Presença e tempo junto", "Toque e gestos", "Cuidado no dia a dia"] },
  { id: "deseja", capitulo: "O que você quer", texto: "O que você mais quer entender agora?", opcoes: ["O que nos une de verdade", "Onde a gente se desencontra", "Se vale a pena investir", "Como conversar melhor"] },
] as const;
export type IdDaPergunta = (typeof PERGUNTAS_DO_QUIZ)[number]["id"];

/** O nome curto de cada resposta, no pedido da leitura à IA e no painel. */
export const ROTULO_DA_RESPOSTA: Record<IdDaPergunta, string> = {
  momento: "Como está a história",
  tempo: "Há quanto tempo se conhecem",
  aperta: "O que mais aperta",
  briga: "Por que se desentendem",
  carinho: "Como sente o carinho",
  deseja: "O que quer entender",
};

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => signoDe(v) !== null && v >= "1920-01-01" && v <= "2012-12-31", "data inválida");
const nome = z.string().trim().min(1).max(80);

export const pedidoDoQuizSchema = z.strictObject({
  nome_dela: nome,
  nascimento_dela: data,
  nome_dele: nome,
  nascimento_dele: data,
  email: z.string().trim().toLowerCase().email().max(200),
  respostas: z
    .strictObject(Object.fromEntries(PERGUNTAS_DO_QUIZ.map((p) => [p.id, z.string().max(80).optional()])) as Record<IdDaPergunta, z.ZodOptional<z.ZodString>>)
    .default({}),
  forma: z.enum(["pix", "cartao"]),
  /** A moeda que a página propôs pelo fuso; o valor sai da oferta, no servidor (`moeda-do-visitante.ts`). */
  moeda: z.enum(["BRL", "EUR", "USD"]).default("BRL"),
  /** A visita anônima do funil (0944): liga a visita ao contato no painel ao vivo. */
  visita: z.string().uuid().optional(),
});
export type PedidoDoQuiz = z.infer<typeof pedidoDoQuizSchema>;

/** A prévia grátis inteira: os signos, os elementos e o tom. */
export function previaDaSinastria(nascimentoDela: string, nascimentoDele: string) {
  const sa = signoDe(nascimentoDela);
  const sb = signoDe(nascimentoDele);
  if (!sa || !sb) return null;
  const ea = elementoDe(sa);
  const eb = elementoDe(sb);
  return { signoDela: sa, signoDele: sb, elementoDela: ea, elementoDele: eb, ...tomDaCombinacao(ea, eb) };
}
