/**
 * A OFERTA PROATIVA — o agente oferece, sozinho, o produto que cabe em quem já conversou com ele.
 *
 * Irmã da recuperação de silêncio (`recuperacao-por-silencio.ts`) e do mesmo timer do reaper, com outro
 * alcance: a recuperação retoma uma conversa que acabou de esfriar (minutos, horas); a oferta volta a quem
 * esfriou há mais tempo, uma vez por dia no máximo, com UMA oferta escolhida pela regra da organização
 * (`followup.oferta_proativa`, ver `lib/oferta-proativa/config.ts`).
 *
 * Ela não escreve a mensagem: enfileira um `followup_turn` com o MOTIVO, e o turno de sempre decide o texto —
 * ou decide não enviar. Guardrails, horário do canal e passagem para humano valem como em qualquer retorno.
 *
 * ─── Ritmo ────────────────────────────────────────────────────────────────────────────────────────────
 * UMA oferta por agente por rodada, e só se a última oferta da organização saiu há mais de `espaco_segundos`.
 * O ritmo nasce da própria fila, sem agendamento futuro: oferta enfileirada para daqui a uma hora sai numa
 * conversa que já mudou.
 *
 * ─── O que ela NÃO toca ───────────────────────────────────────────────────────────────────────────────
 * Conversa fechada ou com dono humano, contato bloqueado ou em atendimento humano, canal fora do ar ou
 * arquivado, contato dentro de um fluxo, turno em andamento, quem falou há menos de `quieto_ha_minutos`
 * (a conversa está viva e é do atendimento), quem pagou nas últimas 24 h, quem recebeu do agente a última
 * mensagem há menos de 6 h sem responder (insistir em cima de quem não respondeu é o passo antes do
 * bloqueio), e quem recebeu oferta proativa há menos de `horas_entre_ofertas`.
 */
import type pg from 'pg';

import { readCurrentServiceBoundary } from '@/lib/atendimento/fronteira-server';
import { lerOfertaProativa, type OfertaProativa } from '@/lib/oferta-proativa/config';
import { dentroDaFaixa, escolherOferta, motivoDaOferta, type PessoaParaOferta } from '@/lib/oferta-proativa/decisao';

import type { Logger } from '../../obs/logger';
import { enqueueJob } from '../../queue/queue';

/** Chave do payload do job: é por ela que o ritmo e a repetição são contados. */
export const CHAVE_DA_OFERTA = 'oferta_proativa';
/** Quantas pessoas a rodada avalia por agente, das que falaram mais recentemente. */
const LOTE = 300;
/** Quem recebeu do agente a última mensagem há menos que isto, e não respondeu, fica de fora. */
const SEM_RESPOSTA_HORAS = 6;

interface AgenteComOferta {
  organization_id: string;
  channel_session_id: string;
  timezone: string | null;
  followup: unknown;
}

export const CONSULTA_DE_AGENTES = `
  select a.organization_id, pv.channel_session_id, o.timezone, pv.followup
  from ai_agents a
  join ai_agent_versions pv on pv.id = a.published_version_id
  join organizations o on o.id = a.organization_id
  join channel_sessions cs on cs.id = pv.channel_session_id and cs.organization_id = a.organization_id
  where a.archived_at is null and pv.status = 'published'
    and pv.followup->'oferta_proativa'->>'enabled' = 'true'
    and cs.status = 'WORKING' and to_jsonb(cs)->>'archived_at' is null`;

/** O ritmo da organização: quando saiu a última oferta, e quantas saíram hoje no fuso dela. */
export const CONSULTA_DO_RITMO = `
  select max(q.created_at) as ultima_em,
         count(*) filter (where q.created_at >= (date_trunc('day', now() at time zone $2) at time zone $2))::int as hoje
  from job_queue q
  where q.organization_id = $1 and q.kind = 'followup_turn' and q.payload ? '${CHAVE_DA_OFERTA}'
    and q.created_at > now() - interval '2 days'`;

interface Candidata {
  conversation_id: string;
  contact_id: string;
  comprou: boolean;
  produtos: string[] | null;
  falas: string[] | null;
  saidas: { texto: string; em: string }[] | null;
  feitas: { id: string; em: string }[] | null;
}

/**
 * Quem pode receber oferta deste agente agora. Toda a regra de "quem não se toca" mora aqui; a de QUAL
 * oferta, em `escolherOferta`. Parâmetros: org, canal, dias de fala, minutos de quietude, horas entre ofertas.
 */
