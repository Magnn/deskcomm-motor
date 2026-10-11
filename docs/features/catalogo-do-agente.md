# Catálogo do agente

A aba **Catálogo** (na página do agente, ao lado de Preço) guarda **um registro por
produto** que o agente pode oferecer a quem **já comprou**. O sistema escolhe um
produto por vez e o agente nunca vê a lista.

O problema que ela resolve: um produto a mais morava em cinco lugares — o roteiro, a
aba Preço, o nome de um fluxo "Entrega — …", a marca `produto:<nome>` no contato e o
checkout. O que divergia entre eles saía para o cliente.

## O que o dono preenche, por produto

| Campo | Tipo | Limite |
|---|---|---|
| Nome do produto | texto, **único** no catálogo (sem diferenciar caixa nem acento); o mesmo nome do checkout | 80 |
| Valor | dinheiro | R$ 1 a R$ 100.000 |
| Link de pagamento | `https://`, cobrando exatamente o valor | 300 |
| O que é | texto | 300 |
| O que a pessoa recebe | texto | 200 |
| Como é entregue | `material` ou `conversa` | — |
| O que pedir antes de entregar | até 6 itens, sem aspas duplas, `;` nem quebra de linha | 80 cada |
| Oferecer depois da compra de | nome de um produto; em branco = qualquer compra | 80 |
| Espera | horas desde o último pagamento | 0 a 720 (padrão 20) |
| Pode ser oferecido | ligado, ou rascunho | — |

Até 12 produtos. A **ordem dos cartões é a prioridade**: entre os que a pessoa pode
receber agora, vale o primeiro.

## O que NÃO está aqui

- **O produto da primeira venda.** Valor, referência e escada de negociação continuam
  na aba Preço (`config.pricing`): negociar é uma regra por conversa, não um campo de
  produto.
- **A "Oferta para quem já comprou" da aba Preço** (`pricing.post_sale`). Com o
  catálogo **ligado** ela deixa de valer — o turno lê o catálogo no lugar, e a aba
  Preço mostra o aviso. Nunca as duas ao mesmo tempo.
- **Tipos de entrega sem motor.** O vocabulário é fechado em `material` e `conversa`.
  Relatório calculado e ciclo de assinatura entram quando ganharem motor.

## Como o produto da vez é escolhido

`lib/catalogo/oferta-da-vez.ts`, sem I/O. Um produto é oferecido quando **tudo** isto
vale:

1. está ligado e **completo** — um `material` só é completo se existe um fluxo de
   entrega ativo que o declara (`trigger_config.product_name`); sem isso a pessoa
   pagaria e não receberia;
2. a pessoa tem a marca `pago` e nenhuma de `reembolso` ou `chargeback`;
3. ela ainda não comprou este produto (marca `produto:<nome>`);
4. a compra que o libera ("depois da compra de") aconteceu;
5. já passou a espera desde o último pagamento.

A oferta já feita e não comprada **não** passa a vez para a seguinte: recusou, o agente
não insiste nem troca de produto. A sequência só anda com a compra.

## Como vira instrução

Nenhum bloco novo na fila (`lib/agent-engine/agent/blocos-do-turno.ts`):

- `blocoDaOfertaDoCatalogo` ocupa o lugar do bloco de **preço** no turno de quem tem
  um produto na vez. Traz um produto, o valor e o link, e o molde contido de sempre:
  uma vez só, sem prazo, sem dizer que o que ela comprou não funciona sem este.
- `blocoDaEntregaNaConversa` soma-se ao bloco de **entrega** quando a **última**
  compra é um produto de entrega na conversa, por até 7 dias. Diz o que pedir antes e
  que a entrega não se refaz. Entrega em aberto vem antes de qualquer oferta.

O piso da trava de promessas do turno passa a ser o valor do produto da vez.

## A compra

`lib/pagamentos/compra-cakto.ts`: um produto de entrega na conversa só vai para o
fluxo que o declara. Sem fluxo próprio, não é inscrito em nenhum — o fluxo geral é a
entrega de outro produto, e quem pagou uma leitura receberia o material errado. A
entrega acontece quando a pessoa escreve.

## Rota, permissão e auditoria

- `GET /api/v1/ai/agents/:id/catalogo` (manager+) — o catálogo salvo, mesmo desligado,
  e `faltas`: por produto, o que falta para ele ser oferecido (a mesma regra do turno).
- `PUT /api/v1/ai/agents/:id/catalogo` (admin) — valida, desce o piso da trava de
  promessas até o produto mais barato **antes** de salvar (se a trava recusar, nada é
  salvo) e grava por merge em `ai_agents.config.catalog`.
- Auditoria `ai.catalog_updated`: quantos produtos, quantos ligados, quantos na
  conversa e o menor valor. Nunca o nome de um produto nem o link.

Vale a partir do próximo turno, sem publicar versão.

## O que ainda não foi provado

- Nenhuma compra real passou por este caminho.
- O efeito das instruções no modelo não foi medido no painel de Teste.
- A tela foi provada por teste de componente, não por navegador em ambiente fresco.
