-- 0944 — O FUNIL DOS QUIZZES DA PÁGINA, medido por nós.
--
-- Pedido do dono em 22/10/2026: "metrificar cada passo do lead dentro do quiz pra entender até onde ele está
-- indo, sem depender da Meta". Até aqui só o checkout e o pagamento ficavam no banco (`area_eventos`); os passos
-- anteriores (abriu, preencheu, viu a prévia) só iam para o pixel.
--
-- `area_quiz_visitas`: UMA linha por visita e quiz, com o estado ATUAL — o passo mais adiantado, o último sinal
-- (`visto_em`, renovado a cada ~20 s enquanto a página está aberta: é o "ao vivo"), a região aproximada pelo
-- fuso do aparelho, o aparelho, a campanha e, depois que a pessoa pede o pagamento, o contato.
--
-- `area_quiz_passos`: UMA linha por visita, quiz e passo (o histórico do funil). Quem faz o quiz é anônimo até dar o e-mail, então a
-- página gera o id da `visita` (UUID, no navegador) e não há contato. A chave única faz a repetição de um passo
-- ser ignorada: contar linhas de um passo é contar pessoas. Só o servidor escreve (rota pública com limite por
-- IP); a equipe lê.
--
-- Aditiva e idempotente.

create table if not exists public.area_quiz_visitas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  visita uuid not null,
  quiz text not null check (quiz in ('sinastria', 'prosperidade', 'caminhos')),
  passo text not null check (passo in ('abriu', 'dados', 'perguntas', 'email', 'previa', 'pagar', 'cobranca', 'pago', 'leitura')),
  passo_ordem smallint not null default 0 check (passo_ordem between 0 and 20),
  contact_id uuid references public.contacts(id) on delete set null,
  fuso text check (fuso is null or char_length(fuso) <= 60),
  regiao text check (regiao is null or char_length(regiao) <= 60),
  idioma text check (idioma is null or char_length(idioma) <= 20),
  campanha text check (campanha is null or char_length(campanha) <= 80),
  origem text check (origem is null or char_length(origem) <= 40),
  moeda text check (moeda is null or moeda in ('BRL', 'EUR', 'USD')),
  celular boolean,
  primeiro_em timestamptz not null default now(),
  visto_em timestamptz not null default now(),
  unique (organization_id, visita, quiz)
);
create index if not exists area_quiz_visitas_org_visto_idx on public.area_quiz_visitas (organization_id, visto_em desc);

comment on table public.area_quiz_visitas is
  'As visitas aos quizzes da página (migration 0944): uma linha por visita anônima e quiz, com o passo mais adiantado, o último sinal (visto_em, o "ao vivo"), a região pelo fuso, o aparelho, a campanha e o contato depois do pedido de pagamento. Só o servidor escreve; a equipe lê.';

alter table public.area_quiz_visitas enable row level security;
drop policy if exists tenant_isolation_area_quiz_visitas_select on public.area_quiz_visitas;
create policy tenant_isolation_area_quiz_visitas_select on public.area_quiz_visitas
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
revoke all on public.area_quiz_visitas from anon;
revoke insert, update, delete, truncate on public.area_quiz_visitas from authenticated;

create table if not exists public.area_quiz_passos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  visita uuid not null,
  quiz text not null check (quiz in ('sinastria', 'prosperidade', 'caminhos')),
  passo text not null check (passo in ('abriu', 'dados', 'perguntas', 'email', 'previa', 'pagar', 'cobranca', 'pago', 'leitura')),
  campanha text check (campanha is null or char_length(campanha) <= 80),
  origem text check (origem is null or char_length(origem) <= 40),
  moeda text check (moeda is null or moeda in ('BRL', 'EUR', 'USD')),
  celular boolean,
  created_at timestamptz not null default now(),
  unique (organization_id, visita, quiz, passo)
);
create index if not exists area_quiz_passos_org_tempo_idx on public.area_quiz_passos (organization_id, created_at desc);

comment on table public.area_quiz_passos is
  'O funil dos quizzes da página (migration 0944): uma linha por visita anônima, quiz e passo (abriu → leitura). Contar linhas de um passo é contar pessoas. Só o servidor escreve; a equipe lê.';

alter table public.area_quiz_passos enable row level security;
drop policy if exists tenant_isolation_area_quiz_passos_select on public.area_quiz_passos;
create policy tenant_isolation_area_quiz_passos_select on public.area_quiz_passos
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
revoke all on public.area_quiz_passos from anon;
revoke insert, update, delete, truncate on public.area_quiz_passos from authenticated;
