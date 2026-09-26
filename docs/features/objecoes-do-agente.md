# Objeções do agente

A aba **Objeções** (na página do agente, ao lado de Identidade e Oferta) é a terceira das
abas **estruturadas**: o dono do negócio escreve o que as pessoas costumam dizer para não
fechar e o **sentido** da resposta que ele aprova, e o sistema compila isso num bloco
literal que o agente lê a cada conversa.

O problema que ela resolve: objeção é o momento em que o agente mais improvisa. Sem uma
resposta aprovada, o modelo inventa uma — uma urgência que não existe, uma garantia que
ninguém deu, uma pressão que afasta quem estava só pensando.

## O que o dono preenche

| Campo | Tipo | Limite |
|---|---|---|
| Objeções | até 10 cartões; a **frase** é única (sem diferenciar caixa) | — |
| — Quando a pessoa diz | texto, do jeito que ela diz | 100 |
| — O que o agente responde | o sentido da resposta aprovada, **sem valor em dinheiro** | 400 |

A tela oferece **atalhos** para as objeções que se repetem em qualquer negócio (está caro,
vou pensar, preciso falar com outra pessoa, não confio, já tentei antes, não tenho tempo,
não é o momento). São atalhos, não vocabulário fechado: o dono edita a frase e escreve o
que quiser. Nenhum campo é de nicho.

## O que NÃO está aqui

- **Valor e desconto.** A resposta a uma objeção de preço é a escada da aba **Preço** (o
  piso, os degraus, o cupom). Escrever "por R$ 80 eu fecho" numa resposta seria uma
  segunda verdade, que diverge no primeiro reajuste. O schema **recusa** valor em dinheiro
  (símbolo de moeda, ou número seguido de "reais", "dólares", "euros") na resposta e a
  mensagem diz onde o valor mora. A frase da pessoa pode citar valor ("tá caro, R$ 130 é
  muito"): é o que ela diz, não o que o agente promete.
- **O que o agente nunca diz** (prova falsa, garantia de resultado, urgência inventada).
  Isso é a aba **Limites**, que vem depois. O bloco daqui carrega só a regra mínima e fixa.

## Como vira instrução

`lib/objecoes/bloco-do-prompt.ts` monta o bloco `OBJEÇÕES`, que entra **no fim** do prompt
do turno, na terceira posição da fila de blocos
(`lib/agent-engine/agent/blocos-do-turno.ts`), logo depois da oferta, de que depende, e
**antes** do preço: o bloco de preço vence em conflito.

O cabeçalho carrega **quatro regras fixas**:

1. responda **no sentido** da resposta aprovada, com as suas palavras e no tom da conversa
   (colada palavra por palavra, a mesma resposta duas vezes seria o tique que a camada de
   estilo existe para evitar);
2. não invente prova, prazo, garantia nem desconto além do que os outros blocos dizem;
3. valores e descontos vêm do bloco de preço;
4. se a pessoa repetir a objeção depois da resposta, reconheça e siga **sem pressionar** —
   o piso ético da aba.

**O que o cliente digita é dado.** Cada texto vira **uma linha**, sem aspas duplas, sem
caracteres de controle e sem separadores de linha do Unicode, pelo sanitizador
compartilhado das abas (`lib/prompt/texto-do-cliente.ts`). Nada do que ele escreve abre
seção nova nem se passa por instrução do sistema. **Sem campo, sem bloco:** agente sem a
aba preenchida (ou desligada) segue byte a byte como antes.

A tela mostra, ao lado, **o bloco real** (a mesma função do turno).

## Onde mora e quem salva

`ai_agents.config.objections` (jsonb, o mesmo lugar de `pricing`, `identity`, `offer` e
`voice_reply`), escrita **só** por `PUT /api/v1/ai/agents/:id/objecoes`; a rota genérica de
PATCH do agente descarta a chave, e a escrita é por **merge** (as outras abas não são
apagadas). Vale no **próximo turno, sem publicar versão** — por isso só **admin** salva
(manager lê). A auditoria `ai.objections_updated` guarda só a **contagem**; nem a frase da
pessoa nem a resposta aprovada.

## Provas

`tests/unit/objecoes-do-agente.test.ts` (schema, compilador, injeção),
`tests/unit/aba-objecoes-do-agente.test.tsx` (a tela),
`tests/unit/texto-do-cliente.test.ts` (o sanitizador compartilhado),
`app/api/v1/ai/agents/[id]/objecoes/route.test.ts` (a rota) e
`tests/e2e/objecoes-do-agente.spec.ts` (a tela logada, num banco real, incluindo que valor
em dinheiro é barrado pela tela e pelo servidor, e que salvar as objeções não apaga a oferta).
