# Oferta do agente

A aba **Oferta** (na página do agente, ao lado de Identidade) é a segunda das abas
**estruturadas**: o dono do negócio declara, em campos, o que a empresa vende, e o
sistema compila isso num bloco literal que o agente lê a cada conversa.

O problema que ela resolve: o que o agente sabe sobre o que vende costuma estar em
prosa nas instruções, e é ali que ele inventa — um item que o produto não inclui, uma
entrega que não existe, uma garantia que ninguém deu.

## O que o dono preenche

| Campo | Tipo | Limite |
|---|---|---|
| Produtos e serviços | até 12 cartões; nome **único** (sem diferenciar caixa) | — |
| — Nome do produto | texto | 80 |
| — O que é | texto | 300 |
| — O que inclui | até 8 itens, sem aspas duplas, `;` nem quebra de linha | 120 cada |
| — Para quem é | texto | 200 |
| — Como é entregue | texto | 200 |
| Garantia e reembolso | texto — a política **real** | 300 |
| O que a empresa não oferece | até 8 itens, mesma regra dos itens acima | 120 cada |

Nenhum campo é de nicho: produto, serviço, plano, curso ou sessão têm um nome, o que
é, o que inclui, para quem serve e como é entregue.

## O que NÃO está aqui

- **O preço.** Tem aba própria (`config.pricing`) e é a **única** fonte de valor e de
  desconto: escrever o valor aqui também seria uma segunda verdade, que diverge no
  primeiro reajuste. O schema é estrito e **recusa** um campo `preco`; o cabeçalho do
  bloco manda o agente buscar valor e desconto no bloco de preço.
- **Perguntas frequentes e materiais longos.** Isso é **conhecimento** (a base que o
  agente consulta, com busca). A oferta guarda o que ele precisa dizer **exatamente**,
  curto, sempre à vista.

## Como vira instrução

`lib/oferta/bloco-do-prompt.ts` monta o bloco `OFERTA`, que entra **no fim** do prompt
do turno, na segunda posição da fila de blocos
(`lib/agent-engine/agent/blocos-do-turno.ts`), logo depois da identidade. O que vem
depois — anúncio, estilo, leitura, preço, entrega — vence em conflito.

- **"Use SÓ estes fatos":** o cabeçalho tira do agente a licença de completar.
- **A garantia é uma frase entre aspas**, literal, que o agente repete "sem acrescentar
  prazo, condição ou promessa" — o defeito medido de uma versão anterior do agente foi
  negar um reembolso que a empresa dava e prometer um que ela não dava.
- **O que o cliente digita é dado:** cada texto vira **uma linha**, sem aspas duplas,
  sem caracteres de controle e sem separadores de linha do Unicode. Nada do que ele
  escreve abre seção nova nem se passa por instrução do sistema.
- **Sem campo, sem bloco:** agente sem a aba preenchida (ou desligada) segue byte a
  byte como antes.

A tela mostra, ao lado, **o bloco real** (a mesma função do turno).

## Onde mora e quem salva

`ai_agents.config.offer` (jsonb, o mesmo lugar de `pricing`, `identity` e
`voice_reply`), escrita **só** por `PUT /api/v1/ai/agents/:id/oferta`; a rota genérica
de PATCH do agente descarta a chave, e a escrita é por **merge** (as outras abas não
são apagadas). Vale no **próximo turno, sem publicar versão** — por isso só **admin**
salva (manager lê). A auditoria `ai.offer_updated` guarda só as **contagens** (produtos,
itens, se há garantia, exclusões); nem o nome de um produto nem o texto da garantia.

## Provas

`tests/unit/oferta-do-agente.test.ts` (schema, compilador, injeção),
`tests/unit/aba-oferta-do-agente.test.tsx` (a tela),
`app/api/v1/ai/agents/[id]/oferta/route.test.ts` (a rota) e
`tests/e2e/oferta-do-agente.spec.ts` (a tela logada, num banco real, incluindo que
salvar a oferta não apaga a identidade).
