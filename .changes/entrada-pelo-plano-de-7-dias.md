---
impacto: capacidade_nova
secao: adicionado
titulo: Plano de 7 dias vendido direto na página, com créditos de boas-vindas
---

A área do cliente ganha uma página de entrada (`/c/<empresa>/plano`) para quem ainda não tem área: a pessoa vê o que vem nos 7 dias, informa nome, e-mail, data de nascimento e o que mais pede atenção, e paga o Plano da Semana com Pix ou cartão (em dólar ou euro fora do Brasil). Pago, a área abre na própria página, já logada, e a pessoa ganha créditos de boas-vindas (20, ajustável em `plano_semanal.creditos_de_entrada`; só com os créditos ligados).

A entrada é uma por pessoa e não guarda o cartão: nada renova sozinho depois dos 7 dias. Quem já teve plano é mandado para a área.

Requer a migration 0955 (`area_entradas` e o motivo `boas_vindas` dos créditos).
