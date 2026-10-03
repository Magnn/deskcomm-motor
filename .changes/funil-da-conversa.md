---
impacto: capacidade_nova
secao: adicionado
titulo: Dashboard › Receita — o funil da conversa e onde ela para
---

A aba **Receita** do dashboard agora mostra, abaixo do dinheiro, o caminho das conversas que começaram no período: **iniciadas → atendidas → receberam a oferta → compraram**, com o percentual de cada etapa.

Ao lado, **Onde a conversa para** — cada conversa que não comprou, na casa mais avançada a que chegou:

- **Ficaram sem resposta**: a pessoa escreveu e ninguém respondeu.
- **Atendidas, sem oferta**: houve conversa, mas o preço ou o link de pagamento nunca foi enviado.
- **Oferta → silêncio**: receberam a oferta e não escreveram mais nada.
- **Objeção → não compraram**: reclamaram do valor ou disseram uma frase da aba Objeções.
- **Conversaram depois da oferta e não compraram**.

Cada número abre a lista das conversas, com link direto para o atendimento.

A oferta e a objeção são reconhecidas por regra — as mesmas que o agente já usa na hora de responder — e gravadas alguns minutos depois da mensagem. O histórico anterior também é lido, aos poucos, a partir da primeira execução.

**Para usar:** aplique a migration 0913. Quem usa agendador próprio precisa da linha nova de `api/v1/cron/marcos-da-conversa` (a cada 5 minutos); no `scheduler` do kit ela já vem.
