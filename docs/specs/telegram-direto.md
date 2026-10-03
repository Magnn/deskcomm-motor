# Telegram direto

## Escopo

`Conexões → Telegram` conecta bots do Telegram pelo token do BotFather. Cada bot
é uma linha de `channel_sessions` com `provider = 'telegram_bot'` e entra no motor
comum: inbox, lead, opt-out, agente, fluxos. Só conversa PRIVADA vira atendimento.
Fora desta entrega: grupos, envio de botões pelo agente/fluxo, pagamentos do Telegram.

## Conexão

`POST /api/v1/telegram` (admin, MFA, guarda de suporte): formato do token →
`getMe` → grava o canal (token cifrado por `fn_encrypt_oauth`, IA `pre_go_live`) →
`setWebhook` para `/api/v1/webhooks/channel/<webhook_path_token>` com `secret_token`
(64 hex, cifrado em `webhook_secret_encrypted`), `allowed_updates = message,
callback_query`, `drop_pending_updates`. Falha do webhook deixa o bot `FAILED` com o
motivo do Telegram na tela. Leituras sempre escopadas pela organização; bot ativo em
outra empresa é recusado pelo índice único entre ativos (0912, 23505). Reconectar
mantém URL e segredo; bot excluído ressuscita a linha (`reactivateChannelSession`).
Bot não conta como número no plano (cerca declarada).

## Entrada

Rota genérica por token → `inbound.ts` confere `X-Telegram-Bot-Api-Secret-Token`
em tempo constante → `telegram/ingest.ts` → `parser.ts` (puro) → ramo social de
`zernio/ingest.ts` → `pos-entrada`. Identidade `telegram:<bot>:<pessoa>`; thread =
`chat.id`; id gravado = bot + chat + `message_id`. Toque em botão vira o RÓTULO do
botão e é confirmado (`answerCallbackQuery`). Canal da conversa `telegram` é NATIVO
(`CANAIS_NATIVOS` em `canais-de-conversa.ts`), fora do catálogo do intermediário.
O Telegram não ecoa o que o bot manda: não há eco a filtrar.

## Mídia

A mensagem grava `media_url = tg-file:<file_id>` — a URL de download traz o token
no caminho. `fetchInboundMedia` resolve por `getFile` na hora, recusa o que não é
`tg-file:`, respeita o teto de 20 MB da Bot API e acerta o mime pela extensão.

## Saída

`telegramAdapter.send` → `sendMessage`/`sendPhoto`/`sendVideo`/`sendVoice`/`sendAudio`
(`asFile`)/`sendDocument`/`sendSticker` para o `chat.id` da thread, com citação por
`reply_parameters`. Recusas viram frase de atendente (bloqueou o bot, token
revogado, limite de ritmo). Sem janela: `freeformOutsideWindow = true`. Saúde:
`getWebhookInfo` (URL nossa e sem erro nos últimos 15 min).

## Desconectar

Rota padrão `DELETE /api/v1/channel-sessions/[id]`: `deleteWebhook` antes de apagar
o token (best-effort, desfecho na auditoria) e arquiva/apaga conforme o impacto.
