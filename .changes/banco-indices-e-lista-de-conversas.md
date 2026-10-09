---
impacto: nada_mudou
secao: corrigido
titulo: Inbox e fila do agente deixam de sobrecarregar o banco
---

Cinco índices novos e uma função reescrita tiram do banco as consultas que varriam tabelas inteiras a
cada execução: a recuperação de silêncio (de 2 s para 63 ms por execução), o resgate de eventos
presos, a conferência de reenvio, a soma de custo do turno e a contagem de envios por contato. A
lista de conversas do Inbox, na sessão de um usuário, cai de cerca de 2 s para 166 ms. Nada muda na
tela; a atualização aplica tudo sozinha.
