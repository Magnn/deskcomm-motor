---
impacto: nada_mudou
secao: corrigido
titulo: O Radar volta a mostrar os negócios com retorno agendado, o nome do contato e o atalho da conversa
---

Na tela do Radar, as leituras de retornos agendados, conversas e nomes de contato eram feitas com
todos os contatos da tela num pedido só e falhavam em silêncio quando a lista passava de algumas
centenas: o contador "em voo" ficava em zero e os cartões apareciam sem nome e sem o atalho para a
conversa. As leituras passam a ir em lotes, e uma falha deixa de ser tratada como lista vazia.
