/**
 * A RECUPERAÇÃO DE SILÊNCIO — o agente volta a chamar quem parou de responder.
 *
 * Irmã do resgate (`resgate-de-lead-sem-resposta.ts`), com o sinal trocado: lá a última mensagem é do
 * CLIENTE e quem deve é a casa; aqui a última mensagem é do AGENTE e quem sumiu foi o cliente. As duas
 * rodam no mesmo ritmo (o timer do reaper) e nunca pegam a mesma conversa.
 *
 * ─── O que ela faz ────────────────────────────────────────────────────────────────────────────────
 *   1. RÉGUA: com o agente configurado para isso (`followup.recovery`, na tela do agente), cada passo de
 *      silêncio vencido (padrão 3 min, 15 min, 3 h) acorda o agente UMA vez para retomar a conversa.
 *   2. ÚLTIMA JANELA: quando o cliente combinou um retorno para além das 24 horas de conversa livre do
 *      canal oficial, nas últimas horas antes de esse prazo acabar o agente manda uma mensagem que pede
 *      resposta. Respondeu, o prazo recomeça — e a régua também, porque a âncora é a mensagem do cliente.
 *
 * Ela não escreve a mensagem: enfileira um `followup_turn` com o MOTIVO, e o turno de sempre decide o
 * texto — ou decide não enviar. Guardrails, horário do canal e passagem para humano valem como em
 * qualquer retorno.
 *
 * ─── O que ela NÃO toca ───────────────────────────────────────────────────────────────────────────
 * Conversa fechada ou com dono humano, contato em atendimento humano ou bloqueado, canal arquivado ou
 * fora do ar, passagem para humano recente, contato dentro de um fluxo de follow-up (uma voz por vez),
 * turno em andamento, cliente calado há mais de 24 horas, silêncio que começou antes de o agente ser
 * publicado com a recuperação, e — para a régua — quem já tem retorno
 * combinado (essa pessoa disse quando quer ser procurada; cobrar antes é desrespeitar o combinado).
 */
import type pg from 'pg';

import { readCurrentServiceBoundary } from '@/lib/atendimento/fronteira-server';
import { capabilitiesOf } from '@/lib/channels/capabilities';
import type { ChannelProvider } from '@/lib/channels/types';
import { lerRecuperacao } from '@/lib/recuperacao/config';
import {
  FOLGA_DO_FECHAMENTO_MS,
  decidirManterJanela,
  decidirPasso,
  motivoDeManterJanela,
  motivoDoPasso,
  ofereceSaida,
} from '@/lib/recuperacao/decisao';

import { proximaAberturaDoFollowup } from '../../agent/janela-de-followup';
import { WINDOW_MS } from '../../guardrails/messaging-window';
import type { Logger } from '../../obs/logger';
import { enqueueJob } from '../../queue/queue';

/**
 * Quantas conversas a consulta traz. É TODAS as candidatas das últimas 24 h, na prática: quem decide
 * é `decidirChamada`, em código, e um corte aqui deixa de fora justamente as mais novas.
 *
 * ⚠️ Era 200, ordenado da mais antiga para a mais nova. Medido em produção em 10/10/2026: 581
 * candidatas, e as 200 mais antigas eram quase todas conversas que a régua não ia tocar — as que
 * tinham acabado de ficar em silêncio nunca chegavam a ser avaliadas.
 */
const LOTE = 5000;
/** O teto de chamadas por rodada (a rodada é por minuto): uma fila represada sai aos poucos. */
export const MAXIMO_DE_CHAMADAS_POR_RODADA = 40;
/** Depois do último passo mais esta folga, uma régua que nem começou não começa mais. */
const FOLGA_PARA_COMECAR_MS = 60 * 60_000;

interface Candidata {
  conversation_id: string;
  organization_id: string;
  contact_id: string;
  provider: string | null;
  timezone: string | null;
  followup: unknown;
  /**
   * Desde quando a recuperação está LIGADA neste agente: a publicação mais antiga da sequência de
   * versões com ela ligada. Republicar o roteiro não mexe nesta data.
   */
  published_at: string | null;
  anchor_message_id: string;
  last_inbound_at: string;
  last_outbound_at: string;
  feitas: number | null;
  ultima_em: string | null;
  silence_since: string | null;
  janela_enviada: boolean | null;
  retorno_em: string | null;
}

