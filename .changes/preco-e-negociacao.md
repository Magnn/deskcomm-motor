---
impacto: capacidade_nova
secao: adicionado
titulo: Nova aba "Preço" no agente: valor de venda, valor de referência e até onde ele pode negociar
---

Cada agente ganha a aba "Preço", onde o admin define três coisas: o **valor de venda** (o que
o link de pagamento cobra), um **valor de referência** opcional (o preço cheio, que o agente
cita uma vez como "valor de referência", sem prazo nem pressão) e **degraus de negociação** — até
três valores menores, cada um com o cupom do checkout ou o link que cobra aquele valor. O
último degrau é o **mínimo**: o agente só oferece desconto se a pessoa pedir ou disser que
está caro, um degrau por vez, e nunca desce do último.

O mínimo tem rede de segurança: ao salvar, o piso vira o piso de preço da trava de promessas da
organização, e a mensagem que citar um valor abaixo dele (ou um desconto acima do
correspondente) é vetada antes de sair. O valor de referência só é aceito com a declaração
de que é um preço real da oferta, registrada na auditoria (`ai.pricing_updated`): "de R$ X por
R$ Y" com um X que nunca foi cobrado é desconto falso. Vale no próximo turno, sem publicar
versão e sem migration. Só admin salva; a configuração fica em `ai_agents.config.pricing`.
