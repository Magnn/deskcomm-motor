---
impacto: capacidade_nova
secao: adicionado
titulo: A assinatura do produto pode ser cobrada pela Cakto — o pagamento libera e suspende o acesso sozinho
---

Quem vende o produto como serviço e cobra pela Cakto não precisa mais de um orquestrador no meio: a instalação ganha um endereço que recebe o aviso da Cakto direto, `POST /api/v1/tenants/subscription/cakto`.

- **Pagou, renovou ou voltou a pagar** — no primeiro pagamento a empresa do cliente é criada e ele recebe por e-mail o link para definir a senha; nas renovações nada muda; se estava suspensa, é reativada.
- **Cancelou, atrasou, pausou, pediu reembolso ou contestou** — a empresa é suspensa e os fluxos em andamento nela param. Uma tentativa de renovação recusada não suspende: a Cakto tenta de novo, e só o atraso de verdade conta.
- **Os outros avisos** (Pix gerado, carrinho abandonado…) são aceitos sem efeito.

A empresa é identificada pelo e-mail do comprador. Só o produto da assinatura tem efeito: a compra ou o reembolso de outro produto da mesma conta da Cakto não cria nem suspende ninguém. A origem do aviso é conferida pela assinatura que a Cakto manda no cabeçalho (ou, na falta dela, pelo segredo do corpo).

**Para usar:**

Para usar, crie na Cakto um webhook do produto da assinatura apontando para `https://SEU-DOMINIO/api/v1/tenants/subscription/cakto`, com os eventos de compra aprovada, reembolso, chargeback e os de assinatura. No `.env`, defina `CAKTO_SUBSCRIPTION_SECRET` (o segredo que a Cakto gerou para o webhook) e `CAKTO_SUBSCRIPTION_PRODUCTS` (o código do produto ou da oferta — o final do link `pay.cakto.com.br/<código>`). Sem as duas a rota não existe. O link de acesso do cliente novo sai por e-mail, então a instalação precisa ter o envio de e-mail configurado (SMTP ou Resend); sem ele a empresa é criada, mas o cliente não recebe o link.
