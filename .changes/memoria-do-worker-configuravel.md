---
impacto: capacidade_nova
secao: adicionado
titulo: O teto de memória do agente de IA passa a ser configurável
---

Quem aumenta a quantidade de atendimentos simultâneos do agente (`QUEUE_MAX_CONCURRENCY`) pode agora aumentar a memória dele junto, com `WORKER_MEM_LIMIT` no `.env`. Antes o teto era fixo em 512m, e com muitos atendimentos ao mesmo tempo o agente caía por falta de memória e reiniciava sozinho — quem estava sendo atendido esperava a recuperação.

O padrão continua 512m: quem não definir nada segue exatamente como estava.

**Para usar:**

No `.env`, defina `WORKER_MEM_LIMIT` (por exemplo `1536m` para 16 atendimentos simultâneos ou mais) e recrie o serviço: `docker compose -f docker-compose.prod.yml --env-file .env up -d worker`. Confira antes se a máquina tem essa memória livre.