/**
 * As conversas em que o agente falou por último e a recuperação está ligada no agente publicado do
 * número. Toda a regra de "quem não se toca" mora aqui. Exportada para o invariante de banco.
 */
export const CONSULTA_DE_SILENCIOSAS = `
  select v.id as conversation_id, v.organization_id, v.contact_id,
         cs.provider, o.timezone, ag.followup, coalesce(lig.ligada_em, ag.published_at) as published_at,
         ui.id as anchor_message_id, ui.created_at as last_inbound_at, uo.created_at as last_outbound_at,
         t.feitas, t.ultima_em, t.silence_since, t.janela_enviada,
         r.retorno_em
  from conversations v
  join organizations o on o.id = v.organization_id
  join contacts c on c.id = v.contact_id and c.organization_id = v.organization_id
  join channel_sessions cs on cs.id = v.channel_session_id and cs.organization_id = v.organization_id
  join lateral (
    select pv.followup, pv.published_at, a.id as agent_id
    from ai_agents a
    join ai_agent_versions pv on pv.id = a.published_version_id
    where a.organization_id = v.organization_id and a.archived_at is null
      and pv.status = 'published' and pv.channel_session_id = v.channel_session_id
    order by a.priority desc, a.created_at asc
    limit 1) ag on true
  -- DESDE QUANDO a recuperação está ligada: a primeira publicação depois da última versão SEM ela.
  left join lateral (
    select min(x.published_at) as ligada_em
    from ai_agent_versions x
    where x.organization_id = v.organization_id and x.agent_id = ag.agent_id
      and x.published_at is not null and x.followup->'recovery'->>'enabled' = 'true'
      and x.published_at > coalesce((
        select max(y.published_at) from ai_agent_versions y
        where y.organization_id = v.organization_id and y.agent_id = ag.agent_id
          and y.published_at is not null
          and coalesce(y.followup->'recovery'->>'enabled', 'false') <> 'true'), '-infinity'::timestamptz)
  ) lig on true
  join lateral (
    select m.id, m.created_at from messages m
    where m.organization_id = v.organization_id and m.conversation_id = v.id and m.direction = 'inbound'
    order by m.created_at desc limit 1) ui on true
  join lateral (
    select m.created_at from messages m
    where m.organization_id = v.organization_id and m.conversation_id = v.id and m.direction = 'outbound'
    order by m.created_at desc limit 1) uo on true
  left join lateral (
    select (count(*) filter (where s.kind = 'step'))::int as feitas,
           max(s.created_at) filter (where s.kind = 'step') as ultima_em,
           min(s.silence_since) as silence_since,
           bool_or(s.kind = 'keep_window') as janela_enviada
    from silence_recovery_attempts s
    where s.conversation_id = v.id and s.anchor_message_id = ui.id) t on true
  left join lateral (
    select min(j.next_run_at) as retorno_em from cron_jobs j
    where j.organization_id = v.organization_id and j.contact_id = v.contact_id
      and j.kind = 'at' and j.job_kind = 'followup_turn' and j.enabled = true and j.next_run_at > now()) r on true
  where v.status = 'open'
    and v.assigned_to_user_id is null
    and v.last_inbound_at > now() - interval '24 hours'
    and ag.followup->'recovery'->>'enabled' = 'true'
    and uo.created_at > ui.created_at
    and coalesce(c.force_human, false) = false
    and coalesce(c.is_blocked, false) = false
    and to_jsonb(cs)->>'archived_at' is null
    and cs.status = 'WORKING'
    and (v.last_handoff_at is null or v.last_handoff_at < ui.created_at - interval '12 hours')
    and not exists (
      select 1 from job_queue q
      where q.organization_id = v.organization_id and q.contact_id = v.contact_id
        and q.status in ('pending', 'running'))
    and not exists (
      select 1 from followup_enrollments e
      where e.organization_id = v.organization_id and e.contact_id = v.contact_id
        and e.status in ('active', 'waiting_reply', 'paused_handoff'))
  order by ui.created_at
  limit ${LOTE}`;

