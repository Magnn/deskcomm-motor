---
impacto: capacidade_nova
secao: adicionado
titulo: Ledger financeiro imutável — cada compra, reembolso e chargeback da Cakto vira um fato de banco deduplicado
---

O CRM ganha `revenue_ledger`: um registro append-only de fatos de receita (compra aprovada,
reembolso, chargeback — e o vocabulário já tem espaço para `adjustment`, sem produtor ainda) para
reconciliação e auditoria financeira, sem nenhuma lógica de decisão sobre o que a IA faz. O webhook
da Cakto (`/api/v1/webhooks/in/<token>`) já entregava e parava fluxos por tag no contato; agora,
independente disso, também registra o FATO no ledger — com dedupe de banco (chave por organização,
provedor, tipo do evento e id do pedido) em vez de checagem por leitura, então a mesma reentrega do
webhook nunca duplica a linha.

Igual à auditoria (`api_audit_log`, migration 0258): `anon`, `authenticated` e `service_role` não
têm UPDATE, DELETE nem TRUNCATE na tabela — só o dono do banco. Nenhuma tela nova; a gravação nova
aparece hoje como `financeiro.receita_registrada` no Audit Log já existente (`/app/audit`).

Migration 0401.
