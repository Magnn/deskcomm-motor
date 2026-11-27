---
impacto: capacidade_nova
secao: adicionado
titulo: Oferta sem relógio — o único tempo é depois de um não ou de "sem dinheiro"
---

O catálogo do agente ganhou a opção "Oferecer sempre que encaixar": o próximo produto é oferecido sempre
que o assunto da pessoa encaixar, quantas vezes encaixar, por caminhos diferentes, sem a trava de uma
oferta por dia. O agente só dá um tempo quando a pessoa diz não ou que está sem dinheiro; quando ela volta
ao assunto, oferece o passo menor (a cobrança mais barata do assunto dela, ou a entrada com o restante
depois).

Na oferta automática, "sem dinheiro" e "não quero" deixam de fechar a porta por 30 dias: a oferta pausa
por `pausa_apos_recusa_horas` (padrão 12 h) e volta, com o passo menor para quem estava sem dinheiro.
Pedido de parar, desconfiança, fome e sofrimento continuam fechando a porta. `horas_entre_ofertas` e
`dias_entre_repeticoes` aceitam 0 (sem relógio), e uma nova oferta automática só sai depois que a pessoa
voltou a falar desde a anterior — nunca duas seguidas em quem ficou calada. Os padrões não mudam para
quem não mexer na configuração.
