---
impacto: capacidade_nova
secao: corrigido
titulo: O fluxo não trava mais quando chega a uma saída sem ligação, e a pergunta continua aberta quando a resposta não casa
---

**Fluxo travado em erro.** Quando o contato chegava a uma saída que não estava ligada a nada — a última caixa de um fluxo sem "Fim", ou uma resposta sem caminho — o sistema tentava gravar a inscrição como "parada", e o banco recusava esse estado. A inscrição ficava presa em erro, sendo tentada de novo a cada minuto, e o contato não conseguia mais entrar no fluxo. Agora, nesse ponto, o fluxo **termina** para aquele contato, com o motivo registrado na fila ("O fluxo terminou nesta caixa: …"), e ele pode entrar de novo depois.

**Resposta que não casa com a regra.** Numa caixa de resposta com regras (por exemplo "contém sim"), se o contato responde outra coisa e a saída "Outros casos" não está ligada, a pergunta continua aberta: a próxima mensagem dele é avaliada de novo, e o prazo recomeça. Quando o prazo vence sem resposta que case, segue por "Sem resposta" — ou termina ali, se essa saída também não estiver ligada. Não há ação para quem opera a VPS.
