-- 0915 · O conteúdo da campanha deixa de ser só texto.
--
-- ─── O que entra ────────────────────────────────────────────────────────────
-- A campanha escolhe O QUE manda a cada pessoa (`content_kind`):
--   'text'     — o texto livre de sempre (`message_body`). Padrão: toda campanha
--                existente continua exatamente como era.
--   'template' — um MODELO APROVADO do canal oficial (`template_name`,
--                `template_language`, `template_values`). É o único jeito de o
--                canal oficial falar com quem está fora da janela de 24h — sem
--                isto a campanha, nesse canal, só alcançava quem já tinha escrito
--                no último dia.
--   'flow'     — INSCREVE a pessoa num fluxo publicado (`flow_pointer_id`): mídia,
--                botões, perguntas e sequência ficam por conta do fluxo, que já
--                sabe fazer tudo isso.
--
-- ─── Coerência no banco ─────────────────────────────────────────────────────
-- O CHECK não exige o conteúdo no RASCUNHO (a pessoa escolhe o tipo e preenche
-- depois); quem cobra antes de enviar é o código (`faltaNoConteudo`). O que o
-- banco garante é o vocabulário e que modelo sem idioma não existe.
--
-- `flow_pointer_id` com `on delete set null`: apagar o fluxo não apaga a
-- campanha nem o histórico dela — ela volta a "sem conteúdo" e a preparação
-- recusa com a frase que explica.

alter table public.campaigns
  add column if not exists content_kind text not null default 'text',
  add column if not exists template_name text,
  add column if not exists template_language text,
  add column if not exists template_values jsonb not null default '{}'::jsonb,
  add column if not exists flow_pointer_id uuid references public.followup_flow_pointers(id) on delete set null;

alter table public.campaigns
  drop constraint if exists campaigns_content_kind_conhecido;
alter table public.campaigns
  add constraint campaigns_content_kind_conhecido check (content_kind in ('text', 'template', 'flow'));

alter table public.campaigns
  drop constraint if exists campaigns_template_com_idioma;
alter table public.campaigns
  add constraint campaigns_template_com_idioma check (template_name is null or template_language is not null);

comment on column public.campaigns.content_kind is
  'O que a campanha manda: text (message_body), template (modelo aprovado do canal oficial) ou flow (inscreve no fluxo de flow_pointer_id). Espelhado em lib/campanhas/conteudo.ts.';

notify pgrst, 'reload schema';
