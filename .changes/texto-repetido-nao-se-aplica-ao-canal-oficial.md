---
impacto: capacidade_nova
secao: corrigido
titulo: No canal oficial, o fluxo estático não é mais barrado por mandar a mesma mensagem a vários contatos
---

A trava de "mensagem idêntica em massa" é anti-banimento: existe para o número não cair em canal não oficial. Ela também valia no canal oficial, onde não há esse risco — e ali ela barrava o fluxo estático por construção: como o roteiro manda a mesma mensagem para todo contato, o terceiro a entrar no funil dentro da janela tinha a mensagem vetada e o fluxo inteiro cancelado ("O envio foi recusado pelas regras do atendimento"). Agora a trava segue a mesma regra que o controle de ritmo já seguia: só se aplica ao canal com risco de banimento. No canal não oficial nada muda. Não há ação para quem opera a VPS.
