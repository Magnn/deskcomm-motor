---
impacto: capacidade_nova
secao: corrigido
titulo: O fluxo não trava mais quando chega a uma saída sem ligação, e a pergunta continua aberta quando a resposta não casa
---

**Fluxo travado em erro.** Quando o contato chegava a uma saída que não estava ligada a nada — a última caixa de um fluxo sem "Fim", ou uma resposta sem caminho — o sistema tentava gravar a inscrição como "parada", e o banco recusava esse estado. A inscrição ficava presa em erro, sendo tentada de novo a cada minuto, e o contato não conseguia mais entrar no fluxo. Agora, nesse ponto, o fluxo **termina** para aquele contato, com o motivo registrado na fila ("O fluxo terminou nesta caixa: …"), e ele pode entrar de novo depois.

**Qualquer resposta avança; só o silêncio para.** Numa caixa de resposta com uma única saída de resposta ligada (por exemplo a regra "contém sim" levando à próxima caixa), qualquer resposta do contato passa a seguir por essa saída — mesmo que ele escreva "ok" em vez de "sim". Se há várias saídas de resposta ligadas e nenhuma regra casa, e "Outros casos" não está ligada, a pergunta continua aberta e a próxima mensagem é avaliada de novo. Sem resposta no prazo, segue por "Sem resposta" — ou termina ali, se essa saída não estiver ligada. Não há ação para quem opera a VPS.
