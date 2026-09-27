---
impacto: nada_mudou
secao: corrigido
titulo: A recuperação de falta reconhece um agente de IA no comando ao checar "outro fluxo vivo"
---

A recuperação de falta (no-show) checava se o contato já tinha outro fluxo vivo sem
reconhecer um agente de IA no comando de um fluxo (nó "Agente de IA", ainda não
publicável). Como esse nó não é alcançável hoje, ninguém percebeu diferença nenhuma:
a função já respondia com elegância pelo mesmo caminho que trata os outros casos. A
correção só evita trabalho desperdiçado quando esse nó existir de verdade.
