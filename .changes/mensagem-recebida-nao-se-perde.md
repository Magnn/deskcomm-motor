---
impacto: nada_mudou
secao: corrigido
titulo: Mensagem do WhatsApp oficial que chega quando o banco está sobrecarregado não é mais perdida
---

Quando o banco ficava sem conexão livre por alguns instantes, a mensagem que o cliente
mandava nesse intervalo pelo WhatsApp oficial era descartada: o Desk respondia à Meta
que tinha recebido, não gravava nada, e a mensagem não aparecia no histórico nem
chegava ao agente.

Agora o Desk tenta gravar de novo por alguns instantes e, se o banco continuar sem
atender, avisa a Meta que não recebeu. A Meta entrega a mensagem outra vez, e ela
entra quando o banco voltar.

Só falha passageira (banco ocupado, rede) pede a nova entrega. Mensagem recusada por
um motivo que não muda com o tempo continua sendo registrada no log e não é pedida
de novo.
