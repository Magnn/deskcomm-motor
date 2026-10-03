---
impacto: capacidade_nova
secao: adicionado
titulo: Campanha pode mandar modelo aprovado da API oficial ou iniciar um fluxo, não só texto
---

Ao criar ou editar uma campanha, agora você escolhe **o que ela manda**:

- **Mensagem de texto** — como sempre foi.
- **Modelo aprovado (API oficial)** — você escolhe um modelo aprovado e preenche os espaços (dá para usar `{{nome}}`). É o único jeito de a API oficial do WhatsApp falar com quem não escreveu nas últimas 24 horas; até aqui a campanha, nesse canal, só alcançava quem tinha acabado de conversar.
- **Iniciar um fluxo** — cada pessoa do público entra num fluxo publicado, pelo número que a campanha escolher. Imagens, vídeos, botões, perguntas e sequência ficam por conta do fluxo.

O público, as exclusões (quem pediu para parar, quem recusou marketing), o rodízio de números, o ritmo, a janela de horário, o agendamento e o envio de teste valem igual para os três.

- Campanha de modelo só aceita número da API oficial: a preparação recusa, dizendo qual número tirar, em vez de falhar pessoa por pessoa depois de começar.
- No fluxo, quem já está em outro fluxo ativo não entra, e aparece na lista como falha com o motivo.
- As campanhas que já existem continuam sendo de texto, sem mudança.

**Para usar:** aplique a migration 0915.
