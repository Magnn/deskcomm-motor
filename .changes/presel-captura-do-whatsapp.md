---
impacto: capacidade_nova
secao: adicionado
titulo: "Anúncios: a página de captura pode mandar o WhatsApp digitado antes do botão"
---
A rota `/api/v1/anuncios/meta/[org]` passa a aceitar POST com `{ telefone }` no corpo. O clique é gravado do mesmo jeito, com o telefone junto, e a resposta traz o endereço do WhatsApp. O evento Lead enviado à Meta também leva o telefone, o que melhora a correspondência. O GET continua igual.
