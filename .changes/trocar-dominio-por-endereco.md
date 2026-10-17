---
impacto: nada_mudou
secao: alterado
titulo: A troca de domínio da VPS do motor aceita endereço por endereço e cria o www
---

`ops/vps/trocar-dominio.sh` passa a receber pares `antigo=novo` com o endereço inteiro, para o
nome poder mudar junto com o domínio (por exemplo, `desk.` vira a raiz e `desk-api.` vira `api.`).
Endereço novo na raiz ganha o `www.` levando a ele, e o DNS é recusado também quando tem registro
a mais. Quem instala pelo kit não é afetado.
