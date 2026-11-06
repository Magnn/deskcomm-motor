/**
 * O QUE ELA JÁ VIVEU NA ÁREA DO CLIENTE, NO RITUAL DE ABERTURA — a guia que LEMBRA.
 *
 * ─── O que faltava ──────────────────────────────────────────────────────────
 *
 * O agente lembrava a CONVERSA (checkpoint, resumo, notas do lead), mas nada do que a pessoa fez na área
 * (`app/c/[org]`): as perguntas que levou à Mesa e as cartas que saíram, a leitura da mão, os quizzes e a
 * sinastria que comprou, o foco e o que está pesando, o Sol e a Lua dela. Ela tirava "A Torre" na área e, no
 * chat, a guia não sabia.
 *
 * Nos comentários das lojas (02/11/2026), o elogio mais forte a um app do setor foi exatamente este: a
 * assistente "lembra das minhas perguntas, das minhas metas e das minhas leituras, como uma conversa
 * contínua" (Moonly, 5★). Este bloco é essa memória.
 *
 * ─── Orçamento ──────────────────────────────────────────────────────────────
 *
 * Vai no SUFIXO, como os compromissos (`compromissos-do-contato.ts`): pago em todo turno de quem tem área.
 * Quem não tem nada na área não paga nada (bloco vazio = não entra). Com área, linhas curtas e teto de
 * caracteres; as leituras longas entram pela pergunta e pelas cartas, não pelo texto.
 *
 * O diário NÃO entra: a área promete que ele é "um lugar só seu".
 */
import { ceuDoNascimento } from "@/lib/area-do-cliente/ceu";
import { lerCartas } from "@/lib/area-do-cliente/leituras";
import { NOME_DO_FOCO, ehFoco } from "@/lib/area-do-cliente/perfil";

import type { Queryable } from "../queue/queue";

const TETO = 1400;
const LEITURAS = 5;

const NOME_DO_QUIZ: Record<string, string> = {
  par: "O Retrato do Par",
  prosperidade: "O Código da Prosperidade",
  caminhos: "Abrir os Caminhos",
  sombra: "O Código da Sombra",
};

export interface AreaDoContato {
  nascimento: string | null;
  foco: string | null;
  oQuePesa: string | null;
  leituras: Array<{ quando: string; modalidade: string; pergunta: string; cartas: unknown }>;
  mao: { quando: string; paga: boolean; leitura: unknown } | null;
  quizzes: Array<{ quando: string; tipo: string }>;
  sinastrias: Array<{ quando: string; nomeDele: string }>;
}

const dia = (iso: string): string => iso.slice(0, 10).split("-").reverse().join("/");
const curto = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** O texto do bloco; vazio quando não há nada da área (e aí o bloco não entra no prompt). */
export function renderAreaDoContato(a: AreaDoContato): string {
  const linhas: string[] = [];
  const ceu = ceuDoNascimento(a.nascimento);
  if (ceu) linhas.push(`- Céu de nascimento: Sol em ${ceu.sol}${ceu.luaCerta ? `, Lua em ${ceu.lua}` : ""}.`);
  if (ehFoco(a.foco)) linhas.push(`- O que mais pede cuidado agora (ela escolheu): ${NOME_DO_FOCO[a.foco].nome}.`);
  if (a.oQuePesa?.trim()) linhas.push(`- O que está pesando (palavras dela): "${curto(a.oQuePesa.trim(), 200)}"`);
  for (const l of a.leituras) {
    const cartas = lerCartas(l.cartas).map((c) => c.nome).join(", ");
    linhas.push(
      `- ${dia(l.quando)}, Mesa (${l.modalidade === "baralho-cigano" ? "baralho cigano" : "tarot"}): perguntou "${curto(l.pergunta.trim(), 140)}"${cartas ? ` — saíram ${cartas}` : ""}.`,
    );
  }
  if (a.mao) {
    const sintese = (a.mao.leitura as { sintese?: unknown } | null)?.sintese;
    linhas.push(
      `- ${dia(a.mao.quando)}, leitura da mão${a.mao.paga ? " completa" : " (só a linha do coração, grátis)"}${
        a.mao.paga && typeof sintese === "string" && sintese.trim() ? `: ${curto(sintese.trim(), 220)}` : "."
      }`,
    );
  }
  for (const q of a.quizzes) linhas.push(`- ${dia(q.quando)}, comprou "${NOME_DO_QUIZ[q.tipo] ?? q.tipo}".`);
  for (const s of a.sinastrias) linhas.push(`- ${dia(s.quando)}, comprou a sinastria com ${curto(s.nomeDele.trim(), 40)}.`);
  if (linhas.length === 0) return "";

  const regra =
    "Use para LEMBRAR dela com naturalidade, como quem acompanha (\"daquela vez que saiu a Estrela pra você…\"), " +
    "quando ajudar a conversa. Não recite a lista, não invente o que não está aqui e não cobre de novo o que ela já comprou.";
  let corpo = "";
  for (const l of linhas) {
    if ((corpo + l).length > TETO) {
      corpo += "- (há mais na área; estes são os mais recentes)\n";
      break;
    }
    corpo += `${l}\n`;
  }
  return `${corpo}${regra}`;
}

