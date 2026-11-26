---
impacto: nada_mudou
secao: corrigido
titulo: A agente volta a responder quem acabou de pagar enquanto o fluxo de entrega espera
---

O fluxo só cala a agente quando o próximo passo dele está a menos de 1 hora (era 1 dia). Um fluxo de
entrega que espera 20 horas entre a primeira e a segunda mensagem deixava a cliente que acabou de pagar
sem resposta até o dia seguinte.
