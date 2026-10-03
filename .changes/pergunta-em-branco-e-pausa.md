---
impacto: nada_mudou
secao: corrigido
titulo: A caixa Pergunta em branco não envia mais o nome da caixa para o contato
---

A tela da caixa Pergunta ensina a deixar só um espaço em «Faça uma pergunta» para pausar o fluxo e esperar a resposta sem enviar texto (por exemplo, depois de um áudio que já fez a pergunta). O motor ignorava isso e mandava o nome interno da caixa («Nova pergunta») para cada contato que chegava ali. Agora a pergunta em branco não envia nada: a caixa só espera a resposta pelo prazo configurado e segue por «Respondeu» ou «Sem resposta». Caixas antigas que nunca tiveram o campo preenchido continuam perguntando pelo nome da caixa, como antes, e a múltipla escolha continua enviando as opções. Não há ação para quem opera a VPS.
