---
impacto: nada_mudou
secao: corrigido
titulo: A migration dos gatilhos únicos ganha timestamp e número próprios
---

A migration que impede dois fluxos de atendimento com a mesma palavra-gatilho tinha o mesmo timestamp (`20260930120000`) de uma migration do projeto original e o mesmo número (0905) de outra ainda em revisão. O Supabase usa o timestamp como identidade: dois iguais quebram `db push` e `db reset` assim que as duas cadeias se encontram. Ela passa a ser `20260930121905_0906`. Não há ação para quem opera a VPS — a migration ainda não tinha sido aplicada em produção.
