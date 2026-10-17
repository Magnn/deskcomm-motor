---
impacto: nada_mudou
secao: alterado
titulo: A assinatura dos planos aparece na fatura do cartão com o nome da marca da instalação
---

Quando a mesma conta Stripe cobra os planos do sistema e outras vendas, quem assinava lia na
fatura o nome padrão da conta e podia não reconhecer a cobrança. Agora o produto de cada plano
é criado com o nome da marca da instalação como nome no extrato (ex.: "ACASSIA"). Vale para os
planos criados a partir desta versão; nome que não cabe nas regras da Stripe (5 a 22 letras
latinas) fica de fora e vale o da conta. Nada a fazer na instalação.
