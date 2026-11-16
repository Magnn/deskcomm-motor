---
impacto: capacidade_nova
secao: adicionado
titulo: O agente se apresenta pelo nome do perfil de cada número
---

Quando o mesmo agente atende vários números, ele se apresenta pelo nome do perfil do WhatsApp do
número em que a conversa está. Cada número pode ter um nome diferente. O nome é lido da conta
conectada a cada minuto, sem cadastro. No fluxo, `{{meu_nome}}` e `{{meu_numero}}` trazem o nome e o
telefone desse número. Um cartão "salve meu número" feito com eles chega, em cada número, com o
próprio número. Agente com um número só não muda.

O roteiro do agente também aceita `{{meu_nome}}`, que vira o nome do perfil do número. Use a
variável no molde da apresentação, por exemplo "Me chamo {{meu_nome}}". Um molde com o nome
escrito fixo é copiado ao pé da letra e vence qualquer outra instrução.