/** O registro da chamada. Quem perde o índice único (outro worker chegou antes) não recebe linha. */
export const REGISTRO_DA_CHAMADA = `
  insert into silence_recovery_attempts
    (organization_id, conversation_id, contact_id, anchor_message_id, kind, step, silence_since)
  values ($1, $2, $3, $4, $5, $6, $7)
  on conflict (conversation_id, anchor_message_id, kind, step) do nothing
  returning id`;

export interface ResultadoDaRecuperacao {
  chamadas: number;
  janelas: number;
}

type Chamada =
  | { kind: 'step'; step: number; motivo: string; ofereceSaida: boolean }
  | { kind: 'keep_window'; step: 0; motivo: string };

/** O canal desta conversa limita a mensagem livre a 24 h depois da última mensagem do cliente? */
export function canalTemPrazo(provider: string | null): boolean {
  return provider !== null && !capabilitiesOf(provider as ChannelProvider).freeformOutsideWindow;
}

/**
 * O que fazer com uma conversa silenciosa, agora. Pura: é a regra inteira, sem banco. `temPrazo` é a
 * capacidade do canal já resolvida (`canalTemPrazo`) — a regra não pergunta qual canal é.
 */
export function decidirChamada(c: Candidata, agora: Date, temPrazo: boolean): Chamada | null {
  const r = lerRecuperacao(c.followup);
  if (r === null) return null;

  const fechaEm = new Date(new Date(c.last_inbound_at).getTime() + WINDOW_MS);
  const proximaAbertura = (instante: Date) => proximaAberturaDoFollowup(c.followup, c.timezone ?? 'UTC', instante);

  if (c.retorno_em !== null) {
    // Sem prazo de 24 h no canal não há o que manter aberto: o retorno combinado sai na data, e pronto.
    if (!temPrazo) return null;
    const retornoEm = new Date(c.retorno_em);
    const manter = decidirManterJanela(
      r,
      { fechaEm, retornoEm, jaEnviada: c.janela_enviada === true },
      agora,
      proximaAbertura,
    );
    return manter
      ? { kind: 'keep_window', step: 0, motivo: motivoDeManterJanela(retornoEm, fechaEm.getTime() - agora.getTime()) }
      : null;
  }

  if (temPrazo && agora.getTime() >= fechaEm.getTime() - FOLGA_DO_FECHAMENTO_MS) return null;
  if (proximaAbertura(agora) !== null) return null;
  const silencioDesde = new Date(c.silence_since ?? c.last_outbound_at);
  // A régua só começa em silêncio que nasceu DEPOIS de a recuperação ser LIGADA. Sem isto, ligar a
  // recuperação chamaria de uma vez todo mundo que já estava calado — medido em produção antes de ligar:
  // 122 conversas. Régua já iniciada segue até o fim.
  //
  // ⚠️ A data é a de quando a recuperação foi ligada, NÃO a da última publicação do agente. Até
  // 10/10/2026 era a da publicação, e cada vez que o roteiro era republicado (três vezes num dia) toda
  // conversa que estava em silêncio naquele instante saía da régua para sempre. Medido: 505 de 581
  // candidatas barradas por isso, e 190 pessoas que receberam o link de pagamento em três dias sem
  // nenhuma retomada.
  if ((c.feitas ?? 0) === 0 && c.published_at !== null && silencioDesde.getTime() < new Date(c.published_at).getTime()) {
    return null;
  }
  // Régua que não começou a tempo não começa atrasada: quem está calado há muito mais que o último
  // passo (worker parado, fila represada) não recebe a "primeira" chamada horas depois.
  const ultimoPassoMs = (r.steps_minutes.at(-1) ?? 0) * 60_000;
  if ((c.feitas ?? 0) === 0 && agora.getTime() - silencioDesde.getTime() > ultimoPassoMs + FOLGA_PARA_COMECAR_MS) {
    return null;
  }
  const passo = decidirPasso(
    r,
    { silencioDesde, feitas: c.feitas ?? 0, ultimaEm: c.ultima_em === null ? null : new Date(c.ultima_em) },
    agora,
  );
  if (passo === null) return null;
  const silencioMs = agora.getTime() - silencioDesde.getTime();
  return {
    kind: 'step',
    step: passo,
    motivo: motivoDoPasso(passo, r.steps_minutes.length, silencioMs),
    ofereceSaida: ofereceSaida(passo, r.steps_minutes.length, silencioMs),
  };
}

