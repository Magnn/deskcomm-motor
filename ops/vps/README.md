# Operação da VPS de produção

Como a instalação de produção do motor roda e é atualizada. Vale para uma VPS com
o Supabase na mesma máquina e um Caddy do host na frente (porta 3300 → `app`).

## A regra

A pasta que roda o CRM (`/opt/deskcommcrm-stack/deskcomm`) é um **checkout limpo
deste repositório, num commit da `main`**. Nada é editado à mão ali dentro: o que é
próprio da instalação mora só no `.env` (e no `.env.cron-drain`). `deploy.sh`
recusa rodar se `git status` mostrar arquivo alterado.

Cada versão no ar tem nome: as imagens ficam fixadas em `sha-<7>` (tag imutável
que o CI publica para cada commit da `main`), nunca em `:latest`.

## Atualizar

```bash
cd /opt/deskcommcrm-stack/deskcomm
bash ops/vps/deploy.sh              # topo da main
bash ops/vps/deploy.sh 3f2a9c1      # um commit específico
bash ops/vps/deploy.sh --voltar     # a versão de antes do último deploy
```

Ele confere que as três imagens do commit existem, recria `worker` → `app` →
`scheduler` um de cada vez esperando cada um ficar saudável, testa o domínio e,
se algo falhar, **volta sozinho** à versão anterior. Histórico em
`.deploy/historico.log`; o `.env` de antes de cada deploy em `.deploy/env.antes-de-<sha>`.

### Migration nova

`deploy.sh` para quando o commit traz arquivo novo em `supabase/migrations/`.
Schema vai **antes** e à parte, com limite de espera de lock (uma migration sem
limite já parou o atendimento por 8 minutos):

```bash
# olhar transações abertas antes
docker exec -i supabase-db psql -U postgres -d postgres -c \
  "select pid, now()-xact_start, left(query,80) from pg_stat_activity where state <> 'idle' order by 2 desc nulls last limit 10"
# aplicar
( echo "set lock_timeout = '5s';"; cat supabase/migrations/<arquivo>.sql ) \
  | docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Depois: `bash ops/vps/deploy.sh <commit> --migrations-aplicadas`.

## A troca de pasta (uma vez só)

Até 17/10/2026 o CRM rodava de `/opt/deskcommcrm-stack/DeskcommCRM`, uma cópia do
repositório **original** com 12 arquivos editados à mão e um atualizador (o
`agent.sh` do kit) que, pelo botão "Atualizar agora", instalaria a versão do
original por cima desta. A troca:

```bash
curl -fsSL https://raw.githubusercontent.com/Magnn/deskcomm-motor/main/ops/vps/migrar-para-checkout-limpo.sh -o /root/migrar.sh
bash /root/migrar.sh
bash /opt/deskcommcrm-stack/deskcomm/ops/vps/deploy.sh <commit> --migrations-aplicadas
```

O nome do projeto Docker era `deskcommcrm` (`COMPOSE_PROJECT_NAME` no `.env`) e virou
`acassia` em 17/10/2026: os volumes do WhatsApp foram COPIADOS para `acassia_waha-data`
e `acassia_waha-media` (os `deskcommcrm_*` ficaram como cópia de segurança), e a ponte
da porta 3300 aponta para `acassia-app-1`. Os comandos abaixo são do tempo em que
o projeto ainda se chamava `deskcommcrm`. Para voltar à pasta antiga:

```bash
cd /opt/deskcommcrm-stack/DeskcommCRM
docker compose -f docker-compose.prod.yml --env-file .env up -d worker app scheduler
crontab /opt/deskcommcrm-stack/deskcomm/.deploy-crontab.antes
```

## Backup

`ops/vps/backup.sh` roda todo dia (cron do host) e manda para o Google Drive
(`gdrive:DeskcommCRM-backups`, rclone com escopo `drive.file` — enxerga só o que
ele mesmo criou):

| pasta | o quê | guarda |
|---|---|---|
| `diario/` | dump do banco + sessões do WhatsApp | 8 dias |
| `semanal/` | o de domingo | 5 semanas |
| `mensal/` | o do dia 1 | 6 meses |
| `semanal/storage-completo-*.tar` | todos os anexos, num pacote | os 2 últimos (~2,7 GB cada) |
| `diario/storage-novos-*.tar` | anexos que mudaram nos últimos 2 dias | 8 dias |

Anexos vão em pacote, nunca arquivo a arquivo: são ~15 mil arquivos pequenos e o
Drive limita a criação por minuto (em 17/10/2026, 204 em 40 min). Restaurar os
anexos = o último `storage-completo` + os `storage-novos` depois dele, nessa ordem.

Ele confere o dump (gzip e rodapé do `pg_dump`) e o tamanho do que chegou ao
Drive, e só então grava `/var/backups/deskcomm/ULTIMO_OK`. Log em
`/var/log/deskcomm-backup.log`. Uma vez por mês `ops/vps/testar-restauracao.sh`
restaura o último dump num Postgres descartável com a mesma imagem da produção e
compara as contagens das tabelas principais.

Restaurar de verdade (banco parado para o app): baixe o dump
(`rclone copy gdrive:DeskcommCRM-backups/diario/db-<data>.sql.gz .`), pare
`worker`, `app` e `scheduler` e aplique com
`zcat db-<data>.sql.gz | docker exec -i supabase-db psql -U postgres -d postgres`
num banco vazio.

O token do Drive mora em `/root/.config/rclone/rclone.conf` (600). Para trocar a
conta: `rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"` numa máquina com
navegador e cole o resultado em `token = ` (o valor sai em base64; o JSON dentro
dele tem a chave `token`).

## Trocar o domínio

```bash
bash ops/vps/trocar-dominio.sh desk.atendiment.sbs=acassia.tech desk-api.atendiment.sbs=api.acassia.tech            # mostra
bash ops/vps/trocar-dominio.sh desk.atendiment.sbs=acassia.tech desk-api.atendiment.sbs=api.acassia.tech --aplicar  # aplica
```

Cada par é `endereço antigo=endereço novo`, inteiro — o nome pode mudar junto. Endereço novo
na raiz do domínio ganha o `www.` levando a ele. Antes: cada endereço novo (e o `www` da raiz)
apontando SÓ para a VPS — ele recusa endereço sem registro e também com registro a mais, como a
página de estacionamento que o registrador cria sozinho na raiz. O domínio antigo continua respondendo ao lado do novo; no fim ele
lista o que se troca à mão em cada painel (Meta, Cakto, Stripe, Resend).

## Rotinas

As rotinas internas (`event-log-drain`, `followup-flow-worker`, campanha…) rodam
no contêiner `scheduler`, pela rede do Docker. O crontab do host tem só backup e
teste de restauração — até 17/10/2026 ele repetia duas rotinas pela internet, uma
delas com o segredo escrito na linha (cópia em `/root/crontab.bak-antes-de-tirar-duplicatas`).

## Medido e resolvido

- 502 de webhook durante o deploy: o Caddy do host segura e repete por até 90 s,
  e repete webhook mesmo com a conexão já aberta (`lb_retry_match`). Desde então
  nenhum webhook levou 502 no log do Caddy; sobra a presença do atendente na
  tela, que se repete sozinha.
