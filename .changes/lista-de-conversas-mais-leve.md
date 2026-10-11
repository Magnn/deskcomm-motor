---
impacto: nada_mudou
secao: corrigido
titulo: A lista de conversas e os contadores da caixa de entrada pesam muito menos no banco
---

Com alguns milhares de conversas, cada atualização da caixa de entrada fazia o banco
conferir a permissão de leitura conversa por conversa. Com a tela aberta em mais de
uma aba, isso ocupava todas as conexões do banco: as telas ficavam lentas, sessões
caíam e mensagens recebidas podiam deixar de ser gravadas.

Agora, para quem enxerga todas as conversas da organização — administrador, gestor e
leitor —, a permissão é conferida uma vez por consulta. Medido numa instalação com
2.217 conversas, essa conferência caiu de 170 ms para menos de 2 ms.

Quem vê o quê não muda. Para o papel de atendente, que só vê as próprias conversas e
a fila, a conferência continua sendo feita conversa por conversa, como antes.
