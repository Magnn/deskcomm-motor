---
impacto: nada_mudou
secao: corrigido
titulo: Quando o cliente manda duas mensagens seguidas, o agente responde uma vez só, às duas
---

Se o cliente mandava uma segunda mensagem enquanto o agente ainda preparava a resposta
da primeira, saíam duas respostas: uma para a primeira mensagem e, logo depois, outra
que lia a conversa inteira e repetia boa parte do que já tinha sido dito, às vezes
com a mesma pergunta.

Agora, quando chega mensagem nova no meio da resposta e ela já tem a sua vez na fila,
a resposta que estava sendo preparada não é enviada. A seguinte lê as duas mensagens e
responde uma vez.

Se a resposta já tinha começado a sair, ela termina normalmente. E se por qualquer
motivo não houver outra resposta na fila, a primeira é enviada como antes: o cliente
nunca fica sem resposta por causa desta regra.
