---
impacto: capacidade_nova
secao: adicionado
titulo: A agente pode falar só nas respostas longas, e a voz troca de provedor sozinha quando a cota acaba
---

Na aba Voz do agente há uma terceira opção de quando falar: "Só quando a pessoa mandar
áudio e a resposta for longa". Com ela, a leitura e a explicação saem em áudio, e a
resposta de uma linha sai escrita. O tamanho a partir do qual a agente fala é o mesmo
campo que já existia.

No modo antigo, a agente respondia em áudio a toda mensagem de quem mandou áudio. Numa
instalação medida, isso deu 14 áudios por conversa.

A configuração de voz também aceita um provedor de reserva. Quando o provedor
principal avisa que a cota acabou, a resposta sai em áudio pela reserva, em vez de cair
para texto. A reserva só entra por falta de cota: chave recusada ou voz apagada
continuam aparecendo como erro. Ainda não há campo na tela para a reserva; ela é
gravada na configuração do agente.
