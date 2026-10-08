---
impacto: nada_mudou
secao: corrigido
titulo: O agente oferece o valor negociado antes de agendar pagamento para outra data
---

Com degraus de negociação configurados, o agente podia agendar o retorno de quem só paga em outra
data pelo valor cheio, sem antes oferecer o valor menor liberado. Agora o agendamento de pagamento
só é aceito depois de o valor negociado ser oferecido, e o retorno guarda esse valor.
