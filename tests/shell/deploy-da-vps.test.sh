#!/usr/bin/env bash
# ops/vps/deploy.sh: sobe a versão pedida e VOLTA SOZINHO quando ela não fica de pé.
#
# Docker e curl são dublês no PATH (registram o que foi pedido e respondem a
# saúde que o caso quer); git é de verdade, num repositório descartável com dois
# commits. O que se mede é o estado que sobra: commit do checkout, imagens no
# .env e o registro da versão anterior.
set -euo pipefail

# O repositório descartável não pode herdar GIT_DIR & cia. de quem roda a suíte.
unset $(git rev-parse --local-env-vars)
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

FONTE="$(cd "$(dirname "$0")/../.." && pwd)/ops/vps/deploy.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
falhas=0
ok()   { echo "  ok   $1"; }
erro() { echo "  FALHOU $1"; falhas=$((falhas + 1)); }

# ── dublês ───────────────────────────────────────────────────────────────────
mkdir -p "$T/bin"
cat > "$T/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "$DUBLE_LOG"
case "$1" in
  manifest) [ -f "$DUBLE_DIR/sem-imagem" ] && exit 1; exit 0 ;;
  inspect)
    id="${@: -1}"
    if [ "$id" = id-app ] && [ -f "$DUBLE_DIR/app-quebra" ] && grep -q "deskcommcrm:sha-$(cat "$DUBLE_DIR/sha-quebrado")" .env; then
      echo unhealthy
    else
      echo healthy
    fi ;;
  compose)
    shift; while [ "$1" = -f ] || [ "$1" = --env-file ]; do shift 2; done
    case "$1" in
      ps) echo "id-${@: -1}" ;;
      *) exit 0 ;;
    esac ;;
esac
EOF
cat > "$T/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf 200
EOF
cat > "$T/bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
command -v flock >/dev/null || printf '#!/usr/bin/env bash\nexit 0\n' > "$T/bin/flock"
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" DUBLE_DIR="$T" DUBLE_LOG="$T/docker.log"

# ── repositório: origem com dois commits, checkout no primeiro ───────────────
git init -q -b main "$T/origem"
(
  cd "$T/origem"
  mkdir -p ops/vps supabase/migrations
  cp "$FONTE" ops/vps/deploy.sh
  echo "services: {}" > docker-compose.prod.yml
  printf '.env\n.deploy/\n' > .gitignore
  git add -A; git commit -qm A
  echo "# B" >> docker-compose.prod.yml
  git commit -qam B
)
A="$(git -C "$T/origem" rev-parse HEAD~1)"
B="$(git -C "$T/origem" rev-parse HEAD)"

novo_checkout() {
  rm -rf "$T/vps" "$T/sem-imagem" "$T/app-quebra"
  git clone -q "$T/origem" "$T/vps"
  git -C "$T/vps" checkout -q --detach "$A"
  printf 'DOMAIN=crm.exemplo\nAPP_IMAGE=antiga/app:latest\nWORKER_IMAGE=antiga/worker:latest\n' > "$T/vps/.env"
  : > "$DUBLE_LOG"
}
roda() { (cd "$T/vps" && bash ops/vps/deploy.sh "$@") >"$T/saida" 2>&1; }

echo "deploy da VPS"

# 1. caminho feliz
novo_checkout
if roda "${B:0:7}"; then ok "deploy de B sai com sucesso"; else erro "deploy de B falhou: $(tail -3 "$T/saida")"; fi
[ "$(git -C "$T/vps" rev-parse HEAD)" = "$B" ] && ok "checkout em B" || erro "checkout não foi para B"
grep -q "^APP_IMAGE=ghcr.io/magnn/deskcommcrm:sha-${B:0:7}$" "$T/vps/.env" && ok "imagem fixada em sha-<B>" || erro "APP_IMAGE não fixada: $(grep APP_IMAGE "$T/vps/.env")"
grep -q "^SCHEDULER_IMAGE=ghcr.io/magnn/deskcomm-scheduler:sha-${B:0:7}$" "$T/vps/.env" && ok "chave ausente é acrescentada" || erro "SCHEDULER_IMAGE não acrescentada"
[ "$(cat "$T/vps/.deploy/anterior")" = "$A" ] && ok "anterior registrado = A" || erro "anterior errado"
ordem="$(grep -oE 'up -d --no-deps [a-z]+' "$DUBLE_LOG" | awk '{print $4}' | tr '\n' ' ')"
[ "$ordem" = "worker app scheduler " ] && ok "um serviço por vez: $ordem" || erro "ordem: $ordem"

# 1b. --voltar leva de volta para A
if roda --voltar && [ "$(git -C "$T/vps" rev-parse HEAD)" = "$A" ]; then ok "--voltar volta para A"; else erro "--voltar: $(tail -3 "$T/saida")"; fi

# 2. o app não fica saudável → volta sozinho
novo_checkout
touch "$T/app-quebra"; echo "${B:0:7}" > "$T/sha-quebrado"
if roda "${B:0:7}"; then erro "deploy quebrado saiu com sucesso"; else ok "deploy quebrado sai com erro"; fi
[ "$(git -C "$T/vps" rev-parse HEAD)" = "$A" ] && ok "checkout voltou para A" || erro "checkout ficou em $(git -C "$T/vps" rev-parse --short HEAD)"
grep -q '^APP_IMAGE=antiga/app:latest$' "$T/vps/.env" && ok ".env voltou ao de antes" || erro ".env não voltou: $(grep APP_IMAGE "$T/vps/.env")"
grep -q "voltou: ${A:0:7} no ar" "$T/saida" && ok "a volta foi conferida" || erro "sem confirmação da volta"

# 3. imagem que o CI não publicou → nem começa
novo_checkout
touch "$T/sem-imagem"
if roda "${B:0:7}"; then erro "subiu sem imagem"; else ok "recusa sem imagem publicada"; fi
[ "$(git -C "$T/vps" rev-parse HEAD)" = "$A" ] && ! grep -q "up -d" "$DUBLE_LOG" && ok "nada foi tocado" || erro "mexeu sem imagem"

# 4. migration nova → recusa sem a confirmação
novo_checkout
(
  cd "$T/origem"
  echo "select 1;" > supabase/migrations/20990101000000_9999_x.sql
  git add -A; git commit -qm C
)
C="$(git -C "$T/origem" rev-parse HEAD)"
if roda "${C:0:7}"; then erro "subiu migration sem confirmação"; else ok "recusa commit com migration nova"; fi
[ "$(git -C "$T/vps" rev-parse HEAD)" = "$A" ] && ok "checkout não saiu de A" || erro "checkout andou"
if roda "${C:0:7}" --migrations-aplicadas; then ok "com --migrations-aplicadas, sobe"; else erro "não subiu com a confirmação"; fi

# 5. pasta editada à mão → recusa
novo_checkout
echo "# à mão" >> "$T/vps/docker-compose.prod.yml"
if roda "${B:0:7}"; then erro "subiu com arquivo editado"; else ok "recusa checkout editado à mão"; fi

[ "$falhas" = 0 ] && echo "deploy da VPS: tudo verde" || { echo "deploy da VPS: $falhas falha(s)"; exit 1; }
