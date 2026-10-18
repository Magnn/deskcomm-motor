# Conectar com Stripe

Destino: **núcleo**, integração opcional de pagamentos. Sem chave da plataforma, a operação comum e a conexão por chave própria continuam disponíveis.

## Contrato implementado

- Entrada: Configurações › Pagamentos (`app/app/settings/pagamentos/`). A Server Action `conectarComStripe` exige sessão, organização ativa, admin e MFA quando devido; sessão de suporte não pode escrever.
- A plataforma usa `STRIPE_PLANS_SECRET_KEY` para criar a conta brasileira com Dashboard completo, cadastro e perdas administrados pela Stripe, e tarifas pagas pela conta conectada. O cadastro abre na Stripe por Account Link.
- Os endereços de webhook e retorno vêm de `NEXT_PUBLIC_APP_URL`, com HTTPS obrigatório, sem confiar no cabeçalho Host da requisição.
- `payment_gateway_connections` guarda a conta por organização, a prontidão e o segredo cifrado do webhook Connect. A tabela continua somente servidor: RLS sem policies e grants de anon/authenticated revogados. Conta conectada não pode pertencer a duas organizações (índice único parcial da migration 0935).
- Cobranças diretas usam a chave da instalação e `Stripe-Account` da empresa. A taxa é explícita na tela antes do cadastro, definida por `STRIPE_CONNECT_TAXA_CENTAVOS`; vazio/0 desativa. Conta por chave própria não paga taxa de plataforma.
- Webhook Connect: `/api/v1/webhooks/stripe-connect`, com `connect=true`, recebe `account.updated` e `payment_intent.succeeded`. A conta do evento localiza a organização; HMAC e tolerância de timestamp são verificados antes de qualquer efeito. O objeto de atualização precisa pertencer à mesma conta.
- `account.updated` e a consulta à Stripe na tela atualizam a prontidão. A auditoria `payment_gateway_connection.updated` aparece em `/app/audit`.
- O pagamento confirmado passa por `aplicarAvisoDePagamentoDaStripe`, compartilhado com o webhook por chave própria. A função preserva metadados da organização, deduplicação de compra e ledger, atualização de contato/negócio e entrega.
- Pausar impede novas cobranças; pagamentos de cobranças já emitidas continuam entrando. Webhook autenticado sem credencial disponível recebe 503 para reentrega. O webhook antigo consulta a chave antiga mesmo após a ativação do Connect.
- Cadastro interrompido pode ser continuado na mesma tela. Retomar cadastro não reativa uma conexão pausada. A criação do endpoint Connect usa chave de idempotência por URL para que cliques simultâneos reutilizem o endpoint.

## Limites

A taxa fixa configurada é em reais. Links em USD/EUR continuam funcionando sem taxa da plataforma até haver regra de conversão aprovada; o código nunca trata R$ 0,99 como US$ 0,99 ou € 0,99. Cobrança menor ou igual à taxa também segue sem taxa para preservar o pagamento.

O contrato de rede é coberto com respostas simuladas. Isso não comprova habilitação do Connect, Pix, boleto, cadastro bancário, tarifas ou recebimento na conta real. Reembolso e contestação não ganharam automação nova no CRM; são tratados no Dashboard da conta conectada. A taxa de saque não é receita implementada por esta entrega.

## Living System Checklist

1. Entrada: botão em `ConexaoComAStripe` → `conectarComStripe` → API Stripe.
2. Saída: `lerConexaoStripe` → `criarClienteStripe` → Pix/boleto/link usados no envio do agente.
3. Registro: `audit(payment_gateway_connection.updated)` e registros existentes da compra e receita.
4. Tela: Configurações › Pagamentos e Audit Log; compra/entrega nos consumidores já usados por `aplicarAvisoDePagamentoDaStripe`.
5. Porta: destino existente `/app/settings/pagamentos` no catálogo de navegação.
6. Anti-morte: cadastro continuável; falha transitória de webhook pede reentrega; pausa não perde confirmação de venda.
7. Configuração: disponibilidade, conta, prontidão e taxa visíveis na tela; chave/taxa configuradas pelo operador da instalação no ambiente.
8. Continuidade: cobrança emitida no fluxo atual do agente; compra confirmada retorna ao contato e ao fluxo de entrega existente, sem criar handoff paralelo.
9. Retorno: `account.updated` e consulta da conta corrigem o estado consumido pela próxima cobrança; erro transitório solicita nova entrega. Não existe decisão nova de IA ou autoajuste de taxa.
10. Mapa: `docs/architecture/stripe-connect.architecture.json`.
