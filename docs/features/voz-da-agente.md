# Voz da agente — respostas em áudio no WhatsApp

A agente responde com **nota de voz** (a bolha com a onda) quando a pessoa mandou
áudio. Em todos os outros casos segue em texto. A voz pode ser uma voz pronta ou uma
voz **clonada** a partir de gravações.

## Como ligar

1. Abra o agente → aba **Voz**.
2. Escolha o serviço:
   - **OpenAI** — usa a chave da OpenAI que o produto já usa para transcrever áudio
     (IA › Credenciais). Vozes prontas femininas e masculinas; não clona.
   - **ElevenLabs** — cole a chave na própria aba (ela é guardada cifrada, como as
     demais). Biblioteca de vozes e clonagem; a clonagem exige um plano da
     ElevenLabs que a inclua.
3. Ouça as vozes (**Ouvir**), escolha uma (**Usar**), ajuste velocidade/estilo e
   clique em **Salvar voz**. Vale a partir da próxima conversa: não há versão para
   publicar.

## O que acontece no turno

- Só responde em áudio se o agente tem `voice_reply.enabled` **e** a mensagem que abriu
  o turno é um áudio da pessoa (`messages.type = 'audio'`, `direction = 'inbound'`).
  Follow-up e o painel de Teste nunca falam.
- A resposta vira **uma nota por até `max_chars_per_note` caracteres** (padrão 700),
  cortando em fim de frase. Passou de 3 notas, sai como texto.
- Emoji, marcação do WhatsApp e URLs saem da fala. **Links saem como texto, depois do
  áudio** — o de pagamento nunca é lido em voz alta.
- O áudio é gravado em `whatsapp-media/<org>/<conversa>/voz-<hash>.ogg` e enviado pelo
  mesmo caminho de qualquer mídia: opt-out, janela de 24h e ritmo anti-banimento
  continuam valendo, a inbox mostra a nota (com o texto falado como legenda) e a LGPD
  a apaga junto com a conversa.
- **Qualquer falha com a voz (sem chave, cota, provedor fora do ar, formato) cai para
  texto.** O motivo vai para o log do worker (`resposta em áudio caiu para texto`),
  sem o texto da pessoa.

## Clonagem e consentimento

Voz é dado pessoal. A rota `POST /api/v1/ai/voices/clone` **recusa sem
`consent=true`** e grava em `api_audit_log` a ação `ai.voice_cloned` com quem declarou,
quando, e o texto do consentimento (`lib/voz/consentimento.ts`, versionado). A rota não
prova que a voz é do declarante — registra a declaração. As amostras vão direto ao
provedor e não são guardadas aqui.

## Onde vive

| Peça | Arquivo |
|---|---|
| Configuração | `ai_agents.config.voice_reply` (jsonb; schema em `lib/voz/tipos.ts`) |
| Provedores (OpenAI, ElevenLabs) | `lib/voz/provedores/` |
| Turno da agente | `lib/agent-engine/agent/nota-de-voz.ts` + `inbound-turn.ts` |
| API | `app/api/v1/ai/voices/` (listar, pré-escuta, clonar, apagar) |
| Tela | `app/app/ai/agents/[id]/_components/VozDoAgente.tsx` |

Sem migration: o `config` é jsonb livre. A chave da ElevenLabs usa a mesma tabela de
chaves (`ai_provider_credentials`, vocabulário aberto desde a 0127), mas vive numa lista
própria (`PROVEDORES_DE_VOZ`) — a lista de provedores de chat (`PROVEDORES`) é casada
com o registry de modelos e não deve conter quem não conversa.

## O que NÃO foi provado contra a API real

Escrito a partir da documentação pública, com testes que dublam o provedor:

- `output_format=opus_48000_32` da ElevenLabs. Se a conta/modelo recusa (4xx), o código
  pede mp3 e converte com **ffmpeg** (`lib/voz/converter.ts`); a imagem do worker leva
  ffmpeg por isso. Sem ffmpeg, cai para texto.
- `POST /v1/voices/add` (clonagem) e o formato do erro de plano sem clonagem.
- `response_format: "opus"` da OpenAI devolver Ogg/Opus — conferido por `ehOggOpus`
  antes de gravar; se não for, cai para texto.

O primeiro teste real (uma chave, uma voz, um áudio recebido) é o que fecha isto.
