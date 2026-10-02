---
impacto: capacidade_nova
secao: corrigido
titulo: O fluxo do número segue como foi configurado mesmo se o contato responder, e excluir contato volta a funcionar
---

**Resposta no meio do Delay.** No fluxo vinculado a um número, quando o contato respondia durante um Delay, o sistema cortava o Delay e disparava as mensagens seguintes de uma vez. Agora o Delay é respeitado: a resposta só avança o fluxo nas caixas que esperam resposta (pergunta, menu, coleta). "Cancelar se o lead responder", quando ligado no gatilho, continua valendo, e o pedido de saída (opt-out) continua parando o fluxo. Fluxos de acompanhamento sem número próprio seguem com a regra de antes, em que a resposta encerra a espera.

**Excluir contato.** Um contato que já tinha passado por um fluxo não podia ser excluído: a exclusão apagava as mensagens e a conversa, falhava ao apagar a ficha, e o contato ficava sem histórico — o que ainda cancelava o fluxo em andamento ("Atendimento encerrado ou substituído"). Agora a exclusão remove primeiro os registros de fluxo do contato e só então o histórico e a ficha; se algo impedir, nada é apagado. Não há ação para quem opera a VPS.
