/**
 * A SUA MANHÃ — a carta do dia mais funda e o horóscopo DELA, para quem está com o Plano da Semana ou o Círculo
 * (pedido do dono em 03/11/2026: "carta do dia com mais profundidade pra gerar desejo e curiosidade" e "horóscopo do
 * dia específico com a energia dela"). Migration 0956.
 *
 * A carta é a mesma da carta do dia (`carta-do-dia.ts`); o céu é o de verdade: o Sol e a Lua do nascimento dela
 * (`ceu.ts`) e a Lua de hoje (signo e fase). Uma chamada de IA por pessoa por dia, guardada: voltar à tarde mostra o
 * mesmo texto. Sem plano, a área segue com a carta e o horóscopo do signo de sempre.
 *
 * Pura.
 */
import { NOME_DO_FOCO, type Foco } from "./perfil";

export interface ManhaDela {
  /** A carta do dia lida para ela, ligada ao foco e ao céu (até ~110 palavras). */
  carta: string;
  /** A energia do dia dela: a Lua de hoje conversando com o Sol e a Lua do nascimento (até ~90 palavras). */
  energia: string;
  /** Um gesto pequeno para hoje (uma frase). */
  gesto: string;
}

export interface DadosDaManha {
  primeiroNome: string;
  foco: Foco | null;
  carta: { nome: string; mensagem: string; sentidoGeral: string };
  nascimento: { sol: string; lua: string; luaCerta: boolean } | null;
  hoje: { dia: string; luaSigno: string; fase: string; solSigno: string };
}

/** Quem tem a manhã: o Plano da Semana em dia ou o Círculo em dia. */
export function temAManha(d: { noPlano: boolean; noCirculo: boolean }): boolean {
  return d.noPlano || d.noCirculo;
}

const NOME_DA_FASE: Record<string, string> = { nova: "Lua nova", crescente: "Lua crescente", cheia: "Lua cheia", minguante: "Lua minguante" };

export function pedidoDaManha(empresa: string, d: DadosDaManha, regrasDeTom: string): string {
  const foco = d.foco ? NOME_DO_FOCO[d.foco] : null;
  const ceuDela = d.nascimento
    ? `Ela nasceu com o Sol em ${d.nascimento.sol} e a Lua em ${d.nascimento.lua}${d.nascimento.luaCerta ? "" : " (a Lua pode estar no signo vizinho, sem a hora do nascimento: fale dela com leveza)"}.`
    : "Ela não informou a data de nascimento: fale do céu de hoje sem citar o signo dela.";
  return [
    `Você escreve "a manhã" de uma cliente de ${empresa}${d.primeiroNome ? `, ${d.primeiroNome}` : ""}: a carta do dia lida para ela e a energia do dia dela, para abrir no celular de manhã.`,
    `A carta do dia dela é ${d.carta.nome}. O sentido geral da carta: ${d.carta.sentidoGeral} A mensagem curta que ela já viu: "${d.carta.mensagem}"`,
    foco ? `O que mais pede a atenção dela agora: ${foco.nome} (${foco.tema}).` : "Ela não disse o que mais pede a atenção dela agora.",
    `${ceuDela} Hoje (${d.hoje.dia}) o Sol está em ${d.hoje.solSigno}, a Lua está em ${d.hoje.luaSigno} e é ${NOME_DA_FASE[d.hoje.fase] ?? d.hoje.fase}.`,
    `Escreva três partes, falando com ela (você):\n- "carta": a carta do dia mais funda que a mensagem curta, ligada ao foco dela (60 a 110 palavras). Termine com uma pergunta para ela levar no dia.\n- "energia": a energia do dia DELA, pela Lua de hoje conversando com o Sol e a Lua do nascimento (50 a 90 palavras). Cite os signos de verdade, como estão acima.\n- "gesto": um gesto pequeno e concreto para hoje, numa frase.`,
    `Regras:\n- ${regrasDeTom}\n- Astrologia e tarot aqui são reflexão, não previsão: use "pode", "convida", "pede"; nada de "vai acontecer".\n- Nunca fale de morte, doença, acidente ou perda como aviso.\n- Esta manhã é escrita automaticamente: não diga que é uma pessoa escrevendo.\n- Use o nome dela no máximo uma vez.`,
    'Responda só com JSON, sem texto fora dele: {"carta": "…", "energia": "…", "gesto": "…"}.',
  ].join("\n\n");
}

const texto = (v: unknown, teto: number): string => (typeof v === "string" ? v.trim().slice(0, teto) : "");

/** Lê a resposta da IA; `null` quando falta uma parte ou o JSON não serve. */
export function lerManha(bruto: string): ManhaDela | null {
  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(bruto.slice(inicio, fim + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const carta = texto(j.carta, 1500);
  const energia = texto(j.energia, 1200);
  const gesto = texto(j.gesto, 300);
  return carta && energia && gesto ? { carta, energia, gesto } : null;
}

/** A manhã gravada, conferida (um jsonb sem as três partes não vai à tela). */
export function manhaGravada(v: unknown): ManhaDela | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Partial<ManhaDela>;
  return typeof m.carta === "string" && typeof m.energia === "string" && typeof m.gesto === "string"
    ? { carta: m.carta, energia: m.energia, gesto: m.gesto }
    : null;
}
