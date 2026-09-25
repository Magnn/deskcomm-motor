---
impacto: capacidade_nova
secao: adicionado
titulo: 5 caixas novas no construtor de fluxo — A/B split, IA por prompt livre, API externa, notificar atendente e anotar no contato
---

O construtor de Automações (Follow-ups) ganha 5 caixas novas, lado a lado com as que já
existiam (Aguardar, Condição, Classificar, Ação…):

- **A/B split** — divide o lead entre 2 a 6 caminhos por um percentual que você define
  (o total precisa somar 100%). A mesma inscrição sempre cai no mesmo caminho, mesmo se
  o passo for reavaliado.
- **IA (prompt livre)** — roda uma instrução livre num modelo de IA e grava o texto
  devolvido num campo do lead, para usar depois numa Condição ou numa mensagem. O modelo
  usado é o que estiver configurado em Configurações → Provedores, no ponto "Rodar o
  prompt livre do fluxo" — o mesmo mecanismo de custo/auditoria (`llm_calls`) que a
  caixa Classificar já usa.
- **API externa** — chama um endereço de terceiro (webhook). Cole um comando `cURL`
  (o que "Copiar como cURL" do navegador ou do Postman produz) e o método, a URL, os
  cabeçalhos e o corpo são preenchidos sozinhos. A chamada recusa endereços locais ou de
  rede privada.
- **Notificar atendente** — abre um item na Central de avisos com a mensagem que você
  escrever, sem transferir a conversa para ninguém.
- **Anotação no contato** — grava uma nota interna na conversa (a mesma que aparece
  quando alguém anota pela Inbox), sem mandar mensagem nenhuma ao contato.

Nenhuma tabela nova: as 5 caixas reaproveitam o que já existia (a Central de avisos, as
notas internas de conversa, o mecanismo de campo personalizado do lead). Não há ação
para quem já tem fluxos publicados — eles continuam exatamente como estavam.
