---
impacto: nada_mudou
secao: corrigido
titulo: Comprar leitura e créditos na área do cliente voltou a funcionar
---

As rotas da Mesa de leituras e dos créditos da área do cliente estavam fora da lista de caminhos que o
proxy deixa passar sem login da equipe: quem tentava comprar uma leitura ou um pacote de créditos
recebia erro. Corrigido, com um teste que confere que toda rota pública da área atravessa o proxy.
