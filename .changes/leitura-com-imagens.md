---
impacto: capacidade_nova
secao: adicionado
titulo: A leitura de tarot mostra a mesa fechada e a imagem real de cada carta sorteada
---

Quando a agente oferece o baralho ("escolhe 3 números, de 1 a 22"), a mensagem vai com a foto da mesa de cartas fechadas e numeradas; quando ela revela uma carta ("CARTA 1: …"), a mensagem vai com a imagem daquela carta. Quem escolhe a imagem é o sorteio do sistema, nunca o texto do modelo. As imagens ficam no Storage da organização, na pasta `leitura` do bucket `catalog-photos`: uma imagem da mesa e uma por carta, numeradas de 01 a 22 na ordem dos Arcanos Maiores (os nomes exatos estão em `lib/leitura/imagens.ts`). Sem os arquivos, a leitura segue só em texto, como antes.

Duas correções no mesmo movimento: cada leitura é um sorteio novo (a mesma pessoa que escolhe os mesmos números outro dia recebe outras cartas; dentro de uma leitura as cartas não mudam), e depois das 3 cartas e da causa raiz a agente recebe uma trava para não inventar "CARTA 4" — medido numa conversa real, em que a leitura seguia carta após carta sem chegar à oferta.
