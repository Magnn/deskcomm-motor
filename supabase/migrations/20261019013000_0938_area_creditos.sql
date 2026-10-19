-- 0938 — OS CRÉDITOS da área do cliente (a carteira).
--
-- Pedido do dono em 18/10/2026: um saldo só para tudo o que a pessoa compra na área. Ela compra um pacote de
-- créditos uma vez (Pix ou cartão) e usa em cada leitura com um toque, sem pagar de novo a cada vez; o Círculo
-- passa a dar créditos todo mês.
--
-- `area_creditos`: o EXTRATO, uma linha por movimento (entrada > 0, saída < 0). O saldo é SEMPRE a soma — não
-- há coluna de saldo para divergir do extrato. `referencia` é única por organização: o mesmo pagamento (ou a
-- mesma leitura) nunca credita nem debita duas vezes.
--
-- `fn_area_creditos_mover`: o ÚNICO caminho de escrita. Trava a carteira da pessoa (advisory lock da
-- transação), recusa saída maior que o saldo e devolve `aplicado`, `repetido` ou `sem_saldo`. Dois toques ao
-- mesmo tempo não gastam o mesmo crédito duas vezes. Só o `service_role` executa.
--
-- `area_eventos.tipo` ganha `creditos_checkout` e `creditos_pagos` (o CHECK só acrescenta).
--
-- Aditiva e idempotente.

create table if not exists public.area_creditos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  delta integer not null check (delta <> 0 and delta between -100000 and 100000),
  motivo text not null check (motivo in ('pacote', 'circulo', 'leitura', 'devolucao', 'ajuste')),
  referencia text not null check (char_length(referencia) between 1 and 200),
  created_at timestamptz not null default clock_timestamp(),
  constraint area_creditos_referencia_unica unique (organization_id, referencia)
);
create index if not exists area_creditos_contato_idx
  on public.area_creditos (organization_id, contact_id, created_at desc);

comment on table public.area_creditos is
  'Extrato dos créditos da área do cliente (migration 0938): uma linha por movimento; o saldo é a soma de delta (não há coluna de saldo). Escrita só por fn_area_creditos_mover; referencia única por organização (idempotência).';

alter table public.area_creditos enable row level security;
revoke all on public.area_creditos from anon, authenticated;

create or replace function public.fn_area_creditos_mover(
  p_org uuid,
  p_contact uuid,
  p_delta integer,
  p_motivo text,
  p_referencia text
) returns table (resultado text, saldo integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_contact::text || ':area_creditos', 0));
  select coalesce(sum(c.delta), 0)::integer into v_atual
    from public.area_creditos c
   where c.organization_id = p_org and c.contact_id = p_contact;
  if exists (select 1 from public.area_creditos c where c.organization_id = p_org and c.referencia = p_referencia) then
    return query select 'repetido'::text, v_atual;
    return;
  end if;
  if v_atual + p_delta < 0 then
    return query select 'sem_saldo'::text, v_atual;
    return;
  end if;
  insert into public.area_creditos (organization_id, contact_id, delta, motivo, referencia)
  values (p_org, p_contact, p_delta, p_motivo, p_referencia);
  return query select 'aplicado'::text, v_atual + p_delta;
end;
$$;
revoke execute on function public.fn_area_creditos_mover(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.fn_area_creditos_mover(uuid, uuid, integer, text, text) to service_role;

alter table public.area_eventos drop constraint if exists area_eventos_tipo_check;
alter table public.area_eventos add constraint area_eventos_tipo_check check (tipo in (
  'convite_criado', 'entrou', 'visitou', 'material_aberto',
  'servico_visto', 'checkout_clicado', 'desejo', 'email_salvo', 'saiu',
  'carta_do_dia', 'diario_escrito', 'aniversario_salvo',
  'circulo_checkout', 'circulo_ativado', 'pergunta_enviada',
  'presente_checkout', 'presente_pago', 'presente_usado',
  'ano_pessoal_checkout', 'ano_pessoal_pago',
  'etapa_feita',
  'leitura_checkout', 'leitura_paga', 'leitura_revelada',
  'creditos_checkout', 'creditos_pagos'
));
