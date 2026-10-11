---
impacto: capacidade_nova
secao: adicionado
titulo: Nova aba "Catálogo" na configuração do agente: um registro por produto para vender a quem já comprou
---

Vender mais de um produto pelo mesmo agente exigia mexer em vários lugares ao
mesmo tempo — o roteiro, a aba Preço, o nome de um fluxo de entrega — e o que
ficava diferente entre eles ia para o cliente. Agora a página do agente tem uma
aba **Catálogo**, com um cartão por produto: o que é, o que a pessoa recebe, o
valor, o link de pagamento, como é entregue, o que precisa ser pedido a ela e
depois de qual compra ele é oferecido.

O agente não vê a lista. O sistema escolhe **um** produto por vez, pelo que a
pessoa já comprou, na ordem dos cartões, e só depois da espera configurada. Uma
oferta recusada não é repetida nem trocada por outra.

Dois tipos de entrega: **material pronto**, enviado por um fluxo de entrega que
declara o produto, e **na conversa**, em que o próprio agente conduz a entrega
depois de pedir o que precisa. Um produto de material pronto sem fluxo de
entrega não é oferecido, e a tela mostra o aviso: sem isso a pessoa pagaria e
não receberia. Um produto entregue na conversa deixa de cair no fluxo de entrega
geral, que é o de outro produto.

O produto da primeira venda continua na aba **Preço**, com o valor e a
negociação. Com o catálogo ligado, a "Oferta para quem já comprou" da aba Preço
deixa de valer, e a própria aba avisa. O valor mínimo que a trava de preço aceita
passa a considerar o produto mais barato do catálogo.

Vale a partir da próxima conversa, sem publicar versão — por isso só quem é
administrador salva, e cada alteração fica na auditoria (só com as contagens e o
menor valor, nunca o nome de um produto nem o link). Um agente que não usa a aba
não muda em nada.
