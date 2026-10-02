---
impacto: capacidade_nova
secao: adicionado
titulo: O pagamento da assinatura passa a liberar e suspender o acesso do cliente automaticamente
---

Quem vende o produto como serviço ganha uma porta para ligar o pagamento ao acesso: `POST /api/v1/tenants/subscription`, protegida pelo segredo da instalação (`TENANT_PROVISIONING_SECRET`, o mesmo do provisionamento — sem ele a rota não existe).

- `status: "active"` — no primeiro pagamento cria a empresa do cliente e devolve um link de uso único para o dono definir a senha; nas renovações não muda nada; se a empresa estava suspensa, reativa.
- `status: "suspended"` — suspende a empresa e encerra os fluxos que estavam em andamento nela.

A empresa é identificada pelo par `integration` + `external_id` (o id da assinatura na plataforma de pagamento); um aviso de pagamento não alcança empresa que não nasceu dele.

Empresa suspensa também deixa de automatizar: as mensagens continuam chegando no inbox e o pedido de saída do contato continua sendo honrado, mas fluxo, campanha e agente de IA não respondem até a reativação. Antes, suspender só fechava a tela.

**Para usar:**

Para usar, defina `TENANT_PROVISIONING_SECRET` (32 caracteres ou mais) no `.env` e aponte o aviso de pagamento da sua plataforma para a rota. Sem o segredo nada muda.
