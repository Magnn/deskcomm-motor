---
impacto: capacidade_nova
secao: corrigido
titulo: Dashboard — o gasto de anúncio é lido da Meta e as vendas pelo link de pagamento entram no faturamento
---

O dashboard deixa de mostrar zero onde ele não sabia a resposta.

- **Gasto Meta (Ad)** agora é o gasto real da conta de anúncios conectada, no período escolhido. Antes era sempre R$ 0,00. Se a conta não está conectada, se falta escolher a conta ou se a Meta não respondeu, o cartão mostra "—" e diz o que fazer, em vez de zero.
- **ROAS** e **Lucro** passam a usar esse gasto. Sem gasto conhecido não há ROAS (aparece "—"), e o lucro avisa que não está descontando anúncio.
- **Faturamento, vendas, ticket médio e conversão** passam a somar as vendas que chegam pelo link de pagamento (Cakto), além das registradas na comanda. Venda estornada ou com chargeback sai da conta.

O gasto de anúncio aparece para gestores e administradores. Conta de anúncios em outra moeda aparece na moeda dela e não entra no ROAS nem no lucro.
