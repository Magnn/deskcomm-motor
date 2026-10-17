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

O nome do projeto Docker continua `deskcommcrm` (`COMPOSE_PROJECT_NAME` no `.env`):
contêineres, volumes e rede seguem os mesmos. Para voltar à pasta antiga:

```bash
cd /opt/deskcommcrm-stack/DeskcommCRM
docker compose -f docker-compose.prod.yml --env-file .env up -d worker app scheduler
crontab /opt/deskcommcrm-stack/deskcomm/.deploy-crontab.antes
```

## O que ainda não está aqui

- O `reverse_proxy` do Caddy do host passa por uma ponte `socat` (porta 3300). Ela
  aceita a conexão mesmo com o `app` reiniciando, então o Caddy não tem como
  segurar e repetir a requisição: durante a recriação do `app` o webhook pode levar
  502. O conserto é o Caddy falar direto com o `app`.
- Backup automático do banco para fora da VPS.
- Rotinas do crontab do host ainda chamam o domínio pela internet, com segredo na
  linha do cron.
