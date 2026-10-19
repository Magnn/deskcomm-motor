---
impacto: capacidade_nova
secao: adicionado
titulo: Reservas de voz em ordem, em qualquer falha ou demora
---

A aba Voz do agente ganhou "Se a voz principal falhar": uma lista ordenada de até três vozes de
reserva (de qualquer serviço — voz do servidor, ElevenLabs, OpenAI) e quando elas assumem: só quando
acaba a cota do provedor (como antes) ou em qualquer falha ou demora da voz principal, com um tempo
máximo de espera configurável. É o que deixa usar a voz do próprio servidor ou uma voz clonada como
principal sem risco: se ela cair ou demorar, a pessoa ouve a reserva em vez de ler o texto. A reserva
única que já existia continua valendo.
