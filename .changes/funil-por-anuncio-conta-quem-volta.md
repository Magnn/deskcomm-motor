---
impacto: nada_mudou
secao: corrigido
titulo: O funil por anúncio atribui ao anúncio quem veio pelo botão da página e conta quem voltou pelo anúncio
---
Quem chegava pelo botão da página caía na linha "sem anúncio identificado", porque o id do anúncio fica no `utm_content` do clique e o funil só lia o anúncio do clique direto para o WhatsApp. Quem já era contato e voltou por um anúncio também não entrava, porque o funil contava só contatos criados no período. Agora as duas pessoas entram, cada uma uma vez, no anúncio certo.
