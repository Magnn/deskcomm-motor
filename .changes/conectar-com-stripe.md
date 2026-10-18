---
impacto: capacidade_nova
secao: adicionado
titulo: Cada empresa conecta sua Stripe e recebe as vendas na própria conta
---

Em Configurações › Pagamentos, a empresa clica em "Conectar com Stripe", preenche o cadastro na
própria Stripe e volta. A partir daí o Pix, o boleto e o link de cartão que o agente envia
nascem na conta Stripe da empresa: o dinheiro cai no banco dela, e reembolsos e contestações
ficam com a conta dela. A instalação pode cobrar uma taxa fixa por venda paga
(`STRIPE_CONNECT_TAXA_CENTAVOS`, em centavos), descontada pela Stripe na própria cobrança e
mostrada na tela antes de conectar.

A taxa fixa vale para cobranças em reais. Vendas em dólar ou euro continuam sem taxa da plataforma
até que exista uma regra de conversão; cobrança menor ou igual à taxa também segue sem ela.
Pausar a conexão impede novas cobranças e preserva a confirmação das já emitidas.

Para oferecer o botão, a instalação precisa da `STRIPE_PLANS_SECRET_KEY` e do Connect ativado na
sua conta Stripe (Painel › Connect, modelo "Plataforma"). O aviso de pagamento das contas
conectadas é registrado na Stripe sozinho, na primeira conexão. Quem já usa a chave colada
continua igual.
