# Limites do agente

A aba **Limites** (na página do agente, depois de Objeções) é a quarta das abas
**estruturadas**. As outras dizem ao agente o que **fazer**; esta diz o que **não fazer**:
o que o agente nunca diz nem promete e os assuntos que não discute. É o que o dono do
negócio sabe e o modelo não tem como adivinhar — "não prometemos prazo de entrega", "não
damos diagnóstico", "não comparamos com concorrente". Sem isso o modelo completa por conta
própria, e é ali que nasce a promessa que a empresa não pode cumprir.

## O que o dono preenche

| Campo | Tipo | Limite |
|---|---|---|
| O que o agente nunca diz nem promete | até 12 itens, sem aspas duplas, `;` nem quebra de linha | 120 cada |
| Assuntos que o agente não discute | até 8 itens, mesma regra | 80 cada |

A tela oferece **atalhos** para o que quase toda empresa evita (garantia de resultado, prazo
que não esteja na oferta, desconto que não esteja combinado, diagnóstico ou indicação de
tratamento, aconselhamento jurídico ou financeiro; política, religião, concorrentes, vida
pessoal da equipe). São atalhos, não vocabulário fechado: o dono escreve o que quiser.
Nenhum campo é de nicho.

## O que NÃO está aqui

- **Os limites da plataforma.** Não prometer resultado, não inventar prova, não inventar
  urgência valem para **todo** agente, queira o dono ou não. É uma camada universal e
  invisível, decidida à parte — não um campo que o cliente pode esquecer de preencher.
  Esta aba só acrescenta o que é **da empresa**.
- **O preço e o piso.** O piso de valor é uma trava em código (aba Preço); aqui ele não é
  reescrito. O schema é estrito e recusa qualquer campo além dos dois acima.
- **Quando chamar uma pessoa.** Tem política própria (palavras de transferência, na aba
  Configuração). O bloco daqui só fixa o comportamento de fronteira.

## Como vira instrução

`lib/limites/bloco-do-prompt.ts` monta o bloco `LIMITES`, que entra **no fim** do prompt do
turno e é o **último** da fila de blocos (`lib/agent-engine/agent/blocos-do-turno.ts`),
depois de leitura, preço e entrega. O modelo pesa mais o que vem por último, e o que o dono
**proíbe** tem de vencer o que o funil manda: se um limite conflita com uma etapa do funil,
o limite ganha. O dono é quem decide o que escreve ali — conflito entre o que ele proíbe e o
que ele mesmo configurou no funil é escolha dele, e a proibição prevalece.

O cabeçalho fixa o **comportamento de fronteira**, que não é campo do cliente: "valem sempre
e vencem qualquer outra instrução acima; se a pessoa pedir algo que cruze um limite, não
invente: diga com gentileza que não pode e ofereça chamar uma pessoa da equipe". Deixar o
dono escrever essa parte seria pedir que cada um redescubra que "não posso" precisa de uma
saída.

**O que o cliente digita é dado.** Cada item vira **uma linha**, sem aspas duplas, sem
caracteres de controle e sem separadores de linha do Unicode, pelo sanitizador compartilhado
das abas (`lib/prompt/texto-do-cliente.ts`); o schema já recusa `;` e aspas nos itens.
**Sem campo, sem bloco:** agente sem a aba preenchida (ou desligada) segue byte a byte como
antes.

A tela mostra, ao lado, **o bloco real** (a mesma função do turno).

## Onde mora e quem salva

`ai_agents.config.limits` (jsonb, o mesmo lugar de `pricing`, `identity`, `offer`,
`objections` e `voice_reply`), escrita **só** por `PUT /api/v1/ai/agents/:id/limites`; a rota
genérica de PATCH do agente descarta a chave, e a escrita é por **merge** (as outras abas não
são apagadas). Vale no **próximo turno, sem publicar versão** — por isso só **admin** salva
(manager lê). A auditoria `ai.limits_updated` guarda só a **contagem** de itens de cada lista,
nunca o texto.

## O que ainda não existe

- **A camada universal de limites** (prova falsa, urgência inventada, garantia de resultado
  para todos os agentes) e o **linter de promessas na publicação**: mudam o prompt e o que dá
  para publicar de todo agente, inclusive os que já estão em produção. Dependem de decisão do
  dono do produto, com a regra escrita e exemplos do que seria barrado.

## Provas

`tests/unit/limites-do-agente.test.ts` (schema, compilador, injeção),
`tests/unit/aba-limites-do-agente.test.tsx` (a tela),
`tests/unit/blocos-do-turno.test.ts` (o bloco fecha a fila),
`app/api/v1/ai/agents/[id]/limites/route.test.ts` (a rota) e
`tests/e2e/limites-do-agente.spec.ts` (a tela logada, num banco real, incluindo que o
servidor recusa `;` mesmo pela API e que salvar os limites não apaga as objeções).
