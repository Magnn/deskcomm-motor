---
impacto: nada_mudou
secao: corrigido
titulo: Venda de quem chegou pela página com o cookie de clique da Meta vai para o anúncio
---

Quem chegou pela página sem o `fbclid` no endereço, mas com o cookie de clique da Meta (`_fbc`) de um anúncio
clicado antes, tinha a venda marcada como "sem atribuição" e ela não era enviada à Meta. Agora o clique é lido de
dentro do cookie guardado pela página.
