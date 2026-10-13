---
impacto: nada_mudou
secao: corrigido
titulo: Início de checkout volta a ser reportado quando a cobrança sai por link da Stripe ou Pix copia e cola
---

A rotina de marcos só reconhecia como meio de pagamento enviado os links de alguns checkouts. Quando a cobrança da conversa passou a sair só pelo provedor conectado (link da Stripe e Pix copia e cola), nenhuma dessas mensagens era reconhecida, e o evento de início de checkout deixou de ser enviado à plataforma de anúncio. Agora o link da Stripe e o código Pix copia e cola contam como meio de pagamento enviado.
