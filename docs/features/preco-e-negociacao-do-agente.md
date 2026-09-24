# Preço e negociação do agente

Aba **Preço** no detalhe do agente. Três campos e uma trava:

| Campo | O que é | Efeito |
|---|---|---|
| Valor de venda | O que o link de pagamento cobra | O agente só o diz depois de entregar o valor (leitura, no funil da Cigana) |
| Valor de referência (opcional) | O preço cheio | Citado UMA vez, como "valor de referência", sem prazo nem pressão. Exige a declaração `anchor_is_real` |
| Degraus (até 3) | Valores menores, cada um com **cupom ou link** | Oferecidos um por vez, na ordem, só se a pessoa pedir desconto ou disser que está caro. O último é o **mínimo** |

## Por que o degrau leva o cupom ou o link

O agente não muda o que o checkout cobra. "Fica R$ 110" com um link de R$ 130 é uma promessa que o
pagamento desmente. Por isso o schema (`lib/preco/tipos.ts`) recusa degrau sem `coupon_code` nem
`payment_url` (https). Na Cakto, crie um cupom por degrau (ou um link com o valor) e informe aqui.

## O que acontece no turno

1. `lerPricing(config)` lê `ai_agents.config.pricing`; desligado ou inválido = `null` = o agente **não negocia**.
2. `blocoDePreco` (`lib/preco/bloco-do-prompt.ts`) monta o texto e o turno o anexa depois do prompt do
   agente (`inbound-turn.ts`). Mudar o valor na tela vale no PRÓXIMO turno, sem publicar versão.
3. A trava de promessas (`lib/agent-engine/guardrails/promise/`) é a rede de segurança: ao salvar, o
   piso vira `minPriceCents` (e o teto de desconto, arredondado para baixo, `maxDiscountPercent`).
   Mensagem que cita valor abaixo do mínimo é vetada antes de sair.

## Honestidade da âncora

Um "de R$ X por R$ Y" cujo X nunca foi praticado é desconto falso (publicidade enganosa, CDC art. 37).
A tela pede a confirmação e a rota (`PUT /api/v1/ai/agents/:id/pricing`) recusa sem ela; a
declaração fica em `api_audit_log` (`ai.pricing_updated`, campo `anchor_declared_real`). O bloco
proíbe prazo, "só hoje", vaga e cupom que não esteja configurado.

## Limites conhecidos

- A trava de promessas é da **organização**, não do agente: o piso vale para todos os agentes dela.
  Um produto mais barato vendido por outro agente da mesma organização seria vetado.
- Desligar a política (`enabled: false`) para o agente de negociar, mas **não remove** a trava.
- O veto detecta valores escritos como `R$ 90` ou `90 reais`; valor por extenso não é lido.
- A trava lê QUALQUER valor em reais da mensagem, não só o preço do trabalho: citar "uma vela de R$ 5" (ou qualquer valor abaixo do mínimo) também é vetado. Peça ao agente para não citar preço de material.
- Só o admin salva (`PUT`), e o `PATCH` genérico do agente não escreve `config.pricing`.

## Onde vive

| Peça | Arquivo |
|---|---|
| Schema, piso, leitura | `lib/preco/tipos.ts` |
| Texto para o agente | `lib/preco/bloco-do-prompt.ts` |
| Piso → trava de promessas | `lib/preco/sincronizar-piso.ts` |
| API | `app/api/v1/ai/agents/[id]/pricing/route.ts` |
| Tela | `app/app/ai/agents/[id]/_components/PrecoDoAgente.tsx` |
