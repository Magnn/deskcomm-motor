---
impacto: capacidade_nova
secao: corrigido
titulo: A caixa "Início" volta a salvar, e a palavra-chave dela passa a valer para o número vinculado
---

Editar a caixa "Início" de um fluxo impedia salvar e publicar ("Esta caixa ainda não foi configurada por completo"): o formulário gravava origem, evento e palavra-chave, e o servidor só aceitava a caixa vazia. Agora a configuração é aceita, e a origem **WhatsApp** passa a ter efeito de verdade no número vinculado ao fluxo: "Palavra-chave recebida" só abre o fluxo para a mensagem que contém a palavra (sem diferenciar maiúsculas, acentos ou espaços), "Qualquer mensagem recebida" abre sempre, e "Primeiro contato" abre só na primeira mensagem do contato. Mensagem que não abre o fluxo fica no inbox, sem resposta automática. As outras origens (CRM, webhook, plataformas de pagamento) ainda não disparam por esta caixa: a caixa avisa, e a publicação recusa dizendo por quê.

O fluxo do número vinculado também dá o primeiro passo na hora em que a mensagem chega, em vez de esperar o relógio de um minuto. Fluxos já publicados com a caixa "Início" vazia continuam como estavam (qualquer mensagem abre). Não há ação para quem opera a VPS.
