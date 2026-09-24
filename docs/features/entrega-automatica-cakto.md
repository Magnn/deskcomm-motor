# Entrega automática: compra na Cakto → entregável personalizado

Do pagamento à entrega, sem uma pessoa no meio:

```
Cakto: purchase_approved ──► /api/v1/webhooks/in/<token>   (segredo do corpo conferido)
   └─► lib/pagamentos/compra-cakto.ts
        1. acha a pessoa (telefone do checkout → e-mail)          ── sem contato: vai para uma pessoa
        2. marca pago · produto:<trabalho> · compra:<pedido>       ── a marca do pedido é a idempotência
        3. anota na linha do tempo do lead
        4. PARA os follow-ups vivos (recuperação)                  ── antes de começar a entrega
        5. inscreve no fluxo publicado "Entrega…"                  ── ai_message: quem escreve é a agente
```

A agente então lê a tag `produto:*`, consulta no conhecimento "Entregável: regras gerais" e o guia do trabalho
comprado, **personaliza com o que a pessoa contou** (situação, restrições, tempo) e entrega uma etapa por vez.
Um check-in no dia seguinte fecha o fluxo.

## Contrato da Cakto (docs.cakto.com.br/webhooks)

`{ secret, event, data: { id, refId, customer: { name, email, phone, birthDate }, offer, product: { id, name }, status, amount, paymentMethod, paidAt } }`.
Eventos: `purchase_approved`, `purchase_refused`, `pix_gerado`, `boleto_gerado`, `picpay_gerado`, `refund`, `chargeback`,
`subscription_canceled`, `subscription_renewed`, `checkout_abandonment`. A Cakto pede resposta 200 rápida.
`birthDate` não é lido.

## O que configurar

1. **Fonte de webhook** (Webhooks › nova fonte): copie o endereço `/api/v1/webhooks/in/<token>` e **defina um segredo**
   — sem segredo a fonte recusa todo aviso da Cakto.
2. **Cakto**: Integrações › Webhooks → cole o endereço, o **mesmo segredo** e marque os eventos de compra, reembolso e chargeback.
3. **Fluxo de entrega**: um follow-up publicado cujo nome começa por `Entrega`, e o agente com esse fluxo em `followup.flow_pointer_ids`.
4. **Conhecimento**: os guias "Entregável: …" ligados ao agente.

## Limites conhecidos

- **Sem conversa, sem entrega automática.** Quem paga sem nunca ter escrito no WhatsApp não tem janela de 24h aberta;
  mensagem fora dela exige template aprovado pela Meta. O resultado é `contato_nao_encontrado` e uma pessoa cuida.
- **Telefone do checkout ≠ WhatsApp.** O cruzamento é pelo telefone e depois pelo e-mail; se nenhum bater, cai no caso acima.
- **Um follow-up vivo por pessoa** (índice único): por isso a compra PARA os vivos antes de inscrever a entrega.
- **Cupom.** O aviso pode trazer `coupon`; é gravado na última compra e na nota, para conferir o desconto dado.
