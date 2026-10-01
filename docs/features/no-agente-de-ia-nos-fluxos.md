# O nó "Agente de IA" nos Fluxos

Um agente de IA **já configurado** (abas Identidade, Oferta, Objeções, Limites, Preço…) passa a ser
um passo do construtor de fluxo: o dono do fluxo escolhe o agente, escreve o **objetivo** ("agendar uma
visita") e, a partir dali, é o agente quem conduz a conversa, turno a turno, até uma de três saídas.
É o que faz o Desk deixar de ter "um agente OU um fluxo" e passar a ter **agentes dentro de fluxos**.

**Estado: em construção, em quatro fatias.** Cada fatia é um PR e nenhuma quebra o que já roda.

| Fatia | O que é | Estado |
|---|---|---|
| 1 | O status `com_agente` da inscrição (migration `0901` + código) | mesclada; a migration **não** está aplicada no banco de produção |
| 2 | Esquema do nó, publicação e simulador | mesclada — o nó existe no grafo, mas **não publica** |
| 3 | O motor: chegada, turno conduzido, bloco `fluxo`, ferramenta `concluir_etapa`, limite e silêncio | **esta** — o motor roda, mas o nó continua **sem publicar**; exige as migrations `0901` e `0902` aplicadas |
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
- saída sem aresta **não reprova mais**: o lead que sai por ela FICA no agente (`node_parked`, com o motivo) até alguém ligar a saída — o funil só avança até onde foi montado;
- o agente conta como **espera** para o ciclo (`cycle_without_wait`): ele espera a pessoa por
  `silencio_minutos` (piso 5 min).

## O simulador

O agente é **caixa-preta** no simulador: rodá-lo custaria dinheiro e, se algo escapasse, tocaria a
conversa de quem está sendo atendido. Ao chegar no nó a simulação **para** e o operador escolhe por
qual das três saídas seguir (`saida_do_agente`); "sem resposta" vale como silêncio; uma mensagem
digitada não avança (o agente ainda estaria conduzindo). O painel (fatia 4) ainda não desenha essas
escolhas; a lógica já é testada em `lib/followup/no-agente.test.ts`.

## O motor (fatia 3)

Quem conduz a conversa é o **turno**, não o relógio. O relógio só decide o silêncio.

1. **Chegada.** `processNode` no nó `agent`, com a inscrição `active`, a estaciona em `com_agente` com o prazo de
   silêncio (`silencio_minutos`) como relógio. **O agente não abre a conversa**: assume quando a pessoa responde. Para
   abrir, o dono do fluxo põe uma caixa de **Mensagem antes** do agente — o fluxo fala, o agente conduz o que vem depois,
   e não nasce um segundo caminho de envio com as suas travas.
2. **Quem atende.** No degrau 0 do resolvedor do turno (`resolveTurnAgent`), acima da campanha e do roteador, o agente
   do nó atende (`outcome: 'fluxo'`). **Falha aberta**: agente sem versão publicada, ou erro ao ler o fluxo, seguem a
   régua normal — e o erro de leitura não vira "o roteador quebrou".
3. **O turno.** Só na resposta à pessoa e fora do painel de Teste, `carregarAgenteDoFluxo` traz o objetivo e as
   respostas restantes; o bloco `FLUXO` entra na fila (depois do estilo, antes de leitura/preço/entrega/limites) e a
   ferramenta `concluir_etapa` existe **só neste turno**. Na última resposta o bloco pede um fechamento gentil.
4. **As três saídas.**
   - **Cumpriu** — o agente chama `concluir_etapa`; `encerrarAgenteNoFluxo` move a inscrição num comando SQL só, que
     exige `com_agente`, o mesmo nó, o mesmo passo e nenhum lease de tick; quem chega depois recebe "etapa já
     encerrada", não um erro.
   - **Limite** — depois de o envio dar certo, o turno é contado (idempotente pela mensagem que o motivou, pelo índice
     único de eventos) e, ao atingir `max_turnos`, a inscrição sai pela mesma função. `>=`, e não `===`.
   - **Silêncio** — o prazo vence, o claim acorda a inscrição e `processNode` a leva pela saída de silêncio. Cada
     resposta do agente **renova** o prazo.
5. **Uma pessoa assume a conversa:** quem manda é a política de transferência do ponteiro, não uma saída do nó.

A contagem de respostas é **por passo** (`steps_taken` da inscrição): duas visitas ao mesmo nó, num laço, não somam.
Falha de contagem ou de leitura **nunca derruba o turno**: a resposta já saiu, e o relógio de silêncio pega o resto.

### O defeito que o Postgres de verdade achou (migration 0902)

O guarda de agenda (`fn_appointment_enrollment_current`, 0224) só reconhecia `active` e `waiting_reply`. O tick o
chama em toda inscrição que reclama, então uma `com_agente` **vencida** era cancelada com "Atendimento encerrado ou
substituído" em vez de sair pelo silêncio. Nenhum teste de TypeScript alcança isso (o guarda mora em SQL); apareceu ao
ligar o motor num banco real. A mesma sonda mostrou que uma inscrição **`dormente`** (espera longa imune, 0308) vencida
é cancelada pelo mesmo caminho — defeito anterior à 0901. A 0902 passa a lista para os quatro status com relógio.

**`fn_appointment_recover` (no-show) — fechado pela 0903.** A checagem de "outro fluxo vivo" daquela função não
listava `com_agente`, mas o `insert` que abriria a nova inscrição já morava num `begin/exception when
unique_violation then result:='other_flow'` — o MESMO bloco que já converte com elegância o conflito para os
outros status vivos. Uma falta com o contato `com_agente` já recebia `other_flow`, só pelo caminho caro
(candidato/ponteiro/versão/agente/nó/fronteira de serviço resolvidos à toa antes da exceção). A 0903 só adianta a
checagem; o resultado não muda. Prova em `tests/invariants/agenda-presenca-recuperacao.test.ts`.

### Enquanto o nó não publica

O publish continua recusando o nó (`no_em_construcao`) e a paleta não o oferece: o editor é a fatia 4, e as migrations
0901/0902 ainda **não estão aplicadas no banco de produção** (aplicar exige autorização do dono). Tudo o que o motor
faz só acontece para uma inscrição `com_agente`, que ninguém consegue criar antes disso.

## A tela de leitura

O resumo do nó no dossiê (`resumoDoNo`) diz só "um agente de IA conduz a conversa (até N respostas)":
**nem o objetivo nem o agente**. O dossiê é lido por qualquer membro (`viewer`), e o objetivo é
instrução que o dono do fluxo escreveu para o agente.

## Provas

- `lib/followup/no-agente.test.ts` (fatia 2: schema, saídas, publicação, carregador, simulador, projeção de leitura) e
  `lib/followup/agente-no-fluxo.test.ts` (fatia 3: bloco, contagem, saída atômica, motor), com banco de mentira;
- `tests/invariants/agente-no-fluxo-runtime.test.ts`, **contra um Postgres de verdade** (`pnpm test:db`): o SQL de
  leitura e de escrita, a idempotência pelo índice único, a saída condicionada (segunda chamada, lease vivo, passo
  velho), a **chegada e o silêncio pelo tick de produção**, e a 0902;
- `tests/unit/agente-no-fluxo-fiacao.test.ts` (a costura no `inbound-turn.ts`) e os casos do degrau 0 em
  `resolve-turn-agent.test.ts`;
- mutações que caem nos testes certos: as da fatia 2 e, na 3, a ferramenta fora do `if`, o painel de Teste carregando
  o estado, o limite sem exigir turno novo e a contagem antes de checar o envio.
