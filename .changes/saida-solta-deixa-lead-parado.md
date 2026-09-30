---
impacto: exige_acao
secao: alterado
titulo: Saída sem ligação deixa o lead parado no nó — em todos os nós (antes dava erro ou escapava para «Outros casos»)
---

Cada nó tem as suas linhas de saída. Se uma não está ligada a nada e o lead sai por ela, ele agora FICA naquele
nó: sem erro, sem alarme, e a linha do tempo diz qual saída faltou. Antes o motor falhava (e depois matava a
inscrição) ou, em alguns nós, mandava o lead por outro caminho — para «Outros casos», ou até para a primeira regra.
Publicar também deixou de exigir ligar todas as saídas e de exigir um nó de Fim. O cartão marca «sem ligação»
nas saídas soltas.

**O que conferir antes de atualizar:** fluxos já publicados que tinham uma decisão com a saída solta e «Outros casos»
ligado seguiam por ele; agora o lead para. Rode `SUPABASE_DB_URL=… pnpm tsx scripts/listar-saidas-soltas.ts` para
listar, por fluxo ativo, cada saída solta e o que ela fazia antes. Um lead parado ocupa o seu lugar único de fluxo
vivo até alguém ligar a saída (vale para as próximas inscrições) ou cancelar a inscrição.
