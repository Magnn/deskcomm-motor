---
impacto: capacidade_nova
secao: corrigido
titulo: A caixa Fim com «Ao finalizar: IA» agora passa a conversa para a agente
---

A opção «Ao finalizar: IA» da caixa Fim existia no construtor, mas o fluxo de acompanhamento a ignorava: a inscrição terminava e ninguém mais falava com a pessoa. Agora, quando o fluxo termina nessa caixa e a última mensagem foi nossa (a pessoa parou de responder), a agente recebe um turno com a instrução escrita na caixa, só se a pessoa escreveu nas últimas 24 horas. Quando a última palavra é da pessoa, a agente já respondia a ela, e segue respondendo uma vez só.
