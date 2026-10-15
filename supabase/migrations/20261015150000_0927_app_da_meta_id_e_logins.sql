-- 0927 · O ID do app da Meta e as configurações de login saem do `.env` e vão
-- para a linha da instalação (`platform_meta_app`, migration 0257).
--
-- ─── O que o dono via ───────────────────────────────────────────────────────
-- O portfólio (BM) dono do app foi restrito pela Meta e "não pode mais integrar
-- clientes": o botão "Conectar com Facebook" do WhatsApp oficial passa a abrir a
-- janela de um app que não pode cadastrar ninguém. Trocar para um app de outro
-- portfólio pedia SSH na VPS, editar `META_APP_ID` e `META_WHATSAPP_CONFIG_ID`
-- no `.env` e reiniciar o `app` — e reiniciar o `app` derruba o webhook por
-- alguns segundos. A chave secreta já se trocava pela tela desde a 0257; o ID do
-- app, que é a outra metade do mesmo par, não.
--
-- ─── Por que as quatro colunas andam juntas ─────────────────────────────────
-- `config_id` é de UM app: a configuração do "Login do Facebook para Empresas"
-- de um app não abre a janela de outro. Gravar só o `app_id` novo e deixar as
-- configurações no `.env` abriria a janela com a configuração do app antigo. O
-- resolvedor (`lib/channels/meta/app.ts`) usa as quatro colunas quando há
-- `app_id` gravado, e o `.env` inteiro quando não há.
--
-- ─── Por que texto em claro ─────────────────────────────────────────────────
-- Nenhum dos quatro é segredo: o ID do app e o da configuração aparecem na
-- própria janela da Meta, no navegador de quem conecta. A tabela continua sem
-- policy e sem grant para `anon`/`authenticated` (0257), então nada muda em quem
-- consegue lê-la.
--
-- Idempotente; sem dado a corrigir.

alter table public.platform_meta_app
  add column if not exists app_id text,
  add column if not exists whatsapp_config_id text,
  add column if not exists messenger_config_id text,
  add column if not exists ads_config_id text;

comment on column public.platform_meta_app.app_id is
  'ID do app da Meta desta instalação. Gravado junto da chave secreta dele (a action recusa trocar um sem o outro). Vazio = vale o META_APP_ID do .env.';
comment on column public.platform_meta_app.whatsapp_config_id is
  'Configuração do Login do Facebook para Empresas com o Cadastro Incorporado do WhatsApp, do app em app_id. Vazio com app_id gravado = sem botão "Conectar com Facebook".';
comment on column public.platform_meta_app.messenger_config_id is
  'Configuração do Login do Facebook para Empresas do Messenger, do app em app_id. Opcional.';
comment on column public.platform_meta_app.ads_config_id is
  'Configuração do Login do Facebook para Empresas do Meta Ads, do app em app_id. Opcional.';

notify pgrst, 'reload schema';
