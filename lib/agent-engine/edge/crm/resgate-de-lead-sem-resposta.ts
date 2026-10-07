/**
 * O RESGATE DO LEAD SEM RESPOSTA — a rede embaixo de todas as outras.
 *
 * Um cliente escreve e fica sem resposta por causas que não têm nada em comum entre si. Só nos dias
 * 05–07/10/2026, medidas em produção: saldo do provedor de IA esgotado por 17 minutos; o modelo escreveu a
 * resposta e não acionou o envio; um deploy matou o turno no meio e o job ficou 10 minutos órfão com três
 * mensagens da pessoa presas atrás dele. Cada causa ganhou o seu conserto — e a próxima, que ninguém
 * previu, terá o mesmo sintoma. Esta rotina não pergunta a CAUSA: olha o SINTOMA.
 *
 * ─── O sintoma ────────────────────────────────────────────────────────────────────────────────────
 * A última mensagem da conversa é do cliente, tem mais de `ESPERA_MS`, e não há nenhum trabalho de
 * atendimento pendente nem em execução para aquele contato.
 *
 * ─── O que ela faz ────────────────────────────────────────────────────────────────────────────────
 *   1. UMA vez por mensagem, reemite o pedido de atendimento (`ai_agent.dispatch_requested`). O pedido
 *      entra pelo MESMO dreno de sempre: elegibilidade, "uma voz" com o follow-up, espera da transcrição,
 *      agrupamento de rajada e as guardas do turno. O resgate não decide se a IA deve falar — só garante
 *      que a pergunta seja feita de novo.
 *   2. Se, depois do resgate, a mensagem continuar sem resposta por mais `ESPERA_DO_AVISO_MS`, abre UM
 *      aviso na Central para uma pessoa assumir. Silêncio que a máquina não resolveu vira trabalho de gente.
 *
 * ─── O que ela NÃO toca ───────────────────────────────────────────────────────────────────────────
 * Conversa fechada, com dono humano, contato em atendimento humano (`force_human`) ou bloqueado, canal
 * arquivado ou fora do ar, passagem para humano recente (ali o silêncio da IA é o comportamento certo, e
 * já existe o aviso de handoff), reação e figurinha (não pedem resposta), e mensagem com mais de 23 horas
 * (fora da janela de resposta do canal oficial).
 */
import type pg from 'pg';

import { insertInboxItem } from '../../db/repository';
import type { Logger } from '../../obs/logger';

/** Quanto tempo a mensagem do cliente fica sem resposta antes de o resgate agir. */
export const ESPERA_MS = 5 * 60_000;
/** Quanto tempo depois do resgate, ainda sem resposta, vira aviso para uma pessoa. */
export const ESPERA_DO_AVISO_MS = 10 * 60_000;
/** Marca do pedido reemitido — é por ela que "uma vez por mensagem" é conferido. */
export const ORIGEM_DO_RESGATE = 'resgate_sem_resposta';
const LOTE = 25;

interface Candidata {
  mensagem_id: string;
  organization_id: string;
  conversation_id: string;
  contact_id: string;
  channel_session_id: string;
  minutos_sem_resposta: number;
  resgatada_em: string | null;
}

/**
 * As conversas com o sintoma. Uma consulta só, e toda a regra de "quem não se toca" mora nela.
 * `$1` = espera em ms. Exportada para o teste de invariante conferir as colunas no schema real.
 */
