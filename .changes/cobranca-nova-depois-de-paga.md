---
impacto: nada_mudou
secao: corrigido
titulo: Depois de um pagamento, a cobrança seguinte sai com Pix e link novos
---

A cobrança criada na conversa era reaproveitada por uma hora (a mesma chave de idempotência na Stripe). Quem
pagava uma pergunta e pedia outra na mesma hora recebia o mesmo código já pago e o mesmo link já usado, que a
Stripe mostra como "The link is no longer active". Agora cada pagamento conta na referência, e a cobrança
seguinte é outra.
