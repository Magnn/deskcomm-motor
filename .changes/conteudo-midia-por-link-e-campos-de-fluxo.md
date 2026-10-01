---
impacto: capacidade_nova
secao: adicionado
titulo: Nó Conteúdo envia mídia por link ou campo de fluxo, e os campos do lead viram variáveis
---

Imagem, vídeo e documento do nó Conteúdo voltam a ter as abas de origem — "Arquivo anexado / Campo de fluxo" na imagem, "Anexar / Link" no documento — agora funcionando: o link (ou a variável que guarda o link, como `{{url_imagem_lead}}`) é gravado no fluxo e, na hora do envio, o servidor baixa o arquivo e o entrega como mídia. O download só acessa endereços públicos, respeita os mesmos formatos e tamanhos do upload da tela e não segue redirecionamento para endereço interno. Além disso, qualquer campo do lead passa a valer como variável nos textos e legendas do fluxo (`{{cidade}}`, `{{plano}}`…), junto com `{{nome}}`, `{{telefone}}`, `{{email}}` e `{{etapa}}`. Não há ação para quem opera a VPS.