export async function recuperarSilenciosos(
  pool: pg.Pool,
  log: Logger,
  opcoes: { agora?: Date } = {},
): Promise<ResultadoDaRecuperacao> {
  const agora = opcoes.agora ?? new Date();
  const { rows } = await pool.query<Candidata>(CONSULTA_DE_SILENCIOSAS);
  const resultado: ResultadoDaRecuperacao = { chamadas: 0, janelas: 0 };

  // Decide tudo primeiro e atende do silêncio MAIS RECENTE para o mais antigo, até o teto da rodada:
  // quem acabou de se calar é quem mais tem chance de voltar, e o resto sai na rodada seguinte.
  const decididas = rows
    .map((c) => ({ c, chamada: decidirChamada(c, agora, canalTemPrazo(c.provider)) }))
    .filter((d): d is { c: Candidata; chamada: Chamada } => d.chamada !== null)
    .sort(
      (a, b) =>
        new Date(b.c.silence_since ?? b.c.last_outbound_at).getTime() -
        new Date(a.c.silence_since ?? a.c.last_outbound_at).getTime(),
    )
    .slice(0, MAXIMO_DE_CHAMADAS_POR_RODADA);

  for (const { c, chamada } of decididas) {

    // A fronteira do atendimento é o que o turno confere antes de falar: conversa encerrada no meio
    // do caminho vence a chamada sem enviar nada.
    const fronteira = await readCurrentServiceBoundary(pool, c.organization_id, c.conversation_id);
    if (fronteira === null) continue;

    const registro = await pool.query<{ id: string }>(REGISTRO_DA_CHAMADA, [
      c.organization_id,
      c.conversation_id,
      c.contact_id,
      c.anchor_message_id,
      chamada.kind,
      chamada.step,
      c.silence_since ?? c.last_outbound_at,
    ]);
    const registroId = registro.rows[0]?.id;
    if (registroId === undefined) continue;

    try {
      await enqueueJob(pool, c.organization_id, {
        leadId: c.contact_id,
        kind: 'followup_turn',
        // Chamada de recuperação que falha não insiste cinco vezes: o próximo passo é a nova tentativa.
        maxAttempts: 2,
        payload: {
          reason: chamada.motivo,
          conversation_id: c.conversation_id,
          service_boundary: {
            organization_id: fronteira.organization_id,
            contact_id: fronteira.contact_id,
            conversation_id: fronteira.conversation_id,
            service_revision: fronteira.service_revision,
            demanda_id: fronteira.demanda_id,
            demanda_revision: fronteira.demanda_revision,
          },
          recovery: {
            kind: chamada.kind,
            step: chamada.step,
            ...(chamada.kind === 'step' && chamada.ofereceSaida ? { offer_stop: true } : {}),
          },
        },
      });
    } catch (err) {
      // Sem job não houve chamada: o registro sai para o passo poder ser tentado no próximo minuto.
      await pool.query('delete from silence_recovery_attempts where id = $1', [registroId]);
      throw err;
    }

    if (chamada.kind === 'step') resultado.chamadas += 1;
    else resultado.janelas += 1;
    // Só ids e o passo: o texto da conversa não vai para o log.
    log.info('recuperação de silêncio — agente acordado', {
      conversation_id: c.conversation_id,
      kind: chamada.kind,
      step: chamada.step,
    });
  }
  return resultado;
}
