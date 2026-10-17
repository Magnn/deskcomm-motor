---
impacto: capacidade_nova
secao: adicionado
titulo: Etapas do trabalho na área do cliente
---

Cada serviço da área do cliente pode ter etapas (até 20, com título e uma linha de orientação),
escritas em CRM › Área do cliente › Serviços. Quem comprou o serviço vê, na aba Meu trabalho, a
linha do tempo das etapas (feitas, a da vez e as próximas) e marca cada uma com "Fiz esta etapa";
a aba Hoje mostra a etapa da vez. As etapas valem mesmo com o serviço escondido da vitrine.

Corrigido junto: editar só um campo de um serviço (o preço, por exemplo) desligava o destaque,
reativava serviço escondido e voltava a posição para zero.

Requer aplicar a migration 0934 (o `update.sh` aplica pelo `baseline.sql`).
