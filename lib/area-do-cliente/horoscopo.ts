/**
 * O HORÓSCOPO DO DIA da área do cliente (do estudo de experiência: um segundo gancho diário, ao lado da carta do
 * dia). Pelo signo solar que a área já calcula da data de nascimento (`ceu.ts`).
 *
 * Como no horóscopo de jornal, é o mesmo texto para todo mundo do signo naquele dia — e a tela diz que é do signo,
 * não "da pessoa". Lista curada por elemento (fogo, terra, ar, água), sem custo de IA, sem medo e sem promessa:
 * fala de tendência e de atitude, nunca de acontecimento certo.
 */
import { createHash } from "node:crypto";

import { SIGNOS } from "@/lib/relatorio/astrologia";

export type Signo = (typeof SIGNOS)[number];
type Elemento = "fogo" | "terra" | "ar" | "agua";

const ELEMENTO: Record<Signo, Elemento> = {
  Áries: "fogo",
  Leão: "fogo",
  Sagitário: "fogo",
  Touro: "terra",
  Virgem: "terra",
  Capricórnio: "terra",
  Gêmeos: "ar",
  Libra: "ar",
  Aquário: "ar",
  Câncer: "agua",
  Escorpião: "agua",
  Peixes: "agua",
};

export const HOROSCOPO_DO_ELEMENTO: Record<Elemento, readonly string[]> = {
  fogo: [
    "Sua energia está alta hoje. Use para começar, não para brigar.",
    "Dia bom para tomar a iniciativa numa conversa que você vem adiando.",
    "A pressa pode atrapalhar. Termine uma coisa antes de começar outra.",
    "Seu brilho chama atenção hoje. Deixe ele abrir portas, sem precisar provar nada.",
    "Movimente o corpo: o que está agitado por dentro se acalma em movimento.",
    "Um gesto generoso hoje volta para você de um jeito que você não espera.",
  ],
  terra: [
    "Dia de pôr ordem: uma gaveta, uma conta, uma decisão pendente.",
    "O que você constrói devagar hoje fica de pé por muito tempo.",
    "Cuide do corpo: comer bem e dormir cedo valem mais que qualquer plano.",
    "Uma conversa prática resolve o que a preocupação só aumentava.",
    "Hoje, valorize o que você já tem antes de correr atrás do que falta.",
    "Sua paciência é a sua força hoje. Não deixe ninguém apressar você.",
  ],
  ar: [
    "Dia bom para conversar. Uma troca de ideias clareia o que estava confuso.",
    "Escreva o que está na sua cabeça: no papel, fica mais leve.",
    "Uma notícia ou um contato antigo pode trazer uma ideia nova.",
    "Hoje, escute antes de opinar. Você vai entender mais do que imagina.",
    "Evite decidir no impulso: dê uma volta, respire e só depois responda.",
    "Seu jeito leve faz bem a quem está perto hoje. Não esconda.",
  ],
  agua: [
    "Seu sentir está mais forte hoje. Acolha, sem se afogar nele.",
    "Confie na primeira impressão: a sua intuição está afinada.",
    "Dia de cuidar de você antes de cuidar de todo mundo.",
    "Uma lembrança pode voltar hoje. Deixe ela passar com carinho.",
    "Água, descanso e um momento de silêncio fazem milagres no seu humor.",
    "Quem é seu de verdade entende seus limites. Pode dizer não.",
  ],
};

export function ehSigno(v: unknown): v is Signo {
  return typeof v === "string" && (SIGNOS as readonly string[]).includes(v);
}

/** O texto de hoje do signo: o mesmo para todo mundo do signo no dia, outro amanhã. */
export function horoscopoDoDia(signo: Signo, dia: string): string {
  const lista = HOROSCOPO_DO_ELEMENTO[ELEMENTO[signo]];
  const n = createHash("sha256").update(`horoscopo:${signo}:${dia}`, "utf8").digest().readUInt32BE(0);
  return lista[n % lista.length]!;
}
