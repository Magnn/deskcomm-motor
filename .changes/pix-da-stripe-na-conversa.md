---
impacto: capacidade_nova
secao: adicionado
titulo: Pix copia e cola na conversa, no valor negociado, pela Stripe
---

Quem recebe o link de pagamento precisa preencher cadastro antes de pagar, e muita gente
para ali. Agora dá para conectar uma conta da Stripe em Configurações › Pagamentos (um
campo: a chave). Com ela conectada, quando o agente envia o link de pagamento, a pessoa
recebe também o Pix copia e cola no mesmo valor — o valor que a negociação liberou —, sem
cadastro. O link continua indo junto, para quem prefere cartão.

O pagamento é confirmado sozinho: o contato é marcado como pago, o valor entra no negócio
e na receita, e a entrega do produto começa, como já acontece com o checkout. Se a Stripe
estiver fora ou o Pix não estiver ativo na conta, a pessoa recebe só o link, como antes.

A configuração de preço do agente ganha os links do valor cheio por produto
(`list_product_links`); por enquanto esse campo não tem tela.
