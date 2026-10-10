---
impacto: nada_mudou
secao: corrigido
titulo: A recuperação de silêncio não para mais quando o roteiro do agente é republicado
---

A régua que volta a chamar quem parou de responder deixava de funcionar para boa parte das conversas, por dois motivos:

- **Republicar o agente tirava da régua quem já estava em silêncio.** A regra que impede a régua de disparar para conversas antigas no dia em que a recuperação é ligada usava a data da última publicação do agente. Cada vez que o roteiro era republicado, toda conversa calada naquele instante saía da régua para sempre. Numa instalação medida, 505 de 581 conversas estavam barradas assim, e 190 pessoas que receberam o link de pagamento em três dias não tiveram nenhuma retomada. A data passa a ser a de quando a recuperação foi ligada.
- **Só as conversas mais antigas eram avaliadas.** A rodada olhava as 200 mais antigas; com mais candidatas que isso, quem tinha acabado de se calar nunca era avaliado. Agora todas são avaliadas, e as chamadas saem do silêncio mais recente para o mais antigo, no máximo 40 por minuto.

Uma proteção nova acompanha a correção: quem está calado há muito mais tempo que o último passo da régua (mais de uma hora além dele) e nunca foi chamado não recebe uma "primeira" chamada atrasada.
