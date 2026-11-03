---
impacto: exige_acao
secao: adicionado
titulo: O Plano da Semana renova sozinho no cartão, com cancelamento de um toque
---

Quem paga o Plano da Semana no cartão não precisa voltar toda semana: o cartão fica guardado na conta Stripe da empresa e a semana seguinte é cobrada 12 horas antes de vencer, no mesmo valor e na mesma moeda. A tela diz isso antes do pagamento, mostra "Renova sozinho em" com a data e tem o "Cancelar renovação" de um toque (a semana já paga continua valendo). Cartão recusado tenta de novo no dia seguinte; na terceira recusa seguida a renovação desliga. No Pix, a pessoa continua pagando semana a semana.

## Requer atenção

Aplique a migration 0954 e reinicie o agendador (`scheduler`) para ele ler a rodada nova `area-planos`.
