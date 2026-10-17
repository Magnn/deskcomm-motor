#!/usr/bin/env bash
# Deploy de UMA versão na VPS, com volta automática se ela não subir.
#
#   bash ops/vps/deploy.sh                 # o topo da main do motor
#   bash ops/vps/deploy.sh 3f2a9c1         # um commit da main
#   bash ops/vps/deploy.sh --voltar        # a versão que estava antes do último deploy
#
# O que ele faz, em ordem:
#   1. resolve o commit e confere que as TRÊS imagens desse commit existem no
#      GHCR (`sha-<7>`, publicadas pelo CI) — nada é construído aqui;
#   2. recusa se o commit traz migration nova: schema vai ANTES, à parte, com
#      lock_timeout (ver ops/vps/README.md) — `--migrations-aplicadas` libera;
#   3. guarda a versão em uso, põe o checkout no commit e fixa as imagens no .env;
#   4. recria worker → app → scheduler, um de cada vez, esperando cada um ficar
#      saudável, e confere o domínio pela internet;
#   5. qualquer falha nos passos 3–4 volta tudo à versão anterior e sai com erro.
#
# Roda no diretório do checkout limpo (ver ops/vps/migrar-para-checkout-limpo.sh).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env)
REGISTRO="ghcr.io/magnn"
IMAGENS=(APP_IMAGE=deskcommcrm WORKER_IMAGE=deskcomm-worker SCHEDULER_IMAGE=deskcomm-scheduler)
SERVICOS=(worker app scheduler)
ESTADO="$RAIZ/.deploy"
ESPERA_S="${DEPLOY_ESPERA_S:-180}"

mkdir -p "$ESTADO"
exec 9>"$ESTADO/lock"
flock -n 9 || { echo "Outro deploy está rodando agora. Saindo." >&2; exit 1; }

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$ESTADO/historico.log" >&2; }
morre() { log "ERRO: $*"; exit 1; }

valor_no_env() { sed -n "s/^$1=//p" .env | tail -1; }

fixar_no_env() { # chave valor
  if grep -q "^$1=" .env; then sed -i "s#^$1=.*#$1=$2#" .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}

esperar_saudavel() { # serviço
  local id estado t=0
  id="$("${COMPOSE[@]}" ps -q "$1")"
  [ -n "$id" ] || return 1
  while [ "$t" -lt "$ESPERA_S" ]; do
    estado="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo ausente)"
    case "$estado" in
      healthy|running) [ "$estado" = running ] && [ "$t" -lt 20 ] || return 0 ;;
      unhealthy|exited|dead|ausente) return 1 ;;
    esac
    sleep 5; t=$((t + 5))
  done
  return 1
}

dominio_responde() {
  local d codigo
  d="$(valor_no_env DOMAIN)"
  [ -n "$d" ] || return 0
  codigo="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$d/" || echo 000)"
  case "$codigo" in 200|301|302|307|308) return 0 ;; esac
  log "o domínio $d respondeu $codigo"
  return 1
}

subir() { # recria os serviços um a um com o que está no .env e no checkout
  local s
  for s in "${SERVICOS[@]}"; do
    log "recriando $s"
    "${COMPOSE[@]}" up -d --no-deps "$s" >/dev/null 2>&1 || return 1
    esperar_saudavel "$s" || { log "$s não ficou saudável em ${ESPERA_S}s"; return 1; }
    if [ "$s" = app ]; then dominio_responde || return 1; fi
  done
}

# ── argumentos ───────────────────────────────────────────────────────────────
ALVO="origin/main"; VOLTAR=0; MIGRACOES_OK=0
for a in "$@"; do
  case "$a" in
    --voltar) VOLTAR=1 ;;
    --migrations-aplicadas) MIGRACOES_OK=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    -*) morre "opção desconhecida: $a" ;;
    *) ALVO="$a" ;;
  esac
done

[ -f .env ] || morre "sem .env em $RAIZ"
[ -z "$(git status --porcelain --untracked-files=no)" ] || morre "o checkout tem arquivo editado à mão — esta pasta só pode ter o que está no repositório (git status)"

ATUAL="$(git rev-parse HEAD)"

if [ "$VOLTAR" = 1 ]; then
  [ -f "$ESTADO/anterior" ] || morre "não há deploy anterior registrado"
  ALVO="$(cat "$ESTADO/anterior")"
  MIGRACOES_OK=1  # voltar não aplica schema; o anterior já rodou com este banco
fi

git fetch -q origin
SHA="$(git rev-parse --verify -q "${ALVO}^{commit}")" || morre "não achei o commit $ALVO"
CURTO="${SHA:0:7}"
log "deploy de $CURTO (em uso: ${ATUAL:0:7})"

# 1. as imagens desse commit existem?
for par in "${IMAGENS[@]}"; do
  ref="$REGISTRO/${par#*=}:sha-$CURTO"
  docker manifest inspect "$ref" >/dev/null 2>&1 || morre "a imagem $ref não existe — o CI desse commit terminou? (gh run list --commit $SHA)"
done

# 2. migration nova vai antes, à parte
NOVAS="$(git diff --name-only --diff-filter=A "$ATUAL" "$SHA" -- 'supabase/migrations/*.sql' || true)"
if [ -n "$NOVAS" ] && [ "$MIGRACOES_OK" = 0 ]; then
  printf '%s\n' "$NOVAS" >&2
  morre "este commit traz migration nova (acima). Aplique antes, com lock_timeout, e rode de novo com --migrations-aplicadas"
fi

# 3. guarda o que está no ar e troca
cp .env "$ESTADO/env.antes-de-$CURTO"
[ "$SHA" = "$ATUAL" ] || printf '%s\n' "$ATUAL" > "$ESTADO/anterior"

voltar() {
  log "VOLTANDO para ${ATUAL:0:7}"
  cp "$ESTADO/env.antes-de-$CURTO" .env
  git checkout -q --detach "$ATUAL"
  if subir; then log "voltou: ${ATUAL:0:7} no ar"; else log "A VOLTA TAMBÉM FALHOU — olhar à mão: ${COMPOSE[*]} ps"; fi
  exit 1
}

git checkout -q --detach "$SHA"
for par in "${IMAGENS[@]}"; do fixar_no_env "${par%%=*}" "$REGISTRO/${par#*=}:sha-$CURTO"; done
for s in APP WORKER SCHEDULER; do fixar_no_env "${s}_PULL_POLICY" missing; done

log "baixando as imagens"
"${COMPOSE[@]}" pull -q "${SERVICOS[@]}" || voltar

# 4. sobe um de cada vez
subir || voltar

log "pronto: $CURTO no ar"