export async function areaDoContato(db: Queryable, organizationId: string, contactId: string): Promise<AreaDoContato> {
  const [contato, perfil, leituras, mao, quizzes, sinastrias] = await Promise.all([
    db.query<{ birthdate: string | null }>(
      "select birthdate::text as birthdate from contacts where organization_id = $1 and id = $2",
      [organizationId, contactId],
    ),
    db.query<{ foco: string | null; o_que_pesa: string | null }>(
      "select foco, o_que_pesa from area_perfis where organization_id = $1 and contact_id = $2",
      [organizationId, contactId],
    ),
    db.query<{ quando: string; modalidade: string; pergunta: string; cartas: unknown }>(
      `select pago_at::text as quando, modalidade, pergunta, cartas from area_leituras
        where organization_id = $1 and contact_id = $2 and pago_at is not null
        order by pago_at desc limit ${LEITURAS}`,
      [organizationId, contactId],
    ),
    db.query<{ quando: string; paga: boolean; leitura: unknown }>(
      `select created_at::text as quando, pago_at is not null as paga, leitura from area_maos
        where organization_id = $1 and contact_id = $2 order by created_at desc limit 1`,
      [organizationId, contactId],
    ),
    db.query<{ quando: string; tipo: string }>(
      `select pago_at::text as quando, tipo from area_quiz_pedidos
        where organization_id = $1 and contact_id = $2 and pago_at is not null order by pago_at desc limit 5`,
      [organizationId, contactId],
    ),
    db.query<{ quando: string; nome_dele: string }>(
      `select pago_at::text as quando, nome_dele from area_sinastrias
        where organization_id = $1 and contact_id = $2 and pago_at is not null order by pago_at desc limit 3`,
      [organizationId, contactId],
    ),
  ]);
  return {
    nascimento: contato.rows[0]?.birthdate ?? null,
    foco: perfil.rows[0]?.foco ?? null,
    oQuePesa: perfil.rows[0]?.o_que_pesa ?? null,
    leituras: leituras.rows,
    mao: mao.rows[0] ?? null,
    quizzes: quizzes.rows,
    sinastrias: sinastrias.rows.map((s) => ({ quando: s.quando, nomeDele: s.nome_dele })),
  };
}

/** O bloco do turno. Falha de leitura NÃO derruba o turno: sem área no contexto, a conversa segue. */
export async function buildAreaDoClienteBlock(db: Queryable, organizationId: string, contactId: string): Promise<string> {
  try {
    return renderAreaDoContato(await areaDoContato(db, organizationId, contactId));
  } catch {
    return "";
  }
}