export const CONSULTA_DE_CANDIDATAS = `
  select v.id as conversation_id, v.contact_id,
         exists (select 1 from revenue_ledger l where l.organization_id = v.organization_id
                  and l.contact_id = v.contact_id and l.amount_cents > 0) as comprou,
         (select array_agg(coalesce(l.metadata->>'produto', '')) from revenue_ledger l
           where l.organization_id = v.organization_id and l.contact_id = v.contact_id and l.amount_cents > 0) as produtos,
         (select array_agg(x.t) from (
            select coalesce(m.body, m.media_derived_text, '') as t from messages m
             where m.organization_id = v.organization_id and m.contact_id = v.contact_id and m.direction = 'inbound'
               and m.created_at > now() - interval '30 days'
             order by m.created_at desc limit 40) x) as falas,
         (select jsonb_agg(jsonb_build_object('texto', x.t, 'em', x.em)) from (
            select coalesce(m.body, '') as t, m.created_at as em from messages m
             where m.organization_id = v.organization_id and m.contact_id = v.contact_id and m.direction = 'outbound'
               and m.created_at > now() - interval '30 days'
             order by m.created_at desc limit 80) x) as saidas,
         (select jsonb_agg(jsonb_build_object('id', q.payload->'${CHAVE_DA_OFERTA}'->>'id', 'em', q.created_at))
            from job_queue q where q.organization_id = v.organization_id and q.contact_id = v.contact_id
             and q.payload ? '${CHAVE_DA_OFERTA}' and q.created_at > now() - interval '90 days') as feitas
  from conversations v
  join contacts c on c.id = v.contact_id and c.organization_id = v.organization_id
  where v.organization_id = $1 and v.channel_session_id = $2
    and v.status in ('open', 'ai_handling', 'pending')
    and v.assigned_to_user_id is null
    and v.last_inbound_at > now() - make_interval(days => $3::int)
    and v.last_inbound_at < now() - make_interval(mins => $4::int)
    and coalesce(c.force_human, false) = false
    and coalesce(c.is_blocked, false) = false
    and (v.last_handoff_at is null or v.last_handoff_at < now() - interval '24 hours')
    and not exists (select 1 from job_queue q where q.organization_id = v.organization_id and q.contact_id = v.contact_id
                     and q.status in ('pending', 'running'))
    and not exists (select 1 from job_queue q where q.organization_id = v.organization_id and q.contact_id = v.contact_id
                     and q.payload ? '${CHAVE_DA_OFERTA}' and q.created_at > now() - make_interval(hours => $5::int))
    and not exists (select 1 from followup_enrollments e where e.organization_id = v.organization_id
                     and e.contact_id = v.contact_id and e.status in ('active', 'waiting_reply', 'paused_handoff'))
    and not exists (select 1 from revenue_ledger l where l.organization_id = v.organization_id
                     and l.contact_id = v.contact_id and l.created_at > now() - interval '24 hours')
    and not exists (select 1 from messages m where m.organization_id = v.organization_id and m.conversation_id = v.id
                     and m.direction = 'outbound' and m.created_at > greatest(v.last_inbound_at, now() - interval '${SEM_RESPOSTA_HORAS} hours'))
  order by v.last_inbound_at desc
  limit ${LOTE}`;

export interface ResultadoDaOferta {
  ofertas: number;
}

/** A pessoa, como a regra pura a lê. */
export function pessoaDaCandidata(c: Candidata): PessoaParaOferta {
  return {
    comprou: c.comprou,
    produtosComprados: (c.produtos ?? []).filter((p) => p !== ''),
    falas: (c.falas ?? []).filter((f) => f.trim() !== ''),
    saidas: (c.saidas ?? []).map((s) => ({ texto: s.texto, em: new Date(s.em) })),
    ofertasFeitas: (c.feitas ?? []).filter((f) => typeof f.id === 'string').map((f) => ({ id: f.id, em: new Date(f.em) })),
  };
}

/** Pode sair uma oferta deste agente nesta rodada? Ritmo e teto do dia. */
export function ritmoPermite(
  cfg: Pick<OfertaProativa, 'espaco_segundos' | 'maximo_por_dia'>,
  ritmo: { ultima_em: string | null; hoje: number },
  agora: Date,
): boolean {
  if (ritmo.hoje >= cfg.maximo_por_dia) return false;
  if (ritmo.ultima_em === null) return true;
  return agora.getTime() - new Date(ritmo.ultima_em).getTime() >= cfg.espaco_segundos * 1000;
}

export async function oferecerAQuemCabe(
  pool: pg.Pool,
  log: Logger,
  opcoes: { agora?: Date } = {},
): Promise<ResultadoDaOferta> {
  const agora = opcoes.agora ?? new Date();
  const resultado: ResultadoDaOferta = { ofertas: 0 };
  const { rows: agentes } = await pool.query<AgenteComOferta>(CONSULTA_DE_AGENTES);

  for (const ag of agentes) {
    const cfg = lerOfertaProativa(ag.followup);
    if (cfg === null || !dentroDaFaixa(cfg, agora, ag.timezone)) continue;
    const ritmo = await pool.query<{ ultima_em: string | null; hoje: number }>(CONSULTA_DO_RITMO, [
      ag.organization_id,
      ag.timezone ?? 'UTC',
    ]);
    if (!ritmoPermite(cfg, ritmo.rows[0] ?? { ultima_em: null, hoje: 0 }, agora)) continue;

    const { rows } = await pool.query<Candidata>(CONSULTA_DE_CANDIDATAS, [
      ag.organization_id,
      ag.channel_session_id,
      cfg.falou_nos_ultimos_dias,
      cfg.quieto_ha_minutos,
      cfg.horas_entre_ofertas,
    ]);

    for (const c of rows) {
      const escolha = escolherOferta(pessoaDaCandidata(c), cfg, agora);
      if (escolha.oferta === null) continue;
      const fronteira = await readCurrentServiceBoundary(pool, ag.organization_id, c.conversation_id);
      if (fronteira === null) continue;
      await enqueueJob(pool, ag.organization_id, {
        leadId: c.contact_id,
        kind: 'followup_turn',
        // Oferta que falha não insiste: amanhã a regra decide de novo.
        maxAttempts: 2,
        payload: {
          reason: motivoDaOferta(escolha.oferta),
          conversation_id: c.conversation_id,
          service_boundary: {
            organization_id: fronteira.organization_id,
            contact_id: fronteira.contact_id,
            conversation_id: fronteira.conversation_id,
            service_revision: fronteira.service_revision,
            demanda_id: fronteira.demanda_id,
            demanda_revision: fronteira.demanda_revision,
          },
          [CHAVE_DA_OFERTA]: { id: escolha.oferta.id },
        },
      });
      resultado.ofertas += 1;
      // Só ids: o texto da conversa não vai para o log.
      log.info('oferta proativa — agente acordado', { conversation_id: c.conversation_id, oferta: escolha.oferta.id });
      break; // uma por agente por rodada: o ritmo é o espaço entre rodadas
    }
  }
  return resultado;
}
