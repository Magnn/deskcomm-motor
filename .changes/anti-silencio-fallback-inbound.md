---
impacto: nada_mudou
secao: corrigido
titulo: Lead nunca fica sem resposta quando modelo responde com texto direto
---

Quando o modelo de IA responde com texto direto em vez de acionar a ferramenta `send_message`, o motor agora automaticamente despacha esse texto pelo canal respeitando todos os guardrails, impedindo que o lead fique sem resposta. Além disso, se um turno conversacional ativo encerrar em silêncio involuntário sem transferência humana, uma exceção é lançada para acionar a re-tentativa na fila.
