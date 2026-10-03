# Messenger direto

## Escopo

`Conexões → Messenger` conecta páginas do Facebook à organização pelo login do
Facebook, com o app da Meta da instalação (o mesmo do WhatsApp oficial). Cada
página vira uma linha de `channel_sessions` com `provider = 'meta_messenger'` e
entra no motor comum: inbox, lead, opt-out, agente, fluxos, atribuição de anúncio,
janela de 24h. Sem intermediário e sem custo por mensagem.

Fora desta entrega (próximas): comentário na publicação → resposta privada,
formulários de lead (leadgen) e mensagens com etiqueta fora da janela
(`HUMAN_AGENT`, exige aprovação da Meta).

## Conexão

`GET /api/v1/messenger/oauth/start` (admin) → login do Facebook com `state`
assinado (HMAC do `INTERNAL_SECRET` com finalidade própria — o `state` do
Instagram não abre esta volta). `GET …/oauth/callback` (público, identidade pelo
`state`) troca o código por token de usuário de longa duração, lista as páginas
autorizadas (`/me/accounts`, a pessoa as escolhe na tela da Meta), liga o webhook
do app para o objeto `page` (idempotente) e, para cada página com a tarefa
MESSAGING, grava o canal e liga os avisos dela (`/{page}/subscribed_apps`).
Página cujos avisos não ligam fica `FAILED` com o motivo da Meta no cartão.

- Token da PÁGINA cifrado (`fn_encrypt_oauth`) em
  `messenger_page_token_encrypted`; nunca volta à tela.
- Uma página, uma organização: índice único entre ativos (migration 0911). A
  leitura da conexão é sempre escopada pela organização; quem recusa a página de
  outra empresa é o índice (23505).
- Reconectar página excluída RESSUSCITA a mesma linha
  (`reactivateChannelSession`, auditado), e as conversas continuam ligadas.
- A IA nasce pausada (`pre_go_live`), como em todo canal.
- Página não conta como número no plano (cerca dos planos, declarada).

## Entrada

`POST /api/v1/webhooks/messenger` — URL única do app (a Meta não permite URL por
página). Assinatura `X-Hub-Signature-256` com o segredo do app ANTES de ler. A
organização vem da sessão ativa da página (`entry.id`), nunca do corpo — exceção
declarada em `tests/unit/canal-consulta-por-organizacao.test.ts`.

`parser.ts` (puro) → `ingest.ts` → `zernio/ingest.ts` (ramo social compartilhado)
→ `pos-entrada`. Identidade `facebook:<página>:<PSID>`; a thread é o PSID.
O nome vem do perfil (`/{psid}`) só para contato novo. Entrega por `mid`, leitura
por marca d'água. Eco do NOSSO app (`app_id`) é descartado; eco de outra origem
entra como saída e pausa a IA. `referral` de anúncio (`source: ADS`) é traduzido
para a forma que `extrairAtribuicaoMeta` lê. Corpo cru arquivado em
`webhook_events_log` por sessão; falha de escrita → 500 → reentrega idempotente.

## Saída

`messengerAdapter.send` → `/{page}/messages` (`messaging_type: RESPONSE`), para o
PSID guardado em `conversations.provider_conversation_id`. Anexo por URL;
legenda sai como segunda mensagem. Recusa da Meta vira frase de atendente (fora
da janela, pessoa indisponível, acesso revogado). "Digitando…" por
`sender_action`, com a thread vinda de `presenca.ts`. Saúde: avisos da página
ligados no NOSSO app.

## Desconectar

Rota padrão `DELETE /api/v1/channel-sessions/[id]`: desliga os avisos da página na
Meta antes de apagar o token (best-effort, desfecho na auditoria), e arquiva ou
apaga conforme o impacto, como qualquer canal.

## Configuração

`META_APP_ID` no `.env` (segredo e verify token vêm de `appDaMeta()`). No app da
Meta: produtos Messenger e Login do Facebook, endereço de volta
`/api/v1/messenger/oauth/callback`. App do tipo Empresa: `META_MESSENGER_CONFIG_ID`
com `pages_show_list`, `pages_messaging`, `pages_manage_metadata`,
`pages_read_engagement`. Sem análise do app pela Meta, só páginas de quem tem
função no app conectam.
