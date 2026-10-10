---
impacto: nada_mudou
secao: corrigido
titulo: Clima da conversa volta a ser medido em todas as mensagens, e o envio pelo WhatsApp oficial resiste a falha passageira
---

Quatro defeitos encontrados nos registros de produção:

- **Clima da conversa sem medição em parte das mensagens.** Com a DeepSeek como modelo, a leitura de clima falhava em cerca de uma a cada nove mensagens: o modelo gastava toda a resposta raciocinando e não devolvia a nota. Esse tipo de pergunta curta passa a ser feito sem a etapa de raciocínio, o que também reduz o consumo de tokens dessa leitura.
- **Resposta que virava falha no WhatsApp oficial por instabilidade de rede.** Quando a conexão com a Meta não abria, ou a Meta devolvia um erro temporário, a mensagem era marcada como falha na primeira tentativa. Agora o envio tenta mais duas vezes nesses dois casos — e só neles: se a conexão cai depois de o pedido ter saído, não há nova tentativa, para a mesma mensagem não chegar duas vezes ao cliente. O envio também ganhou um limite de 30 segundos; antes, um pedido sem resposta podia deixar a mensagem "na fila" indefinidamente.
- **Mensagem de atendente presa na fila de um número desconectado.** Uma mensagem escrita por uma pessoa pouco antes de o número ser desconectado e arquivado ficava com o relógio de "enviando" para sempre. Agora ela aparece como não enviada, com o motivo.
- **Áudio do cliente sem leitura quando as contas de transcrição ficam sem saldo.** Com o serviço principal sem crédito e a reserva recusando parte das chamadas, quase um terço dos áudios ficava sem transcrição e o agente respondia sem saber o que a pessoa disse. Quando as duas recusam pela conta, a transcrição passa a tentar uma terceira saída: a chave do Google da própria organização, se ela tiver uma cadastrada e validada. O áudio só vai para o Google nesse caso.
