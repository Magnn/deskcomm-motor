#!/usr/bin/env bash
# Prova que o último backup RESTAURA: sobe um Postgres descartável com a mesma
# imagem da produção, aplica o dump e compara a contagem de linhas das tabelas
# principais com a produção. Backup que nunca foi restaurado não é backup.
#
#   bash ops/vps/testar-restauracao.sh [arquivo.sql.gz]   # roda no HOST (cron mensal)
set -euo pipefail

LOCAL="${BACKUP_LOCAL:-/var/backups/deskcomm}"
DUMP="${1:-$(ls -1t "$LOCAL"/db-*.sql.gz | head -1)}"
IMAGEM="$(docker inspect supabase-db -f '{{.Config.Image}}')"
NOME="deskcomm-restauracao-teste"
TABELAS=(organizations contacts conversations messages revenue_ledger)

docker rm -f "$NOME" >/dev/null 2>&1 || true
trap 'docker rm -f "$NOME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NOME" -e POSTGRES_PASSWORD=teste "$IMAGEM" >/dev/null
for _ in $(seq 1 60); do docker exec "$NOME" pg_isready -U postgres -q 2>/dev/null && break; sleep 2; done
sleep 5

echo "restaurando $(basename "$DUMP") em $IMAGEM"
# Sem ON_ERROR_STOP: o banco descartável já nasce com os schemas do Supabase
# (auth, storage…) e o dump os recria — esses "já existe" são esperados. O que
# decide é a contagem abaixo.
zcat "$DUMP" | docker exec -i "$NOME" psql -U postgres -d postgres -q >/dev/null 2>&1 || true

falhas=0
for t in "${TABELAS[@]}"; do
  prod="$(docker exec supabase-db psql -U postgres -d postgres -Atc "select count(*) from public.$t")"
  rest="$(docker exec "$NOME" psql -U postgres -d postgres -Atc "select count(*) from public.$t" 2>/dev/null || echo 0)"
  # o dump é de algumas horas atrás: aceita a produção ter crescido até 5%
  if [ "$rest" -gt 0 ] && [ $((rest * 105 / 100 + 50)) -ge "$prod" ] && [ "$rest" -le "$prod" ]; then
    printf '  ok      %-16s restaurado %8s | produção %8s\n' "$t" "$rest" "$prod"
  else
    printf '  FALHOU  %-16s restaurado %8s | produção %8s\n' "$t" "$rest" "$prod"; falhas=$((falhas + 1))
  fi
done
[ "$falhas" = 0 ] && { echo "restauração: ok"; date -u +%FT%TZ > "$LOCAL/ULTIMA_RESTAURACAO_OK"; } || { echo "restauração: $falhas tabela(s) não bateram"; exit 1; }
