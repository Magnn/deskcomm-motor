# Identidade e tom do agente

A aba **Identidade** (na página do agente, ao lado de Configuração) é a primeira das
abas **estruturadas**: em vez de pedir ao dono do negócio que escreva tudo em prosa no
campo de instruções, ela pede campos, e o sistema os compila num bloco literal que o
agente lê a cada conversa.

## O que o dono preenche

| Campo | Tipo | Limite |
|---|---|---|
| Como ele se chama | texto | 60 |
| Nome da empresa | texto | 80 |
| O que a empresa faz | texto | 400 |
| Quem vocês atendem | texto | 300 |
| Como ele se apresenta | texto (vai literal, entre aspas) | 200 |
| Tom de voz | **escolha**: acolhedor, consultivo, direto, persuasivo, descontraído, formal | — |
| Tratamento | **escolha**: você, o senhor/a senhora | — |
| Emojis | **escolha**: nenhum, com parcimônia, à vontade | — |
| Tamanho das mensagens | **escolha**: curtas, médias | — |
| Palavras da casa / palavras a evitar | até 10 cada, sem aspas duplas nem quebra de linha | 40 cada |

Nenhum campo é de nicho: clínica, loja, imobiliária, infoproduto ou terapeuta
preenchem os mesmos campos. O que é de nicho (oferta, roteiro, objeções) vai em abas
próprias.

## Como vira instrução

`lib/identidade/bloco-do-prompt.ts` monta o bloco `IDENTIDADE E TOM`, que entra **no
fim** do prompt do turno, na primeira posição da fila de blocos
(`lib/agent-engine/agent/blocos-do-turno.ts`). O que vem depois — anúncio, estilo,
leitura, preço, entrega — vence em conflito, e o próprio bloco diz que molde literal e
regra de segurança valem mais.

- **Vocabulário fechado** (tom, tratamento, emoji, tamanho): cada valor tem uma frase
  fixa, escrita e revisada uma vez em `lib/identidade/tipos.ts`. O tom "persuasivo"
  promete "sem pressão e sem urgência inventada".
- **Texto do cliente**: entra como dado, reduzido a **uma linha**, sem aspas duplas e sem
  caracteres de controle nem separadores de linha do Unicode. Nada do que ele escreve
  abre uma seção nova nem se passa por instrução do sistema.
- **Sem campo, sem bloco**: agente sem a aba preenchida (ou com ela desligada) segue
  byte a byte como antes.

A tela mostra, ao lado, **o bloco real** (a mesma função do turno): o que está escrito é
o que o agente recebe.

## Onde mora e quem salva

`ai_agents.config.identity` (jsonb, o mesmo lugar de `pricing` e `voice_reply`), escrita
**só** por `PUT /api/v1/ai/agents/:id/identidade`; a rota genérica de PATCH do agente
descarta a chave. Vale no **próximo turno, sem publicar versão** — por isso só
**admin** salva (manager lê). Cada alteração vai para a auditoria como
`ai.identity_updated`, com o formato (campos preenchidos, escolhas) e **nunca** o texto
digitado.

## Relação com o estilo universal

O estilo universal (`lib/estilo/variacao-do-agente.ts`) é a regra mais fraca: aponta o
que o agente já repetiu. A identidade vem **antes** dele na fila e o respeita numa
escolha explícita: com emojis "à vontade", a heurística "a pessoa não usa emoji, então
não use nenhum" é desligada (o mesmo emoji repetido em 3 dos 4 turnos continua
apontado).

## Provas

`tests/unit/identidade-do-agente.test.ts` (schema, compilador, injeção),
`tests/unit/aba-identidade-do-agente.test.tsx` (a tela) e
`app/api/v1/ai/agents/[id]/identidade/route.test.ts` (a rota).
