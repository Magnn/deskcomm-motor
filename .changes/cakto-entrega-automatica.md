---
impacto: capacidade_nova
secao: adicionado
titulo: A compra aprovada na Cakto inicia a entrega do trabalho sozinha, e reembolso e chargeback a param
---

O endereço de captação de leads (`/api/v1/webhooks/in/<token>`) agora entende o aviso de pagamento
da Cakto. Numa compra aprovada (`purchase_approved`) o CRM acha a pessoa pelo telefone do checkout
(ou pelo e-mail), marca `pago`, `produto:<trabalho>` e `compra:<pedido>`, anota na linha do tempo,
**tira a pessoa dos follow-ups de recuperação** (quem pagou não recebe "quer continuar?") e a
inscreve no fluxo publicado cujo nome começa por "Entrega". A mensagem da entrega quem escreve é o
agente, dentro da janela de 24h e da cadeia de guardrails. Reenvio do mesmo aviso não entrega duas
vezes; reembolso e chargeback marcam a pessoa e param os fluxos; Pix gerado e abandono de checkout
só ficam no registro do webhook. Compra de quem nunca falou no WhatsApp não tem janela aberta e
fica para uma pessoa.

A Cakto não assina o corpo com HMAC: ela devolve o segredo que você digitou ao criar o webhook, dentro do
próprio corpo. Este ramo confere esse segredo com o da fonte (em tempo constante), recusa tudo se a
fonte não tem segredo e não grava o segredo no log. A ação de auditoria é `webhook.cakto_evento_aplicado`.
Sem migration.
