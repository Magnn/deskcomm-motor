---
impacto: capacidade_nova
secao: adicionado
titulo: Lançamentos em grupos de WhatsApp — um link só para vários grupos, e disparo para todos de uma vez
---

Quem faz lançamento junta os interessados em grupos e fala com todos ao mesmo tempo. Como um grupo do WhatsApp tem teto de participantes, um lançamento são vários grupos — e agora o sistema cuida disso. Fica em **CRM › Lançamentos**.

- **Link único do anúncio** (`/g/<nome>`): manda cada pessoa para o grupo que ainda tem vaga. Quando as vagas estão no fim, o próximo grupo é aberto sozinho, antes de o atual lotar — ninguém cai num convite recusado.
- **Grupos criados pelo sistema**, com nome numerado ("Aulão #1", "Aulão #2"…), descrição e, se você quiser, "só administradores falam".
- **Disparo para todos os grupos**: texto, imagem, vídeo, áudio, arquivo e pausas, para agora ou agendado. Sai um grupo de cada vez, com intervalo entre eles; cada grupo recebe uma única vez, e a falha de um não segura os outros.
- **Painel**: cliques no link, pessoas em cada grupo e o desfecho de cada disparo, atualizado sozinho.
- **Pausar** segura o link e os disparos agendados sem perdê-los; **fechar um grupo** o tira do link e dos disparos sem remover ninguém.

Grupos só existem em número conectado por QR code — a API oficial da Meta não tem grupos.

**Para usar:**

Para usar, aplique a migration 0909 e tenha um número conectado por QR code. Ao criar o lançamento, informe um "número de apoio" (outro WhatsApp seu): o WhatsApp não cria grupo de uma pessoa só, e esse número entra em cada grupo junto com o principal. Quem usa o agendador próprio precisa da linha nova de `api/v1/cron/lancamentos` (já incluída no `docker/scheduler/entrypoint.sh`).
