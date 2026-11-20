---
impacto: nada_mudou
secao: corrigido
titulo: Resposta vetada pela trava não deixa mais o lead sem resposta na nova tentativa
---
Quando a trava barrava a resposta do agente (por exemplo, preço fora da tabela) e a nova tentativa saía muda, o turno terminava como concluído e o resumo da conversa registrava a fala vetada como dita — no turno seguinte o agente esperava uma resposta a algo que o cliente nunca recebeu. Agora a nova tentativa muda também é refeita pela fila (esgotadas as tentativas, vira aviso na Central) e o resumo não é gravado.
