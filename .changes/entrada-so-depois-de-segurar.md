---
impacto: nada_mudou
secao: corrigido
titulo: Valor abaixo do menor preço só vira entrada depois de o agente segurar o menor valor
---

Quando a pessoa dizia um valor abaixo do menor preço do produto, o agente (com entrada mínima configurada) aceitava na hora como entrada. Agora ele primeiro segura o menor valor e pergunta se ela consegue completar; só quando ela volta dizendo que não consegue, ou repete um valor baixo, o valor dela é aceito como entrada e o restante fica para depois. Valores a partir do menor preço continuam aceitos na hora.
