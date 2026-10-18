---
impacto: nada_mudou
secao: corrigido
titulo: Conta nova sem empresa vai direto para "Configure sua organização"
---

Quem entrava com uma conta que ainda não tinha empresa — por exemplo, quando o link de confirmação
do e-mail não concluiu o cadastro — caía numa tela de Perfil com o menu vazio, sem saber o que
fazer. Agora vai direto para a tela de criar a empresa, e de lá para o passo a passo inicial.

Quem hospeda o próprio servidor de login (GoTrue) também pode apontar o link de confirmação e o de
recuperar senha direto para `https://<seu-domínio>/auth/confirm`, com
`GOTRUE_MAILER_URLPATHS_CONFIRMATION` e `GOTRUE_MAILER_URLPATHS_RECOVERY`: a tela de confirmação passou a
aceitar o link no formato que o modelo padrão de e-mail monta, e a conta já nasce com a empresa criada.
