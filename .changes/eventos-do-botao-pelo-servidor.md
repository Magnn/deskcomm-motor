---
impacto: capacidade_nova
secao: alterado
titulo: Botão de WhatsApp da página manda Lead, Contato e Iniciar teste pelo servidor com o visitante da página
---

O clique no botão de WhatsApp de uma página de captura passa a mandar pela API de Conversões, além do **Lead**,
o **Contato** e, quando o botão é o de texto, o **Iniciar período de teste** — cada um com o mesmo id do evento do
navegador, para a Meta contar uma vez só. Se a página repassar o identificador do visitante (`_vid`, o mesmo
`external_id` do pixel do navegador) e o país (`_pais`), eles vão junto, e a venda feita depois na conversa também
leva esse visitante como segundo id externo. Antes, sem o cookie `_fbp`, o Lead do servidor chegava só com IP e
navegador e a Meta acusava "evento sem chave de dado do usuário". Página que não repassa nada segue como antes.
