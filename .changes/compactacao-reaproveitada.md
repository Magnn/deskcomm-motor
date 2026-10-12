---
impacto: nada_mudou
secao: corrigido
titulo: Conversa longa não refaz mais o resumo inteiro a cada resposta
---

Depois da 40ª mensagem de uma conversa, o agente refazia em toda resposta a extração de notas e o resumo da conversa inteira: duas chamadas de IA e cerca de nove segundos de espera, embora o resumo já fosse atualizado no fim de cada resposta. Medido em um dia: 2.568 compactações em 5.261 respostas.

Agora o resumo só é refeito quando chegaram pelo menos 24 mensagens novas desde a última vez. No intervalo, o agente usa o resumo que já está guardado. As respostas em conversa longa ficam mais rápidas e o gasto com IA cai.
