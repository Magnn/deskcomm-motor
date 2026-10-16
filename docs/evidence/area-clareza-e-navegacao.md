# Área do cliente: clareza e navegação

Destino: núcleo, apresentação da área existente. Não cria tabelas, rotas ou regras de pagamento.

CONFIRMADO: `lib/area-do-cliente/circulo.ts` estende a validade por pagamento; `app/api/v1/area/publica/[org]/circulo/route.ts` cria cobranças avulsas. `_ofertas.tsx` mostra o link do presente e a leitura em texto depois do pagamento. `_client.tsx` consulta novas mensagens a cada 20 segundos. Não há SLA confirmado; nenhum foi acrescentado.

Living System Checklist:

1. Entrada: configuração, sessão e dados já carregados por `app/c/[org]/page.tsx`.
2. Saída: os atalhos apontam para atendimento, espaço pessoal e ofertas na mesma página.
3. Registros: preservados os eventos e a auditoria das rotas existentes; navegação por âncora é leitura e não gera mutação.
4. Tela: `/c/[org]`, `FaleComAGente` e `EmailDoCliente`.
5. Porta: a mesma área recebida por link ou código de e-mail; âncoras não criam destinos externos.
6. Anti-morte: envio confirmado visível, erro mantém a mensagem para nova tentativa; consulta periódica existente preservada. Não foi criado prazo de resposta.
7. Configuração: título, boas-vindas, cor e ofertas continuam vindo de `org.config`; texto de boas-vindas personalizado é preservado.
8. Continuidade: o atendimento da área continua em CRM › Área do cliente › Mensagens, sem mudança na comunicação IA/humano.
9. Retorno: erros são anunciados e permitem nova tentativa; não há decisão automática nova a treinar.
10. Mapa: nenhuma peça ou aresta de backend nova; apenas âncoras e apresentação nas peças existentes.
