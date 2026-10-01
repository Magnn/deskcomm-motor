---
impacto: capacidade_nova
secao: adicionado
titulo: O nó Conteúdo envia cartão de contato e figurinha
---

O nó Conteúdo do construtor de fluxo ganhou dois tipos de item: **Contato** (nome e telefone, entregue como cartão de contato do WhatsApp) e **Figurinha** (arquivo `.webp` de até 500 KB). O contato já existia na tela mas a publicação o recusava, porque o motor do fluxo não sabia enviá-lo; agora ele sai pelo mesmo caminho do envio manual do atendente. A publicação passa a recusar, com o item apontado, contato com telefone que o canal não disca e figurinha fora do formato. No canal oficial (Cloud API) a figurinha chega como figurinha; nos canais sem esse recurso o `.webp` chega como imagem. Vídeo e documento seguem sem envio pelo fluxo. Não há ação para quem opera a VPS.
