---
impacto: capacidade_nova
secao: adicionado
titulo: Oferta proativa — o agente oferece sozinho, uma vez por dia, o produto que cabe em quem já conversou
---

Com `followup.oferta_proativa` ligado na versão publicada do agente, quem já conversou e esfriou recebe no
máximo uma oferta por dia, escolhida por uma lista curta de regras (quem comprou ou não, o que o agente já
disse, o que a pessoa contou, o que ela já tem). O agente escreve a mensagem, ou decide não enviar.

O ritmo é da organização (`espaco_segundos`, padrão 120 s entre duas ofertas; `maximo_por_dia`, padrão 60),
dentro de uma faixa do dia no fuso dela. Ficam de fora: conversa viva, fluxo em andamento, quem pagou nas
últimas 24 h, quem não respondeu a última mensagem das últimas 6 h, e quem disse que não quer, que
desconfia, que está sem dinheiro ou em sofrimento. Desligada por padrão: sem a chave, nada muda.
