#!/usr/bin/env bash
# Backup diário da produção, com cópia FORA da VPS (Google Drive via rclone).
#
#   bash ops/vps/backup.sh          # roda no HOST, como root (cron diário)
#
# 1. banco (pg_dump) e sessões do WhatsApp em /var/backups/deskcomm;
# 2. confere que o dump está inteiro (gzip íntegro e o rodapé do pg_dump);
# 3. manda ao Drive: diário (8 dias), semanal aos domingos (5 semanas) e mensal
#    no dia 1 (6 meses), e confere o tamanho do que chegou;
# 4. espelha os anexos do Storage (2,7 GB em 17/10/2026) de forma INCREMENTAL —
#    copiar tudo todo dia não cabe no Drive — guardando por 30 dias o que foi
#    apagado ou trocado;
# 5. grava `ULTIMO_OK` só se tudo passou. Qualquer falha sai com erro e fica no
#    log: backup que falha em silêncio é o pior modo de falha.
set -euo pipefail

LOCAL="${BACKUP_LOCAL:-/var/backups/deskcomm}"
REMOTO="${BACKUP_REMOTO:-gdrive:DeskcommCRM-backups}"
STORAGE="${SUPABASE_STORAGE_DIR:-/opt/supabase-selfhost/supabase/docker/volumes/storage}"
LOG="${BACKUP_LOG:-/var/log/deskcomm-backup.log}"

mkdir -p "$LOCAL"
exec 9>"$LOCAL/.lock"
flock -n 9 || { echo "outro backup rodando" >&2; exit 1; }
exec > >(tee -a "$LOG") 2>&1
echo "== $(date -u +%FT%TZ) backup"

# 1. O banco mora nesta mesma máquina: o dump roda DENTRO do `supabase-db`, como
# superusuário — o `pg_dump` só despeja o que a role enxerga, e com uma role
# menor o backup sai parcial e verde. Mesmas opções do kit (backup.sh).
TS="$(date +%Y%m%d-%H%M%S)"
DB="$LOCAL/db-$TS.sql.gz"
docker exec supabase-db pg_dump -U postgres -d postgres --no-owner --no-privileges | gzip > "$DB.parcial"
mv "$DB.parcial" "$DB"

# Sessões do WhatsApp: só entram se o arquivo tiver sessão dentro (volume errado
# renderia um .tgz vazio que "dá certo").
WAHA=""
vol="$(docker inspect deskcommcrm-waha-1 --format '{{range .Mounts}}{{if eq .Destination "/app/.sessions"}}{{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}}{{end}}{{end}}' 2>/dev/null || true)"
if [ -n "$vol" ] \
   && docker run --rm -v "$vol:/data:ro" -v "$LOCAL:/out" alpine:3.20 tar czf "/out/.waha-$TS.parcial" -C /data . \
   && [ "$(tar tzf "$LOCAL/.waha-$TS.parcial" | wc -l)" -gt 3 ]; then
  mv "$LOCAL/.waha-$TS.parcial" "$LOCAL/waha-$TS.tgz"; WAHA="$LOCAL/waha-$TS.tgz"
else
  rm -f "$LOCAL/.waha-$TS.parcial"; echo "AVISO: sessões do WhatsApp não entraram neste backup (volume '${vol:-?}')"
fi
# Local: os 7 mais recentes (o histórico longo mora no Drive).
(ls -1t "$LOCAL"/db-*.sql.gz | tail -n +8 | xargs -r rm -f) || true
(ls -1t "$LOCAL"/waha-*.tgz 2>/dev/null | tail -n +8 | xargs -r rm -f) || true

# 2. o dump está inteiro?
gzip -t "$DB"
zcat "$DB" | tail -5 | grep -q "PostgreSQL database dump complete" \
  || { echo "ERRO: $DB não termina com o rodapé do pg_dump — dump cortado"; exit 1; }
echo "dump íntegro: $(du -h "$DB" | cut -f1)"

# 3. fora da VPS
ARQUIVOS=("$DB"); [ -n "$WAHA" ] && ARQUIVOS+=("$WAHA")
for f in "${ARQUIVOS[@]}"; do rclone copy "$f" "$REMOTO/diario/"; done
if [ "$(date +%u)" = 7 ]; then for f in "${ARQUIVOS[@]}"; do rclone copy "$f" "$REMOTO/semanal/"; done; fi
if [ "$(date +%d)" = 01 ]; then for f in "${ARQUIVOS[@]}"; do rclone copy "$f" "$REMOTO/mensal/"; done; fi
rclone delete "$REMOTO/diario"  --min-age 8d
rclone delete "$REMOTO/semanal" --min-age 36d 2>/dev/null || true
rclone delete "$REMOTO/mensal"  --min-age 190d 2>/dev/null || true

# o dump do dia chegou com o mesmo tamanho?
remoto="$(rclone size --json "$REMOTO/diario/$(basename "$DB")" | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
[ "$remoto" = "$(stat -c %s "$DB")" ] \
  || { echo "ERRO: o dump no Drive tem ${remoto:-0} bytes, o local $(stat -c %s "$DB")"; exit 1; }

# 4. anexos: espelho incremental, com 30 dias do que saiu
if [ -d "$STORAGE" ]; then
  rclone sync "$STORAGE" "$REMOTO/storage" --backup-dir "$REMOTO/storage-removidos/$(date +%F)" --fast-list
  rclone delete "$REMOTO/storage-removidos" --min-age 30d 2>/dev/null || true
  rclone rmdirs "$REMOTO/storage-removidos" --leave-root 2>/dev/null || true
fi

date -u +%FT%TZ > "$LOCAL/ULTIMO_OK"
echo "== ok: $(basename "$DB") no Drive"
