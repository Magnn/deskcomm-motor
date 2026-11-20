---
impacto: nada_mudou
secao: corrigido
titulo: Link de cartão de cobrança antiga não é mais reenviado, e recusa de preço não deixa o lead sem resposta
---
O agente copiava do histórico um link de cartão já gerado (cada um tem um valor fixo) e o mandava como se fosse de outro valor — uma cliente pagou R$ 7 no cartão por três perguntas de R$ 81. Agora todo link de cartão que não esteja cadastrado na configuração é recusado no envio, e o agente cobra pela marca, que gera um link novo no valor certo. Além disso, quando as travas de preço e de link recusavam todas as tentativas de resposta, o turno terminava sem mensagem e sem nova tentativa; agora ele é refeito pela fila, como os demais vetos de conteúdo.
