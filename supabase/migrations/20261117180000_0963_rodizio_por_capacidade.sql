-- 0963 — RODÍZIO POR CAPACIDADE E RITMO POR HORA
--
-- Três perguntas que o motor de envio não sabia responder (medido em 16/11/2026,
-- quando três números caíram no mesmo dia mandando 90–160 mensagens por hora):
--
-- 1. QUANTOS LEADS NOVOS este número aguenta hoje? `channel_knobs.lead_daily_caps`
--    guarda o orçamento em degraus por idade do número — a MESMA forma de
--    `warmup_daily_caps` (`[{"minAgeDays":0,"cap":15}, ...]`, `cap: null` = sem
--    teto). Nulo = sem orçamento: o rodízio divide por igual, como antes.
--
-- 2. QUANTAS MENSAGENS POR HORA, no máximo? `channel_knobs.max_per_hour`. Nulo =
--    sem teto por hora, como antes. Conta tudo o que sai do número — é a rajada
--    que derruba o número, venha de resposta ou de disparo.
--
-- 3. O ENVIO foi resposta a quem escreveu, ou mensagem que nós iniciamos?
--    `pacing_ledger.tipo`. O teto de aquecimento existe contra DISPARO: contar a
--    resposta nele fazia um dia movimentado de conversa calar o retorno e a
--    campanha do mesmo número. O teto diário absoluto
--    (`channel_sessions.daily_message_limit`) continua contando tudo.
--    Linha antiga fica 'iniciada' (o default): é a leitura conservadora — conta
--    contra o aquecimento, como sempre contou.
--
-- O índice novo em `conversations` serve à pergunta do rodízio, "quantas
-- conversas este número começou hoje", que hoje faria varredura da organização.

alter table public.channel_knobs
  add column if not exists lead_daily_caps jsonb,
  add column if not exists max_per_hour integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'channel_knobs_lead_caps_is_array') then
    alter table public.channel_knobs
      add constraint channel_knobs_lead_caps_is_array
      check (lead_daily_caps is null or jsonb_typeof(lead_daily_caps) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'channel_knobs_max_per_hour_faixa') then
    alter table public.channel_knobs
      add constraint channel_knobs_max_per_hour_faixa
      check (max_per_hour is null or max_per_hour between 1 and 10000);
  end if;
end $$;

comment on column public.channel_knobs.lead_daily_caps is
  'Orçamento de leads NOVOS por dia, em degraus por idade do número ([{"minAgeDays":0,"cap":15}], cap null = sem teto). Nulo = sem orçamento: o rodízio divide por igual (migration 0963).';
comment on column public.channel_knobs.max_per_hour is
  'Teto de mensagens enviadas por hora pelo número (resposta e disparo). Nulo = sem teto por hora (migration 0963).';

alter table public.pacing_ledger
  add column if not exists tipo text not null default 'iniciada';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pacing_ledger_tipo_check') then
    alter table public.pacing_ledger
      add constraint pacing_ledger_tipo_check check (tipo in ('iniciada', 'resposta'));
  end if;
end $$;

comment on column public.pacing_ledger.tipo is
  '''resposta'' = envio a quem acabou de escrever; ''iniciada'' = mensagem que o sistema iniciou. Só a iniciada conta contra o aquecimento (migration 0963).';

create index if not exists idx_conversations_sessao_criada
  on public.conversations (organization_id, channel_session_id, created_at desc);
