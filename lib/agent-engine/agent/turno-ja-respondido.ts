/**
 * A MESMA mensagem do cliente não recebe duas respostas do agente.
 *
 * ## O defeito (medido em produção, 2026-09-24)
 *
 * Turnos do mesmo contato são serializados (`uniq_job_queue_one_running_per_contact`)
 * e cada um leva 70–90 s. O cliente escreveu "Sim" (14:02:39) e o job A ficou na
 * fila atrás do turno anterior, só começando às 14:04:07. Às 14:04:04 o cliente
 * mandou "365,00 2x na semana": A leu a conversa inteira e respondeu ao 365
 * (14:04:26). O "365" tinha ganhado o PRÓPRIO job B — a coalescência do drain só
 * pega carona em job *pendente*, e A já estava *rodando*; o anti-backlog do drain
 * passou, porque o 365 era de fato a inbound mais nova. B rodou às 14:05:21,
 * respondeu à mensagem pinada no payload sem perguntar se alguém já tinha
 * respondido, e o cliente recebeu duas vezes "Perfeito… Com um plano de R$365…".
 *
 * ## A régua, e por que não é "tem outbound depois da inbound"
 *
 * "Existe resposta depois da última mensagem do cliente" cala o turno errado: um
 * turno que LEU a conversa antes de a mensagem chegar e ENVIOU depois deixa uma
 * outbound posterior a uma mensagem que ele nunca viu. Calar o turno dela seria
 * trocar a resposta dupla por silêncio — pior.
 *
 * A pergunta certa é "algum turno que VIU a última mensagem do cliente já
 * respondeu?". Para isso cada turno anota no próprio job, ANTES de ler a conversa,
 * o `created_at` da inbound mais nova já gravada (`ultima_inbound_vista_em`). Tudo o
 * que aquele `select` enxerga está commitado, então a leitura do contexto que vem
 * DEPOIS enxerga também — a anotação nunca promete mais do que o turno viu.
 *
 * "Respondeu" é `send_ledger` com envio aceito ou enfileirado pelo WhatsApp:
 * turno que viu a mensagem e decidiu não enviar (veto, handoff, erro) não conta,
 * e o turno seguinte responde normalmente. Só `inbound_turn` entra na régua —
 * follow-up de retomada não é resposta à pergunta do cliente.
 */
import type pg from 'pg';

type Queryable = Pick<pg.Pool, 'query'>;

export interface AlvoDoTurno {
  organizationId: string;
  contactId: string;
  conversationId: string;
  jobId: string;
}

/**
 * Anota no job a inbound mais nova visível AGORA — chamar antes de o turno ler
 * a conversa. Um statement: o `||` do jsonb não pisa em chave alheia do payload
 * (`held_run_after` do session-watchdog, por exemplo).
 */
export async function anotarUltimaInboundVista(db: Queryable, alvo: AlvoDoTurno): Promise<void> {
  await db.query(
    `update job_queue
        set payload = payload || jsonb_build_object(
          'ultima_inbound_vista_em',
          (select max(m.created_at) from messages m
            where m.organization_id = $1 and m.conversation_id = $2 and m.direction = 'inbound'))
      where organization_id = $1 and id = $3`,
    [alvo.organizationId, alvo.conversationId, alvo.jobId],
  );
}

/**
 * `true` quando OUTRO turno de resposta deste contato, nesta conversa, viu a
 * inbound mais nova do cliente e enviou resposta. Sem inbound na conversa, `false`.
 */
export async function ultimaInboundJaRespondida(
  db: Queryable,
  alvo: AlvoDoTurno,
): Promise<boolean> {
  const { rows } = await db.query<{ respondida: boolean }>(
    `with ultima as (
       select max(created_at) as em from messages
        where organization_id = $1 and conversation_id = $2 and direction = 'inbound'
     )
     select exists (
       select 1
         from send_ledger s
         join job_queue j on j.id = s.job_id and j.organization_id = s.organization_id
         join messages o on o.id = s.crm_message_id and o.organization_id = s.organization_id
         cross join ultima u
        where s.organization_id = $1
          and s.contact_id = $3
          and s.job_id <> $4
          and s.status in ('accepted', 'queued')
          and j.kind = 'inbound_turn'
          and o.conversation_id = $2
          and u.em is not null
          and (j.payload->>'ultima_inbound_vista_em')::timestamptz >= u.em
     ) as respondida`,
    [alvo.organizationId, alvo.conversationId, alvo.contactId, alvo.jobId],
  );
  return rows[0]?.respondida === true;
}

/**
 * O OUTRO LADO DA MESMA REGRA: o turno que NÃO viu a mensagem mais nova não responde por cima dela.
 *
 * ## O defeito (medido em produção, 2026-10-11)
 *
 * Uma cliente que tinha acabado de pagar escreveu "Minha filha tem rinite e temos um gato" e, 40 s
 * depois, "Tem rinite e alergia". O turno A já estava rodando quando a segunda chegou: respondeu só
 * à primeira e perguntou do lugar para a vela. O turno B, da segunda mensagem, rodou em seguida com a
 * conversa inteira e respondeu de novo — as duas respostas diziam a mesma coisa e repetiam a mesma
 * pergunta. Na mesma conversa a agente perguntou três vezes se havia criança ou alergia em casa.
 *
 * A régua acima (`ultimaInboundJaRespondida`) não pega este caso de propósito: A não viu a mensagem
 * de B, então B tem de responder. Quem está sobrando é A.
 *
 * ## A régua
 *
 * Na hora do PRIMEIRO envio do turno: chegou inbound mais nova do que a que este turno anotou
 * (`ultima_inbound_vista_em`) E existe outro `inbound_turn` deste contato esperando a vez? Então este
 * turno não envia — o que está na fila lê as duas mensagens e responde uma vez só.
 *
 * As duas condições juntas, sempre. Sem turno na fila, calar este seria trocar a resposta dobrada
 * por silêncio; por isso tarefa retida (`run_after` distante) não conta como "esperando a vez".
 * Turno que já enviou um balão não é interrompido: meia resposta é pior que resposta repetida.
 */
export async function turnoSuperadoPorMensagemNova(db: Queryable, alvo: AlvoDoTurno): Promise<boolean> {
  const { rows } = await db.query<{ superado: boolean }>(
    `select (
         (select max(m.created_at) from messages m
           where m.organization_id = $1 and m.conversation_id = $2 and m.direction = 'inbound')
           > (j.payload->>'ultima_inbound_vista_em')::timestamptz
         and exists (
           select 1 from job_queue f
            where f.organization_id = $1 and f.contact_id = $3 and f.id <> $4
              and f.kind = 'inbound_turn' and f.status = 'pending'
              and f.run_after < now() + interval '2 minutes')
       ) as superado
       from job_queue j
      where j.organization_id = $1 and j.id = $4`,
    [alvo.organizationId, alvo.conversationId, alvo.contactId, alvo.jobId],
  );
  return rows[0]?.superado === true;
}
