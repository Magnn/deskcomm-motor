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

/** O tom da combinação de dois elementos — a prévia grátis, curta e sem promessa. */
export function tomDaCombinacao(a: Elemento, b: Elemento): { titulo: string; texto: string } {
  const par = [a, b].sort().join("+");
  const tons: Record<string, { titulo: string; texto: string }> = {
    "fogo+fogo": { titulo: "Duas chamas", texto: "Vocês se acendem rápido e se reconhecem na coragem. O desafio é quando os dois querem a última palavra." },
    "terra+terra": { titulo: "Chão firme", texto: "Vocês buscam o que é concreto e duradouro. O desafio é não deixar a rotina apagar o carinho." },
    "ar+ar": { titulo: "Conversa sem fim", texto: "Vocês se conectam pela mente e pelas palavras. O desafio é sair da conversa e chegar ao sentimento." },
    "água+água": { titulo: "Mar profundo", texto: "Vocês sentem tudo com intensidade e se entendem sem falar. O desafio é não se afogarem nas mágoas." },
    "ar+fogo": { titulo: "Vento que aviva", texto: "Um inspira o outro e a relação ganha movimento. O desafio é manter a constância depois da empolgação." },
    "fogo+terra": { titulo: "Fogo e chão", texto: "Um traz a paixão, o outro traz a segurança. O desafio é o ritmo: um quer agora, o outro quer certeza." },
    "água+fogo": { titulo: "Vapor", texto: "Uma atração forte, feita de opostos. O desafio é a emoção de um não apagar o entusiasmo do outro." },
    "ar+terra": { titulo: "Ideias e raízes", texto: "Um sonha, o outro constrói. O desafio é um não achar o outro frio, nem o outro achar o um distante." },
    "terra+água": { titulo: "Terra fértil", texto: "Uma das combinações que mais acolhem: um dá forma, o outro dá sentimento. O desafio é falar do que dói." },
    "ar+água": { titulo: "Névoa", texto: "Encantamento de um lado, sensibilidade do outro. O desafio é a razão de um encontrar o coração do outro." },
  };
  return tons[par] ?? { titulo: "Um encontro único", texto: "O encontro de vocês tem um desenho próprio." };
}

/** As perguntas do quiz (além dos nomes e datas). As respostas viram contexto da leitura, não do preço. */
export const PERGUNTAS_DO_QUIZ = [
  { id: "momento", texto: "Como está a relação de vocês hoje?", opcoes: ["Juntos e felizes", "Juntos, mas distantes", "Separados", "Ainda não começou"] },
  { id: "aperta", texto: "O que mais aperta o seu coração?", opcoes: ["Não sei o que ele sente", "Brigamos pelo mesmo motivo", "Ele some e volta", "Medo de perder"] },
  { id: "deseja", texto: "O que você mais deseja agora?", opcoes: ["Entender o que nos une", "Saber se vale insistir", "Ter paz, seja qual for o caminho", "Que a gente se acerte"] },
] as const;

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => signoDe(v) !== null && v >= "1920-01-01" && v <= "2012-12-31", "data inválida");
const nome = z.string().trim().min(1).max(80);

export const pedidoDoQuizSchema = z.strictObject({
  nome_dela: nome,
  nascimento_dela: data,
  nome_dele: nome,
  nascimento_dele: data,
  email: z.string().trim().toLowerCase().email().max(200),
  respostas: z.strictObject({ momento: z.string().max(80).optional(), aperta: z.string().max(80).optional(), deseja: z.string().max(80).optional() }).default({}),
  forma: z.enum(["pix", "cartao"]),
  /** A moeda que a página propôs pelo fuso; o valor sai da oferta, no servidor (`moeda-do-visitante.ts`). */
  moeda: z.enum(["BRL", "EUR", "USD"]).default("BRL"),
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
