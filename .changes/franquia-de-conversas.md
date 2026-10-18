---
impacto: capacidade_nova
secao: adicionado
titulo: O plano pode ter franquia de conversas, com o excedente cobrado na fatura
---

`PLANS_CATALOG` aceita um 6º campo por plano: quantas conversas atendidas pela IA o ciclo inclui
(ex.: `start:Start:29700:1:9000:300`). Com `STRIPE_PLANS_EXCEDENTE_CENTAVOS` (ex.: 120 = R$ 1,20), o que
passar da franquia entra na próxima fatura da assinatura pela Stripe — o medidor e o preço são criados na
Stripe sozinhos, e um cron de hora em hora informa só as conversas novas além da franquia. A tela de planos
mostra a franquia de cada plano e quanto a empresa já usou no ciclo. Sem as variáveis, nada muda.
Migration 0936 (aditiva).
