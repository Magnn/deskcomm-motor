---
impacto: nada_mudou
secao: alterado
titulo: O log de cada chamada de IA passa a dizer o que cada passo fez
---

Uma resposta do agente pode dar várias voltas — chamar uma ferramenta, ler o
resultado, chamar outra — e cada volta relê a conversa inteira. O registro de uso
somava tudo numa linha só, e não dava para saber quantas voltas houve nem qual delas
fez o quê.

O log do serviço que roda o agente (`llm: chamada concluída`) ganha o campo `passos`
quando a chamada tem mais de uma volta: por volta, o nome das ferramentas chamadas, os
tokens lidos e escritos e o tamanho do texto produzido. Não entra o texto do agente nem
o que foi passado às ferramentas.

Nada muda no atendimento nem nas telas.
