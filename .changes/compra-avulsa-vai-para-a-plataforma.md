---
impacto: capacidade_nova
secao: adicionado
titulo: Compra avulsa paga na conversa é reportada à plataforma de anúncio
---

A cobrança avulsa paga pela Stripe (um extra oferecido pelo agente) passa a ser enviada como compra à plataforma de anúncio que trouxe o lead, com o valor e a hora da cobrança. Antes só a venda do produto principal era enviada, porque o envio dependia de o negócio virar ganho. O livro de envios de conversão passa a guardar uma linha por evento em vez de uma por negócio (migration 0926), para que o mesmo negócio possa ter a compra do produto e as avulsas. Contato sem anúncio de origem continua sem envio.
