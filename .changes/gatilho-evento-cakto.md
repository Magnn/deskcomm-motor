---
impacto: capacidade_nova
secao: adicionado
titulo: Fluxo que começa por evento da Cakto — Pix gerado, carrinho abandonado, compra aprovada, reembolso e mais
---

O gatilho do fluxo ganha o tipo «Evento de pagamento (Cakto)»: quando a Cakto avisa o evento escolhido de uma
pessoa que já está no CRM, o fluxo começa. Vale para compra aprovada ou recusada, Pix, boleto e PicPay gerados,
carrinho abandonado, reembolso, chargeback e assinatura cancelada ou renovada. Em «Compra aprovada» o fluxo
escolhido passa a ser quem entrega; sem nenhum, segue valendo o fluxo ativo cujo nome começa com «Entrega».
Um campo opcional de produtos (ID ou parte do nome) limita o gatilho a certos produtos da Cakto — vazio vale para todos. O mesmo aviso reenviado pela Cakto não recomeça o fluxo. O painel do nó Gatilho passou a editar o gatilho de
verdade (antes gravava campos que nada lia). Sem exigir ação do operador.
