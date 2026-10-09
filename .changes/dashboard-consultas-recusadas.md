---
impacto: nada_mudou
secao: corrigido
titulo: Dashboard volta a listar as conexões e a preencher a aba Atendimento
---

Quatro consultas do Dashboard pediam colunas ou tabelas que não existem e eram recusadas pelo banco
toda vez, sem aviso na tela: a lista de conexões vinha vazia (e toda venda aparecia em "Canal
Padrão"), e a aba Atendimento mostrava zero em leads atendidos, finalizados e no valor por etapa do
funil. As consultas passam a usar as colunas reais. O tempo médio de primeira resposta fica com o
traço: esse dado ainda não é guardado, e o número antigo nunca chegou a ser calculado.
