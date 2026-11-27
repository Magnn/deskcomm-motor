/**
 * O PAINEL "ESCALAR": como a organização está hoje e o que a meta de receita pede.
 *
 * Junta, numa leitura só, o que o painel `/app/escalar` e o relatório do dia mostram:
 *   - a meta em cascata e o ritmo (`lib/venda/meta-de-receita.ts`);
 *   - o funil do mês (contatos novos → compradoras → receita), o do mês passado e a projeção;
 *   - as faixas de valor e a recompra dos últimos 30 dias;
 *   - os números (contatos e receita de 30 dias por número) — base da conta de capacidade;
 *   - o gasto com anúncio do mês (quando quem pede pode ver) e as assinaturas ativas da área.
 *
 * Receita = cobranças do pagamento sem estorno (`lerVendasDoPagamento`) + comandas fechadas, a
 * mesma régua do Dashboard.
 */
import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

import { diaLocalISO, instanteDe, partesNoFuso } from "@/lib/agenda/fuso";
import { lerGastoDeAnuncios } from "@/lib/plataformas-de-anuncio/meta/gasto-do-periodo";
import { lerFusoDaOrganizacao } from "@/lib/resultado/periodo";
import { lerVendasDoPagamento } from "@/lib/resultado/vendas-do-pagamento";

import {
  diasEntre,
  lerMetas,
  metaDoDia,
  pesosPorDiaDaSemana,
  planoDaMeta,
  somarDias,
  type FunilDoMes,
  type Metas,
  type PlanoDaMeta,
} from "./meta-de-receita";

export interface NumeroDoPainel {
  id: string;
  nome: string | null;
  telefone: string | null;
  status: string | null;
  contatos30d: number;
  receita30d: number;
}

export interface PainelDeEscala {
  hoje: string;
  fuso: string;
  diasCorridos: number;
  diasDoMes: number;
  metas: Metas | null;
  plano: PlanoDaMeta | null;
  /** Peso de cada dia da semana (domingo = 0) usado na cascata. */
  pesos: number[];
  funil: { mes: FunilDoMes; mesPassado: FunilDoMes };
  faixas: { faixa: string; vendas: number; receita: number }[];
  recompra: { compradoras: number; recompraram: number; maiorGasto: number };
  numeros: NumeroDoPainel[];
  anuncios: { estado: string; gastoDoMes: number | null };
  assinaturasAtivas: number;
  /** Receita por dia dos últimos 60 dias, com a meta do dia quando há meta. */
  porDia: { dia: string; receita: number; meta: number | null }[];
}

interface Venda {
  contato: string | null;
  conversa: string | null;
  centavos: number;
  dia: string;
}

const FAIXAS: [string, number][] = [
  ["até R$ 19", 2000],
  ["R$ 20–49", 5000],
  ["R$ 50–99", 10000],
  ["R$ 100–199", 20000],
  ["R$ 200–499", 50000],
  ["R$ 500+", Number.POSITIVE_INFINITY],
];

export function faixasDeValor(vendas: readonly { centavos: number }[]): PainelDeEscala["faixas"] {
  return FAIXAS.map(([faixa, teto], i) => {
    const piso = i === 0 ? 0 : (FAIXAS[i - 1]?.[1] ?? 0);
    const dela = vendas.filter((v) => v.centavos >= piso && v.centavos < teto);
    return { faixa, vendas: dela.length, receita: dela.reduce((s, v) => s + v.centavos, 0) };
  });
}

function funilDe(vendas: readonly Venda[], contatos: number): FunilDoMes {
  return {
    contatos,
    compradoras: new Set(vendas.map((v) => v.contato).filter((c): c is string => c !== null)).size,
    receita: vendas.reduce((s, v) => s + v.centavos, 0),
  };
}

