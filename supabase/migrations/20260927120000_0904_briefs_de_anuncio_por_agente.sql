-- 0904 — briefs de anúncio: consciência/desejo/medo/promessa POR ANÚNCIO, não só por agente
--
-- ═══ POR QUE ═══
--
-- A aba "Consciência" (0903... na verdade sem número de migration própria, é jsonb em
-- `ai_agents.config.consciencia`) fixa UM nível/desejo/promessa para o agente inteiro. Isso é
-- estatisticamente falso pra maioria das conversas: o mesmo agente atende, no mesmo dia, quem
-- clicou num anúncio educativo (não sabe do problema) e quem clicou num anúncio de remarketing
-- (já conhece a oferta). Quem sabe a diferença é o DONO — ele escreveu os dois anúncios sabendo
-- o ângulo de cada um — não uma IA adivinhando pela primeira mensagem.
--
-- `contacts.source_metadata` (migration 0164) já grava, no primeiro toque, de qual ANÚNCIO
-- (`ad_id`) a pessoa veio — mas só o TEXTO do anúncio, sem calibração nenhuma. Esta migration
-- cria o lugar para o dono anexar consciência/desejo/medo/promessa a um anúncio ESPECÍFICO (pelo
-- `ad_id` da Meta, ou por um trecho do título, pra quem não quer copiar o ID do Ads Manager).
--
-- ═══ O QUE FICA DE FORA, DE PROPÓSITO ═══
--
--   • Google Ads: não há extrator de atribuição para ele hoje (`lib/leads/atribuicao-de-anuncio.ts`
--     documenta por quê — dependeria de uma landing page própria). `ad_id`/`titulo_contem` continuam
--     genéricos (não amarram a `meta_ads`), mas na prática só Meta Ads alimenta `source_metadata`
--     hoje — decisão do dono, não lacuna esquecida.
--   • Campanha/conjunto de anúncio: o payload do `referral` da Meta Cloud API não traz esse nível
--     (só `source_id`/`ad_id`, `headline`, `body`) — não existe ENTIDADE de campanha nesta fork.
--     O brief é por ANÚNCIO individual, que é o único identificador que o webhook realmente entrega.
--   • Escopo: por AGENTE (decisão do dono, 27/set/2026) — mesmo molde de Identidade/Oferta/
--     Consciência/Objeções/Limites. Um anúncio que alimenta dois agentes precisa de um brief em cada.
--
-- Vocabulário do NÍVEL é o MESMO enum de `lib/consciencia/tipos.ts` (`NIVEIS_DE_CONSCIENCIA`) —
-- nenhuma lista nova, cobrado por `tests/invariants/vocabulario-banco-x-typescript.test.ts`.
--
-- Idempotente: `create table if not exists`, e as policies usam `drop policy if exists` antes de
-- recriar (mesmo molde de `ai_agent_versions`).

create table if not exists public.ai_agent_ad_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  -- Nome livre pro dono reconhecer o brief numa lista ("Anúncio dor financeira — fev/26").
  rotulo text not null,
  -- Como casar com o contato que chegou: pelo menos um dos dois — nunca os dois vazios (constraint
  -- abaixo). `ad_id` casa exato (o `adId` que `atribuicao-de-anuncio.ts` grava); `titulo_contem` casa
  -- por trecho contra o título do anúncio, pra quem não quer copiar o ID do Ads Manager.
  ad_id text,
  titulo_contem text,
  nivel text,
  desejo_ou_dor text,
  medo_oculto text,
  promessa text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  constraint ai_agent_ad_briefs_rotulo_check check (char_length(btrim(rotulo)) > 0 and char_length(rotulo) <= 80),
  constraint ai_agent_ad_briefs_ad_id_check check (ad_id is null or (char_length(btrim(ad_id)) > 0 and char_length(ad_id) <= 100)),
  constraint ai_agent_ad_briefs_titulo_contem_check check (titulo_contem is null or (char_length(btrim(titulo_contem)) > 0 and char_length(titulo_contem) <= 140)),
  -- Vocabulário FECHADO — mesmo enum de NIVEIS_DE_CONSCIENCIA (lib/consciencia/tipos.ts).
  constraint ai_agent_ad_briefs_nivel_check check (nivel is null or nivel = any (array['nao_sabe_do_problema','sabe_do_problema','conhece_solucoes','conhece_a_oferta','pronto_para_decidir'])),
  constraint ai_agent_ad_briefs_desejo_ou_dor_check check (desejo_ou_dor is null or char_length(desejo_ou_dor) <= 300),
  constraint ai_agent_ad_briefs_medo_oculto_check check (medo_oculto is null or char_length(medo_oculto) <= 300),
  constraint ai_agent_ad_briefs_promessa_check check (promessa is null or char_length(promessa) <= 300),
  -- Sem isto, um brief "fantasma" (nenhum dos dois campos de casamento preenchido) nunca bateria com
  -- contato nenhum e o dono nunca saberia por quê — melhor recusar na gravação.
  constraint ai_agent_ad_briefs_tem_casamento_check check (ad_id is not null or titulo_contem is not null)
);

-- Um `ad_id` exato só pode ter UM brief ativo por agente — dois brief batendo no mesmo anúncio
-- exato seria ambiguidade que a resolução (lib/consciencia/ad-briefs.ts) se recusa a arbitrar.
-- `titulo_contem` fica FORA deste índice de propósito: é casamento por substring, não dá pra um
-- índice único garantir unicidade (dois trechos diferentes podem se sobrepor no mesmo título) — a
-- resolução trata mais de um resultado como ambíguo e cai no default do agente, nunca escolhe às
-- cegas.
create unique index if not exists idx_ai_agent_ad_briefs_ad_id_unico
  on public.ai_agent_ad_briefs (agent_id, ad_id)
  where ativo and ad_id is not null;

create index if not exists idx_ai_agent_ad_briefs_por_agente
  on public.ai_agent_ad_briefs (organization_id, agent_id)
  where ativo;

alter table public.ai_agent_ad_briefs enable row level security;

drop policy if exists tenant_isolation_ai_agent_ad_briefs_select on public.ai_agent_ad_briefs;
create policy tenant_isolation_ai_agent_ad_briefs_select on public.ai_agent_ad_briefs
  for select using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_ai_agent_ad_briefs_write on public.ai_agent_ad_briefs;
create policy tenant_isolation_ai_agent_ad_briefs_write on public.ai_agent_ad_briefs
  for all using (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  ) with check (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin')
  );

notify pgrst, 'reload schema';
