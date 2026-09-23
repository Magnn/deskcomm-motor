---
impacto: capacidade_nova
secao: adicionado
titulo: A agente de IA responde em áudio no WhatsApp, com voz escolhida ou clonada
---

Nova aba "Voz" no detalhe de cada agente. Ligada, a agente responde com uma nota
de voz (a bolha com a onda) quando a pessoa mandou áudio; nos demais casos segue em
texto. Você escolhe o serviço de voz — OpenAI (vozes prontas femininas e masculinas,
com a mesma chave que já transcreve áudio) ou ElevenLabs (biblioteca de vozes e
clonagem) —, ouve cada voz antes de escolher, ajusta velocidade e estilo, e na
ElevenLabs pode criar uma voz a partir de gravações. A clonagem só roda com a
declaração de que a voz é sua ou que há autorização de quem a possui, e essa
declaração fica registrada na auditoria (`ai.voice_cloned`).

Se qualquer coisa falhar com a voz (chave, cota, serviço fora do ar), a agente responde
em texto: a pessoa nunca fica sem resposta. Links de pagamento sempre saem como texto,
depois do áudio. A configuração fica em `ai_agents.config.voice_reply` e vale a partir
da próxima conversa, sem publicar versão nova e sem migration. A chave da ElevenLabs é
cadastrada na própria aba e guardada cifrada, como as demais.
