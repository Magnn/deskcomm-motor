---
impacto: capacidade_nova
secao: adicionado
titulo: O nó Conteúdo envia tudo o que a tela oferece — vídeo, documento, contato, figurinha e variáveis
---

O nó Conteúdo do construtor de fluxo passa a enviar todos os tipos de item: além de texto, imagem e áudio, agora saem **vídeo**, **documento** (com o nome original do arquivo), **cartão de contato** e **figurinha** (`.webp` de até 500 KB). Imagem, vídeo e documento ganharam campo de legenda. As variáveis do botão "Campos Personalizados" (`{{nome}}`, `{{primeiro_nome}}`, `{{telefone}}`, `{{email}}`, `{{etapa}}`) passam a ser trocadas pelos dados do contato na hora do envio, também no texto fixo da ação — antes chegavam literais ao cliente; variável sem valor some e a frase é arrumada. Saíram da tela os controles que não tinham efeito (a chave "enviar como áudio gravado", o campo de transcrição e as abas "Link" e "Campo de fluxo"), e os formatos e limites anunciados passam a ser os que o upload aceita. A publicação recusa, apontando o item, contato com telefone inválido, figurinha fora do formato e mídia salva como link ou variável. No canal oficial a figurinha chega como figurinha; nos canais sem esse recurso o `.webp` chega como imagem. Não há ação para quem opera a VPS.
