---
impacto: nada_mudou
secao: corrigido
titulo: Compra avulsa paga pela Stripe é liberada na reentrega do aviso
---

Quando o aviso de pagamento de uma compra avulsa (leitura, presente, plano, Círculo) gravava a receita mas caía antes de liberar a compra na área do cliente, a reentrega da Stripe respondia "repetida" e a compra nunca era liberada. Agora a reentrega refaz a liberação, que confere o id do pagamento e não repete efeito. A conversão do anúncio, o novo turno do agente e a auditoria continuam acontecendo uma vez só.
