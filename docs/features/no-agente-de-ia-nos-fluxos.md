# O nó "Agente de IA" nos Fluxos

Um agente de IA **já configurado** (abas Identidade, Oferta, Objeções, Limites, Preço…) passa a ser
um passo do construtor de fluxo: o dono do fluxo escolhe o agente, escreve o **objetivo** ("agendar uma
visita") e, a partir dali, é o agente quem conduz a conversa, turno a turno, até uma de três saídas.
É o que faz o Desk deixar de ter "um agente OU um fluxo" e passar a ter **agentes dentro de fluxos**.

**Estado: em construção, em quatro fatias.** Cada fatia é um PR e nenhuma quebra o que já roda.

| Fatia | O que é | Estado |
|---|---|---|
| 1 | O status `com_agente` da inscrição (migration `0901` + código) | mesclada; a migration **não** está aplicada no banco de produção |
| 2 | Esquema do nó, publicação e simulador | **esta** — o nó existe no grafo, mas **não publica** |
| 3 | O motor: o turno conduzido pelo fluxo, o bloco `fluxo` no prompt e a ferramenta `concluir_etapa` | pendente (exige a migration `0901` aplicada) |
| 4 | O editor: paleta, painel de configuração e o seletor de agente | pendente |

## O nó

| Campo | Regra |
|---|---|
| `agent_id` | o agente escolhido (UUID). O UUID nulo é "ainda não escolhi": o rascunho salva, o **publish** recusa |
| `objetivo` | o que o agente deve conseguir (≤500). Texto do dono do fluxo: entra no prompt como **dado**, numa linha, sem aspas duplas |
| `max_turnos` | quantas respostas o agente dá antes da saída "limite" (1–30, padrão 10) |
| `silencio_minutos` | quanto a pessoa pode ficar sem responder antes da saída "silêncio" (5–1440, padrão 60) |

Sem campo de modelo, de prompt nem de ferramentas por nó **de propósito**: tudo isso é do agente,
configurado uma vez nas abas dele. Um seletor por nó duplicaria a configuração e a faria divergir.
O schema é estrito e recusa esses campos.

### As três saídas (fixas)

`concluiu` (cumpriu o objetivo), `limite` (gastou os turnos) e `silencio` (a pessoa sumiu), mais o
escape `else`, que o editor desenha em todo nó mas que **não é cobrado** aqui: as três saídas esgotam
o que o motor produz. Quando uma **pessoa da equipe assume** a conversa, quem manda é a política de
transferência (`handoff_policy`) do ponteiro do fluxo, não uma saída do nó.

## Publicação

O validador (`lib/followup/validate-publish.ts`) é uma função pura; o que só o banco sabe chega em
`ContextoDoPublish.agentes` (`carregaAgentesCitados`, `lib/followup/agentes-citados.ts`, sempre
filtrado pela **organização**, porque o `agent_id` vem do grafo e nunca é confiável sozinho).

- `no_em_construcao` — **enquanto o motor não existe, o nó não publica.** Fica em `NOS_EM_CONSTRUCAO`,
  fora de `NOS_DA_SUPERFICIE` (a paleta do editor é derivada dela, então a tela não o oferece). Quando o
  motor entrar (fatia 3), o tipo sai da lista e entra na superfície, no mesmo PR;
- `agente_nao_escolhido` — o UUID nulo do canvas;
- `agente_indisponivel` — o agente não existe nesta organização, foi arquivado, é do tipo antigo
  (`rag_bot`, que não conduz conversa em fluxo) ou não tem versão publicada;
- `missing_branch_edge` (com o `branch_id`) — cada uma das três saídas precisa levar a algum lugar;
- o agente conta como **espera** para o ciclo (`cycle_without_wait`): ele espera a pessoa por
  `silencio_minutos` (piso 5 min).

## O simulador

O agente é **caixa-preta** no simulador: rodá-lo custaria dinheiro e, se algo escapasse, tocaria a
conversa de quem está sendo atendido. Ao chegar no nó a simulação **para** e o operador escolhe por
qual das três saídas seguir (`saida_do_agente`); "sem resposta" vale como silêncio; uma mensagem
digitada não avança (o agente ainda estaria conduzindo). O painel (fatia 4) ainda não desenha essas
escolhas; a lógica já é testada em `lib/followup/no-agente.test.ts`.

## O motor, enquanto não existe

`processNode` devolve `fail` com o motivo para um nó `agent`. É uma rede de segurança, não um
caminho: o publish já recusa o nó, então nenhuma inscrição chega lá. A alternativa — avançar sem o
agente — mandaria a pessoa por uma saída que ninguém percorreu.

## A tela de leitura

O resumo do nó no dossiê (`resumoDoNo`) diz só "um agente de IA conduz a conversa (até N respostas)":
**nem o objetivo nem o agente**. O dossiê é lido por qualquer membro (`viewer`), e o objetivo é
instrução que o dono do fluxo escreveu para o agente.

## Provas

`lib/followup/no-agente.test.ts` (30 testes: schema, saídas, publicação, carregador, simulador, motor e
a projeção de leitura). Oito mutações — o gate de "em construção", a organização na consulta, o agente
arquivado, a cobertura das saídas, a mensagem digitada no simulador, o motor avançando em vez de falhar,
o resumo vazando o objetivo e o schema deixando de ser estrito — caem nos testes certos.
