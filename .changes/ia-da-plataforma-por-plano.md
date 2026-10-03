---
impacto: capacidade_nova
secao: adicionado
titulo: Quem vende por plano pode incluir a IA no plano, com teto que o cliente não desliga
---

Quem vende esta instalação como serviço pode oferecer a inteligência artificial **já incluída no plano**: o cliente cria o primeiro agente sem precisar abrir conta numa empresa de IA nem colar chave nenhuma.

- Com os planos ligados e uma chave de IA no `.env` da instalação, a empresa que não cadastrou a própria chave usa a da plataforma — e o teto de gasto dela passa a ser o **do plano**, em modo "parar ao atingir", que ela não consegue desligar. Passou do teto, a IA para naquele mês e a conversa vai para uma pessoa, depois do aviso.
- Padrão: Start até US$ 5 de IA por mês, Pro até US$ 12, Scale até US$ 25. Muda pelo `PLANS_CATALOG`, com um quinto campo por plano (centavos de dólar).
- Empresa sem plano ativo não usa a IA da plataforma além do mínimo.
- Quem cadastra a **própria** chave paga a própria IA e continua com o teto que escolher na tela, como antes.
- A tela de planos mostra quanto de IA cada plano inclui (só quando a instalação tem chave da plataforma), e o passo "Treine seu funcionário" do primeiro acesso diz que a inteligência já vem incluída, sem mandar o cliente conferir crédito numa conta que não é dele.

Quem usa o sistema para a própria empresa (planos desligados) não vê mudança nenhuma.

**Para usar:** com `PLANS_ENFORCED=true`, coloque uma chave de IA da plataforma no `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` ou `OPENROUTER_API_KEY`) e reinicie app e worker. Opcional: ajuste o teto de cada plano no `PLANS_CATALOG`.