export async function lerPainelDeEscala(
  admin: SupabaseClient,
  pool: pg.Pool,
  orgId: string,
  opcoes: { agora?: Date; podeVerGasto: boolean },
): Promise<PainelDeEscala> {
  const agora = opcoes.agora ?? new Date();
  const fuso = await lerFusoDaOrganizacao(admin, orgId);
  const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const metas = lerMetas((org as { settings?: unknown } | null)?.settings);

  const p = partesNoFuso(agora, fuso);
  const hoje = diaLocalISO(agora, fuso);
  const diasDoMes = new Date(Date.UTC(p.ano, p.mes, 0)).getUTCDate();
  const inicioDoMes = instanteDe({ ano: p.ano, mes: p.mes, dia: 1, hora: 0, minuto: 0 }, fuso);
  const mesPassado = p.mes === 1 ? { ano: p.ano - 1, mes: 12 } : { ano: p.ano, mes: p.mes - 1 };
  const inicioDoMesPassado = instanteDe({ ...mesPassado, dia: 1, hora: 0, minuto: 0 }, fuso);
  const triMes = Math.floor((p.mes - 1) / 3) * 3 + 1;
  const inicioDoTri = instanteDe({ ano: p.ano, mes: triMes, dia: 1, hora: 0, minuto: 0 }, fuso);
  // Histórico: o trimestre, o mês passado e 8 semanas para os pesos — o que vier antes.
  const desde = new Date(Math.min(inicioDoTri.getTime(), inicioDoMesPassado.getTime(), agora.getTime() - 63 * 86_400_000));

  const [doPagamento, comandas] = await Promise.all([
    lerVendasDoPagamento(admin, orgId, desde, agora),
    admin
      .from("sales")
      .select("contact_id, total_cents, created_at")
      .eq("organization_id", orgId)
      .eq("status", "finalized")
      .gte("created_at", desde.toISOString())
      .lte("created_at", agora.toISOString()),
  ]);
  if (comandas.error) throw new Error(`painel de escala: comandas: ${comandas.error.message}`);
  const vendas: Venda[] = [
    ...doPagamento.map((v) => ({ contato: v.contact_id, conversa: v.conversation_id ?? null, centavos: v.total_cents, dia: diaLocalISO(new Date(v.created_at), fuso) })),
    ...((comandas.data ?? []) as { contact_id: string | null; total_cents: number; created_at: string }[]).map((s) => ({
      contato: s.contact_id,
      conversa: null,
      centavos: Number(s.total_cents) || 0,
      dia: diaLocalISO(new Date(s.created_at), fuso),
    })),
  ].filter((v) => v.centavos > 0);

  const receitaPorDia = new Map<string, number>();
  for (const v of vendas) receitaPorDia.set(v.dia, (receitaPorDia.get(v.dia) ?? 0) + v.centavos);

  // Pesos: as 8 semanas COMPLETAS antes de hoje.
  const pesos = pesosPorDiaDaSemana(receitaPorDia, diasEntre(somarDias(hoje, -56), somarDias(hoje, -1)));
  const fracaoDoDia = (p.hora * 60 + p.minuto) / 1440;
  const plano = metas ? planoDaMeta({ metas, hoje, fracaoDoDia, receitaPorDia, pesos }) : null;

  const diaDoMes = diaLocalISO(inicioDoMes, fuso);
  const diaDoMesPassado = diaLocalISO(inicioDoMesPassado, fuso);
  const ha30 = somarDias(hoje, -29);
  const doMes = vendas.filter((v) => v.dia >= diaDoMes);
  const doMesPassado = vendas.filter((v) => v.dia >= diaDoMesPassado && v.dia < diaDoMes);
  const de30 = vendas.filter((v) => v.dia >= ha30);

  const [contatos, numeros, conversasDasVendas, assinaturas, gasto] = await Promise.all([
    pool.query<{ mes: string; passado: string }>(
      `select count(*) filter (where created_at >= $2) as mes,
              count(*) filter (where created_at >= $3 and created_at < $2) as passado
         from contacts where organization_id = $1 and created_at >= $3`,
      [orgId, inicioDoMes.toISOString(), inicioDoMesPassado.toISOString()],
    ),
    pool.query<{ id: string; nome: string | null; telefone: string | null; status: string | null; contatos: string }>(
      `select cs.id, cs.display_name as nome, cs.phone_number as telefone, cs.status,
              count(distinct c.contact_id) as contatos
         from channel_sessions cs
         left join conversations c
           on c.channel_session_id = cs.id and c.organization_id = $1 and c.created_at >= now() - interval '30 days'
        where cs.organization_id = $1 and cs.archived_at is null
        group by cs.id order by contatos desc`,
      [orgId],
    ),
    // De que número veio cada venda: a conversa da cobrança; sem ela, a conversa mais recente do contato.
    pool.query<{ id: string; contact_id: string | null; channel_session_id: string | null }>(
      `select id, contact_id, channel_session_id
         from conversations
        where organization_id = $1 and (id = any($2::uuid[]) or contact_id = any($3::uuid[]))
        order by created_at desc`,
      [
        orgId,
        de30.map((v) => v.conversa).filter((c): c is string => c !== null),
        de30.map((v) => v.contato).filter((c): c is string => c !== null),
      ],
    ),
    admin
      .from("area_assinaturas")
      .select("contact_id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gt("valido_ate", agora.toISOString()),
    opcoes.podeVerGasto ? lerGastoDeAnuncios(admin, orgId, inicioDoMes, agora, fuso).catch(() => ({ estado: "indisponivel" as const })) : null,
  ]);

  const canalDaConversa = new Map<string, string | null>();
  const canalDoContato = new Map<string, string | null>();
  for (const c of conversasDasVendas.rows) {
    canalDaConversa.set(c.id, c.channel_session_id);
    if (c.contact_id && !canalDoContato.has(c.contact_id)) canalDoContato.set(c.contact_id, c.channel_session_id);
  }
  const receitaDoNumero = new Map<string, number>();
  for (const v of de30) {
    const canal = (v.conversa ? canalDaConversa.get(v.conversa) : null) ?? (v.contato ? canalDoContato.get(v.contato) : null);
    if (canal) receitaDoNumero.set(canal, (receitaDoNumero.get(canal) ?? 0) + v.centavos);
  }

  const porContato = new Map<string, number[]>();
  for (const v of de30) if (v.contato) porContato.set(v.contato, [...(porContato.get(v.contato) ?? []), v.centavos]);
  const gastos = [...porContato.values()].map((l) => l.reduce((a, b) => a + b, 0));

  const linhaContatos = contatos.rows[0] ?? { mes: "0", passado: "0" };
  return {
    hoje,
    fuso,
    diasCorridos: p.dia,
    diasDoMes,
    metas,
    plano,
    pesos,
    funil: { mes: funilDe(doMes, Number(linhaContatos.mes)), mesPassado: funilDe(doMesPassado, Number(linhaContatos.passado)) },
    faixas: faixasDeValor(de30),
    recompra: {
      compradoras: porContato.size,
      recompraram: [...porContato.values()].filter((l) => l.length > 1).length,
      maiorGasto: gastos.length > 0 ? Math.max(...gastos) : 0,
    },
    numeros: numeros.rows.map((n) => ({
      id: n.id,
      nome: n.nome,
      telefone: n.telefone,
      status: n.status,
      contatos30d: Number(n.contatos),
      receita30d: receitaDoNumero.get(n.id) ?? 0,
    })),
    anuncios:
      gasto === null
        ? { estado: "restrito", gastoDoMes: null }
        : { estado: gasto.estado, gastoDoMes: gasto.estado === "ok" ? gasto.centavos : null },
    assinaturasAtivas: assinaturas.count ?? 0,
    porDia: diasEntre(somarDias(hoje, -59), hoje).map((dia) => ({
      dia,
      receita: receitaPorDia.get(dia) ?? 0,
      meta: metas && plano ? Math.round(metaDoDia(dia, metas.receita_mensal_cents, pesos)) : null,
    })),
  };
}
