---
impacto: capacidade_nova
secao: adicionado
titulo: O nó GPT do construtor passa a respeitar as opções da tela (modelo, temperatura, contexto, personalidade, base, restrições, envio)
---

As opções do nó GPT já eram salvas, mas o motor só lia o prompt. Agora valem: modelo e temperatura (o modelo só
se aplica em organizações com OpenAI/OpenRouter; nas demais usa-se o padrão e o aviso fica no log), teto de
tokens, manter contexto, leitura de imagem e PDF, personalidade, restrições e base de informações do agente que
armou o fluxo, salvar em campo e «enviar resultado como texto» (passa pelas regras de envio; o desfecho fica no
registro do passo). As variáveis do prompt ({{primeiro_nome}}, {{etapa_funil}}, campos do lead…) também são
substituídas. Sem exigir ação do operador.
