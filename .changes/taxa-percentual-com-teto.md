---
impacto: capacidade_nova
secao: alterado
titulo: A taxa da plataforma por venda pode ter parte percentual e teto
---

Além do valor fixo (`STRIPE_CONNECT_TAXA_CENTAVOS`), a taxa das vendas das empresas que usam
"Conectar com Stripe" pode ter uma parte percentual (`STRIPE_CONNECT_TAXA_PERCENTUAL_BP`, em
pontos-base: 150 = 1,5%) e um teto por venda (`STRIPE_CONNECT_TAXA_TETO_CENTAVOS`). Ex.:
R$ 0,99 + 1,5%, no máximo R$ 9,90 — numa venda de R$ 105 a taxa é R$ 2,57. A tela de Pagamentos
mostra a regra inteira antes de conectar. Sem as variáveis novas, nada muda.
