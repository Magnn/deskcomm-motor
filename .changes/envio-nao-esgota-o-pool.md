---
impacto: capacidade_nova
secao: corrigido
titulo: Agente — o worker não trava mais quando muitos envios disputam o mesmo número
---

Com muitos leads respondendo ao mesmo tempo no mesmo número, o agente podia parar de responder a todos, sem erro na tela e sem voltar sozinho.

- Cada envio segurava uma conexão do banco esperando a vez do número, e quem tinha a vez precisava de mais uma. Com tantos envios quanto conexões, ninguém andava: o worker ficava mudo até ser reiniciado, e voltava a parar em seguida.
- Agora os envios que excedem o limite esperam a vez **sem** segurar conexão. Sempre sobra conexão para quem está enviando terminar. Isso vale para qualquer valor de `QUEUE_MAX_CONCURRENCY` e `DB_POOL_MAX`.
