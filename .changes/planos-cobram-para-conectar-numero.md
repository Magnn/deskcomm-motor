---
impacto: capacidade_nova
secao: adicionado
titulo: Planos — o cliente cria conta, fluxos e agentes de graça e paga para conectar número
---

Quem vende o produto como serviço ganha o modelo "monta de graça, paga para colocar no ar". Vem **desligado**: sem `PLANS_ENFORCED=true` nada muda.

Com a cobrança ligada:

- **Conectar número exige plano em dia**, até o limite de números do plano. Vale para QR code, API oficial, canal intermediado e para o número do onboarding. Sem plano, a empresa continua criando e importando fluxos e montando agentes.
- **Catálogo padrão:** Start (R$ 97, 1 número), Pro (R$ 197, 3 números) e Scale (R$ 397, 10 números). `PLANS_CATALOG` troca nomes, preços e limites sem mexer em código.
- **Configurações › Billing** deixa de dizer "em breve": mostra o plano em vigor, os números em uso e os planos à venda, com o link de pagamento.
- **O pagamento da Cakto ativa o plano de quem já tem conta.** Em `CAKTO_SUBSCRIPTION_PRODUCTS`, cada oferta diz o plano que vende (`código=plano`). A empresa é achada pelo e-mail do comprador, que precisa ser administrador dela; quem paga sem ter conta ganha uma e recebe o acesso por e-mail.
- **Deixou de pagar:** o plano cai, os fluxos em andamento param e os números deixam de responder sozinhos — mas a conta continua aberta para a pessoa regularizar (a empresa não é suspensa).
- **Painel do dono da instalação:** na ficha de cada empresa dá para definir o plano à mão (cortesia, conta própria). Plano definido ali não cai por aviso de pagamento.

O plano de cada empresa mora numa tabela nova (`organization_subscriptions`, migration 0908) que só o servidor alcança — o cliente não pode se dar um plano.

**Para usar:**

Para usar, aplique a migration 0908, defina `PLANS_ENFORCED=true` no `.env` e, se cobra pela Cakto, declare as ofertas como `código=plano` em `CAKTO_SUBSCRIPTION_PRODUCTS`. Antes de ligar, defina à mão o plano das empresas que já têm número conectado (ficha da empresa no painel): empresa sem plano não conecta número novo. Os números que já estavam conectados continuam funcionando.
