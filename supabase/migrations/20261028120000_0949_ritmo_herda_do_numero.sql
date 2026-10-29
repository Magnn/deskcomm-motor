-- 0949 · O RITMO DE ENVIO É DO NÚMERO, NÃO DA CONEXÃO: reconectar o mesmo telefone herda o que ele já tinha.
--
-- Medido em produção em 28/10/2026: a empresa reconectou o MESMO número (556981087336) e a reconexão
-- criou uma linha nova em `channel_sessions` (a antiga foi arquivada). `channel_knobs` é por conexão, então
-- a conexão nova nasceu SEM linha — e sem linha o motor usa os padrões: janela 7h–22h e o aquecimento de
-- número recém-criado (20 envios automáticos por dia). O número tinha 25 dias, o dono tinha pulado o
-- aquecimento e aberto a janela 0–24h. Resultado em 48h: 379 retornos vetados por `warmup_cap` — cartas
-- prometidas ("vou abrir a primeira carta") que não saíram, recuperações de silêncio paradas, 224 retornos
-- represados. A resposta à mensagem do cliente passava (e contava no teto), então o teto enchia cedo e todo
-- retorno do resto do dia esperava o dia seguinte.
--
-- Mesma classe do 20/10 (número novo sem knobs herdava 7h–22h), que foi consertada no DADO e voltou na
-- próxima reconexão. Aqui o conserto é no lugar por onde TODO caminho passa: o telefone entrando numa
-- conexão (WAHA, oficial, parceiro, pareamento por código — todos gravam `channel_sessions.phone_number`).
--
-- Regra: quando uma conexão ganha um telefone e ainda não tem ritmo próprio, ela copia o ritmo da conexão
-- mais recente da MESMA organização com o MESMO telefone, e a idade do número é a mais antiga entre elas
-- (a idade é do chip, não da conexão). Conexão que já tem linha não é tocada: o que o operador salvou vale.
-- Telefone nunca visto na organização: nada é copiado, e o número nasce no aquecimento — como hoje.
--
-- Retroativo: a mesma cópia para toda conexão que já tem telefone e nenhuma linha, se houver irmã com linha.

set lock_timeout = '5s';

create or replace function public.fn_ritmo_herda_do_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone_number is null or new.phone_number = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.phone_number is not distinct from old.phone_number then
    return new;
  end if;

  insert into channel_knobs (
    organization_id, channel_session_id, throttle_ms, jitter_max_ms, window_start_hour, window_end_hour,
    allow_sunday, timezone, warmup_daily_caps, spinning_knobs, health_knobs, number_activated_at
  )
  select k.organization_id, new.id, k.throttle_ms, k.jitter_max_ms, k.window_start_hour, k.window_end_hour,
         k.allow_sunday, k.timezone, k.warmup_daily_caps, k.spinning_knobs, k.health_knobs,
         (select min(k2.number_activated_at)
            from channel_knobs k2
            join channel_sessions s2 on s2.id = k2.channel_session_id
           where s2.organization_id = new.organization_id
             and s2.phone_number = new.phone_number
             and s2.id <> new.id)
    from channel_knobs k
    join channel_sessions s on s.id = k.channel_session_id
   where s.organization_id = new.organization_id
     and s.phone_number = new.phone_number
     and s.id <> new.id
   order by k.updated_at desc
   limit 1
  on conflict (organization_id, channel_session_id) do nothing;

  return new;
end;
$$;

revoke all on function public.fn_ritmo_herda_do_numero() from public, anon, authenticated;

drop trigger if exists trg_ritmo_herda_do_numero on public.channel_sessions;
create trigger trg_ritmo_herda_do_numero
  after insert or update of phone_number on public.channel_sessions
  for each row execute function public.fn_ritmo_herda_do_numero();

insert into channel_knobs (
  organization_id, channel_session_id, throttle_ms, jitter_max_ms, window_start_hour, window_end_hour,
  allow_sunday, timezone, warmup_daily_caps, spinning_knobs, health_knobs, number_activated_at
)
select distinct on (novo.id)
       novo.organization_id, novo.id, k.throttle_ms, k.jitter_max_ms, k.window_start_hour, k.window_end_hour,
       k.allow_sunday, k.timezone, k.warmup_daily_caps, k.spinning_knobs, k.health_knobs,
       min(k.number_activated_at) over (partition by novo.id)
  from channel_sessions novo
  join channel_sessions irma
    on irma.organization_id = novo.organization_id and irma.phone_number = novo.phone_number and irma.id <> novo.id
  join channel_knobs k on k.channel_session_id = irma.id
 where novo.phone_number is not null and novo.phone_number <> ''
   and not exists (select 1 from channel_knobs ja where ja.channel_session_id = novo.id)
 order by novo.id, k.updated_at desc
on conflict (organization_id, channel_session_id) do nothing;
