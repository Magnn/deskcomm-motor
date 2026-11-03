---
impacto: capacidade_nova
secao: corrigido
titulo: A chave Pix principal vale em todo envio, inclusive nos fluxos
---

Quando a empresa tem uma chave Pix principal (aba Preço do agente), nenhuma mensagem sai com outra chave.

- **Nó "Enviar PIX" dos fluxos.** Ele passa a cobrar na chave principal, com o mesmo passo a passo da conversa: a chave sozinha para copiar, o nome do titular e o pedido do comprovante. Antes ele mandava a chave e o favorecido digitados no próprio nó, e o fluxo seguia com a chave antiga mesmo depois da troca na aba Preço.
- **Trava no envio.** Antes de qualquer mensagem de texto sair (agente, fluxo, régua de silêncio ou atendente), uma chave diferente da principal é trocada por ela. Isso vale num balão que fala de Pix ou de chave, e num balão que é só a chave. Código copia e cola e links não são mexidos. A troca fica registrada na própria mensagem (`chave_pix_corrigida`).
- **Mais de um agente com chave principal.** Vale a do agente publicado de maior prioridade. Antes, o banco escolhia qualquer um.
