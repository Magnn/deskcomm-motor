---
impacto: capacidade_nova
secao: corrigido
titulo: O restante de quem pagou entrada sai no valor que falta, e o retorno combinado sobrevive à passagem para humano
---

Quem pagou entrada podia receber a cobrança do valor cheio no dia combinado: o
agente usava o link do produto, e o link só sabe cobrar o preço dele. Agora o
agente pede o Pix pela marca `[[PIX: Restante]]`, o valor vem do retorno combinado
e do livro de receita, e um link de outro valor nesse turno é recusado.

A passagem para humano segue desligando os retornos, mas agora grava o motivo e
conta à pessoa que assume o que estava combinado. Ao devolver o atendimento, os
retornos com data futura voltam, e só saem se o cliente escreveu nas últimas 24 h.
Quem falou em tirar a própria vida não tem retorno religado nem volta sozinho
para o agente pelo prazo de devolução automática.
