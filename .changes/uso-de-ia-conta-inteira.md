---
impacto: nada_mudou
secao: corrigido
titulo: A tela Uso de IA mostra a conta inteira — e quantos tokens a IA leu e escreveu
---

A tela Uso de IA contava no máximo as 1.000 chamadas mais antigas do período e apresentava esse recorte como o total. Numa instalação com 177 mil chamadas em 30 dias, ela mostrava "1.000" e menos de um dólar de custo. Agora a soma é feita no banco e o período aparece inteiro.

A tela ganhou três números — tokens lidos pela IA, tokens escritos e quanto da leitura o fornecedor reaproveitou com desconto — e uma tabela "Para onde foram os tokens", que separa o consumo por finalidade (responder o cliente, resumir a conversa, conferir promessas e assim por diante).

Dois erros de custo foram corrigidos junto. Os modelos da DeepSeek não tinham preço cadastrado, então as chamadas deles entravam com custo zero e o limite de orçamento não as enxergava; agora têm, incluindo o desconto do trecho repetido e o preço dobrado no horário de pico do fornecedor. E a leitura de clima da conversa arredondava cada chamada para um centavo, o que inflava o gasto do mês em dezenas de vezes.

As chamadas antigas não são recalculadas pela atualização: o custo correto vale para as novas. O gráfico de gasto por dia também passa a dizer que os valores estão em dólar.
