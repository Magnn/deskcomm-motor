# Voz da agente — respostas em áudio no WhatsApp

A agente responde com **nota de voz** (a bolha com a onda) quando a pessoa mandou
áudio — e, se você escolher o modo "momentos", também nas respostas longas. Nos demais
casos segue em texto. A voz pode ser uma voz pronta ou uma voz **clonada** a partir de
gravações.

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

## Quando ela fala: dois modos

- **`mirror` (padrão):** só quando a mensagem que abriu o turno é um áudio da pessoa
  (`messages.type = 'audio'`, `direction = 'inbound'`).
- **`moments`:** o espelho **mais** as respostas longas — a fala (texto sem link e
  emoji) com pelo menos `min_chars_for_voice` caracteres (padrão 240, faixa 80–1500).
  Serve para o trecho em que a agente explica algo (uma leitura, uma orientação)
  sair falado enquanto a pessoa escreve; o "ok, tarot ou mão?" segue em texto.
  A decisão é **só pelo tamanho** (`lib/voz/decisao.ts`): nenhum marcador no prompt,
  então nada como "[voz]" pode vazar para a pessoa. Quem já tinha a voz ligada sem
  `mode` continua em `mirror`.

Em ambos, quem decide é `deveResponderEmAudio`, por mensagem: a mesma resposta pode
sair falada num turno e escrita no outro.

## O que acontece no turno

- Só responde em áudio se o agente tem `voice_reply.enabled` **e**
  `deveResponderEmAudio` manda falar (acima). Follow-up e o painel de Teste nunca
  falam.
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

## Para a voz soar como gente

O que mais denuncia uma nota de voz de robô, na ordem:

1. **Sotaque.** As vozes prontas da ElevenLabs são, em geral, de falantes de inglês; em
   português ganham sotaque estrangeiro. O cartão "Vozes em português do Brasil" busca
   na biblioteca (`GET /api/v1/ai/voices/library`, `language=pt`, só as que se
   declaram brasileiras) e adiciona a escolhida à conta (`POST` na mesma rota, admin,
   auditado como `ai.voice_added_from_library`). Pode exigir plano pago; a falha volta
   como `sem_permissao_de_biblioteca`. Clonar uma voz nativa é a outra saída.
2. **Prosódia.** Estabilidade menor deixa o tom variar; velocidade um pouco abaixo de 1
   soa mais calma; `style` (expressividade) fica de 0 a 0,3 para conversa. O botão
   "Deixar mais natural" aplica 0,35 / 0,8 / 0,2 / 0,95. O modelo `eleven_v3` é mais
   expressivo — ouça antes de salvar: se o provedor recusar, a agente cai para texto.
3. **O que se lê.** `textoParaFala` (`lib/voz/sintetizar.ts`) escreve valores em reais por
   extenso (`lib/voz/extenso.ts`: "R$ 130" → "cento e trinta reais"), transforma
   reticências em uma pausa e tira link, emoji e marcação.

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
| API | `app/api/v1/ai/voices/` (listar, pré-escuta, clonar, apagar, biblioteca) |
| Tela | `app/app/ai/agents/[id]/_components/VozDoAgente.tsx` |

Sem migration: o `config` é jsonb livre. A chave da ElevenLabs usa a mesma tabela de
chaves (`ai_provider_credentials`, vocabulário aberto desde a 0127), mas vive numa lista
própria (`PROVEDORES_DE_VOZ`) — a lista de provedores de chat (`PROVEDORES`) é casada
com o registry de modelos e não deve conter quem não conversa.

## O que foi provado e o que não foi contra a API real

Provado em produção (24/09/2026, conversa real no WhatsApp): a agente responde com nota
de voz da ElevenLabs no modo `moments`.

Escrito a partir da documentação pública, com testes que dublam o provedor, e ainda sem
prova real:

- A biblioteca: `GET /v1/shared-voices` (`language=pt`, `gender`, `search`) e
  `POST /v1/voices/add/{public_owner_id}/{voice_id}`. O filtro "brasileira" lê
  `accent`/`locale` da resposta; se o provedor não declara nada, a lista vem inteira.
- `POST /v1/voices/add` (clonagem) e o formato do erro de plano sem clonagem.
- O modelo `eleven_v3` com os mesmos `voice_settings` (`stability`, `style`, `speed`).
- `response_format: "opus"` da OpenAI devolver Ogg/Opus — conferido por `ehOggOpus`
  antes de gravar; se não for, cai para texto.
