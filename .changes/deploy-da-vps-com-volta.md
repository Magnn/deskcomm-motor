---
impacto: nada_mudou
secao: adicionado
titulo: Imagens da main ganham uma tag por commit, e a VPS do motor um deploy que volta sozinho
---

Cada commit da `main` publica as três imagens também como `sha-<7>`, uma tag que nunca
muda — `latest` continua sendo o topo da `main`. Em `ops/vps/` ficam o deploy da VPS de
produção do motor (fixa a versão, sobe um serviço por vez, confere a saúde e o domínio e
volta à versão anterior se algo falhar) e a troca, uma vez só, para um checkout limpo.
Quem instala pelo kit não é afetado.
