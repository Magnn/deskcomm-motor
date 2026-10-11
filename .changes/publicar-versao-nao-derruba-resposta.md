---
impacto: nada_mudou
secao: corrigido
titulo: Publicar uma versão nova do agente não deixa mais sem resposta quem escreveu naquele minuto
---

Quando uma versão nova do agente era publicada, as respostas que estavam sendo
preparadas naquele instante eram canceladas. Quem tinha acabado de escrever ficava
sem resposta, e só voltava a ser atendido quando mandasse outra mensagem.

Agora essas respostas voltam para a fila e são refeitas já com a versão nova. Nada é
enviado com o roteiro antigo.

Se o agente for pausado, arquivado ou tirado do modo automático no meio de uma
resposta, ela continua não sendo enviada, como antes.
