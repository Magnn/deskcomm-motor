---
impacto: nada_mudou
secao: corrigido
titulo: A memória do agente não para quando enche, e mensagem vencida na fila é encerrada
---

Quando o índice de notas de um lead chegava ao limite, a nota nova era recusada e a memória daquele
lead parava no que foi dito nas primeiras conversas. Agora o agente vê as notas já guardadas ao
resumir a conversa, junta o que é repetido e, se ainda não couber, as notas mais antigas dão lugar à
nova. Mensagem automática que fica mais de 24 horas na fila sem sair passa a ser marcada como falha,
com o motivo, em vez de ficar presa indefinidamente; ela não é reenviada.