export const CONSULTA_DE_CANDIDATAS = `
  with ultima as (
    select distinct on (m.conversation_id)
           m.id, m.organization_id, m.conversation_id, m.contact_id, m.direction, m.type, m.created_at
    from messages m
    where m.created_at > now() - interval '23 hours'
    order by m.conversation_id, m.created_at desc
  )
  select u.id as mensagem_id, u.organization_id, u.conversation_id, u.contact_id,
         v.channel_session_id,
         floor(extract(epoch from (now() - u.created_at)) / 60)::int as minutos_sem_resposta,
         (select max(e.created_at) from event_log e
           where e.organization_id = u.organization_id
             and e.event_type = 'ai_agent.dispatch_requested'
             and e.entity_id = u.id
             and e.metadata->>'source' = '${ORIGEM_DO_RESGATE}') as resgatada_em
  from ultima u
  join conversations v on v.id = u.conversation_id and v.organization_id = u.organization_id
  join contacts c on c.id = u.contact_id and c.organization_id = u.organization_id
  join channel_sessions cs on cs.id = v.channel_session_id and cs.organization_id = u.organization_id
  where u.direction = 'inbound'
    and u.type not in ('reaction', 'sticker')
    and u.created_at < now() - ($1 * interval '1 millisecond')
    and v.status = 'open'
    and v.assigned_to_user_id is null
    and coalesce(c.force_human, false) = false
    and coalesce(c.is_blocked, false) = false
    and to_jsonb(cs)->>'archived_at' is null
    and cs.status = 'WORKING'
    and (v.last_handoff_at is null or v.last_handoff_at < u.created_at - interval '12 hours')
    and not exists (
      select 1 from job_queue j
      where j.organization_id = u.organization_id and j.contact_id = u.contact_id
        and j.status in ('pending', 'running'))
    and not exists (
      select 1 from event_log e
      where e.organization_id = u.organization_id
        and e.event_type = 'ai_agent.dispatch_requested'
        and e.entity_id = u.id
        and e.status in ('pending', 'processing'))
  order by u.created_at
  limit ${LOTE}`;

export interface ResultadoDoResgate {
  resgatadas: number;
  avisadas: number;
}

/** O que fazer com uma conversa que tem o sintoma. Pura — é a regra, sem banco. */
export function decidirResgate(
  c: Pick<Candidata, 'resgatada_em'>,
  agora: Date,
  esperaDoAvisoMs: number = ESPERA_DO_AVISO_MS,
): 'resgatar' | 'aguardar' | 'avisar' {
  if (c.resgatada_em === null) return 'resgatar';
  return agora.getTime() - new Date(c.resgatada_em).getTime() >= esperaDoAvisoMs ? 'avisar' : 'aguardar';
}

export async function resgatarLeadsSemResposta(
  pool: Pick<pg.Pool, 'query'>,
  log: Logger,
  opcoes: { agora?: Date; esperaMs?: number; esperaDoAvisoMs?: number } = {},
): Promise<ResultadoDoResgate> {
  const agora = opcoes.agora ?? new Date();
  const { rows } = await pool.query<Candidata>(CONSULTA_DE_CANDIDATAS, [opcoes.esperaMs ?? ESPERA_MS]);
  const resultado: ResultadoDoResgate = { resgatadas: 0, avisadas: 0 };

  for (const c of rows) {
    const decisao = decidirResgate(c, agora, opcoes.esperaDoAvisoMs);
    if (decisao === 'aguardar') continue;

    if (decisao === 'resgatar') {
      await pool.query(
        `select emit_event('ai_agent.dispatch_requested', 'message', $1::uuid, $2::jsonb, $3::jsonb, $4::uuid)`,
        [
          c.mensagem_id,
          JSON.stringify({
            organization_id: c.organization_id,
            conversation_id: c.conversation_id,
            contact_id: c.contact_id,
            channel_session_id: c.channel_session_id,
            inbound_message_id: c.mensagem_id,
          }),
          JSON.stringify({ source: ORIGEM_DO_RESGATE }),
          c.organization_id,
        ],
      );
      resultado.resgatadas += 1;
      // Só ids e o tempo: o texto da pessoa não vai para o log.
      log.warn('lead sem resposta — pedido de atendimento reemitido', {
        conversation_id: c.conversation_id,
        message_id: c.mensagem_id,
        minutos_sem_resposta: c.minutos_sem_resposta,
      });
      continue;
    }

    const aviso = await insertInboxItem(
      pool,
      c.organization_id,
      {
        kind: 'handoff',
        severity: 'critical',
        title: 'Cliente sem resposta — a IA não respondeu',
        body:
          `O cliente escreveu há ${c.minutos_sem_resposta} minutos e ficou sem resposta. O sistema pediu o ` +
          'atendimento de novo e, mesmo assim, nada saiu. Abra a conversa e responda, ou confira em ' +
          'Agente de IA › Execuções o que impediu a resposta.',
        refKind: 'conversation',
        refId: c.conversation_id,
      },
      'kind_ref_e_titulo',
    );
    if (aviso !== null) {
      resultado.avisadas += 1;
      log.error('lead sem resposta depois do resgate — aviso aberto na Central', {
        conversation_id: c.conversation_id,
        message_id: c.mensagem_id,
        minutos_sem_resposta: c.minutos_sem_resposta,
      });
    }
  }
  return resultado;
}
