#!/usr/bin/env bash
# ops/vps/trocar-dominio.sh: troca só as chaves de endereço, mantém o domínio
# antigo no Caddy, não mexe no remetente de e-mail e recusa sem DNS.
set -euo pipefail
unset $(git rev-parse --local-env-vars)

FONTE="$(cd "$(dirname "$0")/../.." && pwd)/ops/vps/trocar-dominio.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
falhas=0
ok()   { echo "  ok   $1"; }
erro() { echo "  FALHOU $1"; falhas=$((falhas + 1)); }

mkdir -p "$T/bin" "$T/crm/ops/vps" "$T/supa"
for c in caddy systemctl docker; do printf '#!/usr/bin/env bash\necho "%s $*" >> "$T/chamadas"\n' "$c" | sed "s#\$T#$T#" > "$T/bin/$c"; done
printf '#!/usr/bin/env bash\n[ -f "%s/dns-ok" ] && echo "9.9.9.9 STREAM x"\n' "$T" > "$T/bin/getent"
printf '#!/usr/bin/env bash\nprintf 200\n' > "$T/bin/curl"
printf '#!/usr/bin/env bash\necho "deploy $*" >> "%s/chamadas"\n' "$T" > "$T/crm/ops/vps/deploy.sh"
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" IP_DA_VPS=9.9.9.9 DESKCOMM_DIR="$T/crm" ENV_SUPA="$T/supa/.env" CADDYFILE="$T/Caddyfile"
git init -q "$T/crm"; GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t git -C "$T/crm" commit -q --allow-empty -m x

cat > "$T/crm/.env" <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://desk-api.atendiment.sbs
NEXT_PUBLIC_APP_URL=https://desk.atendiment.sbs
NEXT_PUBLIC_ADMIN_URL=https://desk.atendiment.sbs
DOMAIN=desk.atendiment.sbs
ACME_EMAIL=acesso@mail.atendiment.sbs
RESEND_FROM_EMAIL=Cigana <oi@mail.atendiment.sbs>
TRANSCRIPTION_BASE_URL=https://desk.atendiment.sbs/_ouvir
OUTRA=https://saas.atendiment.sbs
EOF
cat > "$T/supa/.env" <<'EOF'
SUPABASE_PUBLIC_URL=https://desk-api.atendiment.sbs
API_EXTERNAL_URL=https://desk-api.atendiment.sbs/auth/v1
SITE_URL=https://desk.atendiment.sbs
SMTP_ADMIN_EMAIL=acesso@mail.atendiment.sbs
EOF
cat > "$T/Caddyfile" <<'EOF'
saas.atendiment.sbs {
	reverse_proxy localhost:3123
}
desk.atendiment.sbs {
      reverse_proxy localhost:3300
}
desk-api.atendiment.sbs {
      reverse_proxy localhost:8000
}
EOF
cp "$T/crm/.env" "$T/env.orig"; cp "$T/Caddyfile" "$T/caddy.orig"

echo "troca de domínio"
roda() { bash "$FONTE" atendiment.sbs novo.com "$@" > "$T/saida" 2>&1; }

# 1. simulação não mexe em nada
roda || true
cmp -s "$T/crm/.env" "$T/env.orig" && cmp -s "$T/Caddyfile" "$T/caddy.orig" && ok "sem --aplicar, nada muda" || erro "a simulação mexeu em arquivo"
grep -q "DNS FALTA: desk.novo.com" "$T/saida" && ok "mostra o DNS que falta" || erro "não avisou do DNS"

# 2. --aplicar sem DNS recusa
if roda --aplicar; then erro "aplicou sem DNS"; else ok "recusa sem DNS apontando"; fi
cmp -s "$T/crm/.env" "$T/env.orig" && ok "e não tocou no .env" || erro "tocou no .env sem DNS"

# 3. com DNS, aplica
touch "$T/dns-ok"
if roda --aplicar; then ok "com DNS, aplica"; else erro "não aplicou: $(tail -3 "$T/saida")"; fi
grep -q '^DOMAIN=desk.novo.com$' "$T/crm/.env" && grep -q '^NEXT_PUBLIC_SUPABASE_URL=https://desk-api.novo.com$' "$T/crm/.env" \
  && grep -q '^TRANSCRIPTION_BASE_URL=https://desk.novo.com/_ouvir$' "$T/crm/.env" && ok "chaves de endereço do CRM trocadas" || erro "chaves do CRM"
grep -q '^RESEND_FROM_EMAIL=Cigana <oi@mail.atendiment.sbs>$' "$T/crm/.env" && grep -q '^ACME_EMAIL=acesso@mail.atendiment.sbs$' "$T/crm/.env" \
  && ok "remetente de e-mail não muda" || erro "mexeu no e-mail"
grep -q '^OUTRA=https://saas.atendiment.sbs$' "$T/crm/.env" && ok "chave fora da lista não muda" || erro "trocou chave fora da lista"
grep -q '^API_EXTERNAL_URL=https://desk-api.novo.com/auth/v1$' "$T/supa/.env" && grep -q '^SMTP_ADMIN_EMAIL=acesso@mail.atendiment.sbs$' "$T/supa/.env" \
  && ok "Supabase: endereços trocados, e-mail não" || erro "Supabase"
grep -q '^desk.atendiment.sbs, desk.novo.com {$' "$T/Caddyfile" && grep -q '^desk-api.atendiment.sbs, desk-api.novo.com {$' "$T/Caddyfile" \
  && ok "Caddy: novo AO LADO do antigo" || erro "Caddy: $(grep '{' "$T/Caddyfile" | tr '\n' '|')"
grep -q '^saas.atendiment.sbs {$' "$T/Caddyfile" && ok "Caddy: outros sites intactos" || erro "mexeu em outro site"
[ -f "$T/crm/.env.bak-antes-de-novo.com" ] && [ -f "$T/Caddyfile.bak-antes-de-novo.com" ] && ok "cópias de antes guardadas" || erro "sem cópias"
grep -q "systemctl reload caddy" "$T/chamadas" && grep -q "^deploy " "$T/chamadas" && ok "recarrega o Caddy e refaz o deploy" || erro "não recarregou/deploy"

# 4. rodar de novo não duplica
roda --aplicar || true
[ "$(grep -c 'desk.novo.com' "$T/Caddyfile")" = 1 ] && ok "rodar de novo não duplica no Caddy" || erro "duplicou: $(grep '{' "$T/Caddyfile" | tr '\n' '|')"

[ "$falhas" = 0 ] && echo "troca de domínio: tudo verde" || { echo "troca de domínio: $falhas falha(s)"; exit 1; }
