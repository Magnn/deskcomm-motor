---
impacto: capacidade_nova
secao: adicionado
titulo: A área do cliente vira app no celular, com aviso diário
---

A área do cliente pode ser instalada no celular como app, com o nome e o ícone da empresa, abrindo
direto na área. Com "App e aviso diário no celular" ligado em CRM › Área do cliente › Configuração, a
pessoa que quiser ativa um aviso por dia, na hora escolhida pela empresa: "a sua carta de hoje abriu".
Um aviso por dia no máximo, só para quem pediu, e desligável na própria área. No iPhone o aviso exige a
área instalada (a tela ensina como). Usa as mesmas chaves de push (`VAPID_*`) do aviso da equipe e um
cron novo, `area-avisos`, de hora em hora. Exige a migration 0939.
