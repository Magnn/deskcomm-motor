---
impacto: nada_mudou
secao: corrigido
titulo: Cliente que escreveu e ficou sem resposta agora é resgatado automaticamente
---

Três proteções para o cliente não ficar sem resposta:

- **Resgate automático.** A cada minuto o sistema procura conversas em que a última mensagem é do cliente, há mais de 5 minutos, sem nenhum atendimento em andamento. Para cada uma, pede o atendimento de novo, uma única vez. Se dez minutos depois ainda não houver resposta, abre um aviso na Central para uma pessoa assumir. Conversas com atendimento humano, contato bloqueado, canal arquivado ou passagem para humano recente não são tocadas.
- **Atualização sem cortar atendimento.** Ao atualizar o sistema, o serviço de IA passa a ter 45 segundos para terminar o que estava respondendo (antes eram 10).
- **Devolução imediata.** O atendimento que não terminar a tempo volta para a fila na hora, em vez de ficar dez minutos parado com as mensagens seguintes do cliente presas atrás dele.
