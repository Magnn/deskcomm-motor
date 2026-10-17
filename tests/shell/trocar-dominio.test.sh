#!/usr/bin/env bash
# ops/vps/trocar-dominio.sh: troca endereço por endereço (o nome pode mudar junto), mantém o antigo
# no Caddy, cria o www da raiz nova, não mexe no remetente de e-mail e recusa DNS faltando ou a mais.
set -euo pipefail
unset $(git rev-parse --local-env-vars)

FONTE="$(cd "$(dirname "$0")/../.." && pwd)/ops/vps/trocar-dominio.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
falhas=0
ok()   { echo "  ok   $1"; }
erro() { echo "  FALHOU $1"; falhas=$((falhas + 1)); }

mkdir -p "$T/bin" "$T/crm/ops/vps" "$T/supa"
for c in caddy systemctl docker; do printf '#!/usr/bin/env bash\necho "%s $*" >> "%s/chamadas"\n' "$c" "$T" > "$T/bin/$c"; done
# DNS de mentira: arquivo "dns" com linhas "host ip"
cat > "$T/bin/getent" <<EOF
#!/usr/bin/env bash
[ -f "$T/dns" ] || exit 2
awk -v h="\$2" '\$1 == h { print \$2 " STREAM " h }' "$T/dns"
EOF
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
ACME_EMAIL=admin@atendiment.sbs
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

PARES=(desk.atendiment.sbs=acassia.tech desk-api.atendiment.sbs=api.acassia.tech)
roda() { bash "$FONTE" "${PARES[@]}" "$@" > "$T/saida" 2>&1; }

echo "troca de endereços"

# 1. simulação não mexe em nada, e aponta o DNS que falta
roda || true
cmp -s "$T/crm/.env" "$T/env.orig" && cmp -s "$T/Caddyfile" "$T/caddy.orig" && ok "sem --aplicar, nada muda" || erro "a simulação mexeu em arquivo"
grep -q "DNS FALTA: acassia.tech" "$T/saida" && grep -q "DNS FALTA: www.acassia.tech" "$T/saida" && ok "mostra o DNS que falta, inclusive o www da raiz" || erro "não avisou do DNS: $(tail -4 "$T/saida")"

# 2. registro a mais (estacionamento do registrador) recusa
printf 'acassia.tech 9.9.9.9\nacassia.tech 2.57.91.91\nwww.acassia.tech 9.9.9.9\napi.acassia.tech 9.9.9.9\n' > "$T/dns"
if roda --aplicar; then erro "aplicou com registro a mais"; else ok "recusa endereço que aponta também para outro lugar"; fi
grep -q "DNS ERRADO: acassia.tech" "$T/saida" && ok "diz qual registro sobra" || erro "não apontou o registro a mais"
cmp -s "$T/crm/.env" "$T/env.orig" && ok "e não tocou no .env" || erro "tocou no .env com DNS errado"

# 3. com DNS certo, aplica
printf 'acassia.tech 9.9.9.9\nwww.acassia.tech 9.9.9.9\napi.acassia.tech 9.9.9.9\n' > "$T/dns"
if roda --aplicar; then ok "com DNS certo, aplica"; else erro "não aplicou: $(tail -3 "$T/saida")"; fi
grep -q '^DOMAIN=acassia.tech$' "$T/crm/.env" && grep -q '^NEXT_PUBLIC_APP_URL=https://acassia.tech$' "$T/crm/.env" \
  && grep -q '^NEXT_PUBLIC_SUPABASE_URL=https://api.acassia.tech$' "$T/crm/.env" \
  && grep -q '^TRANSCRIPTION_BASE_URL=https://acassia.tech/_ouvir$' "$T/crm/.env" && ok "o nome muda junto com o domínio" || erro "chaves do CRM: $(grep -E '^(DOMAIN|NEXT_PUBLIC_APP_URL|NEXT_PUBLIC_SUPABASE_URL)=' "$T/crm/.env" | tr '\n' ' ')"
grep -q '^RESEND_FROM_EMAIL=Cigana <oi@mail.atendiment.sbs>$' "$T/crm/.env" && grep -q '^ACME_EMAIL=admin@atendiment.sbs$' "$T/crm/.env" \
  && ok "remetente de e-mail não muda" || erro "mexeu no e-mail"
grep -q '^OUTRA=https://saas.atendiment.sbs$' "$T/crm/.env" && ok "chave fora da lista não muda" || erro "trocou chave fora da lista"
grep -q '^API_EXTERNAL_URL=https://api.acassia.tech/auth/v1$' "$T/supa/.env" && grep -q '^SITE_URL=https://acassia.tech$' "$T/supa/.env" \
  && grep -q '^SMTP_ADMIN_EMAIL=acesso@mail.atendiment.sbs$' "$T/supa/.env" && ok "Supabase: endereços trocados, e-mail não" || erro "Supabase: $(tr '\n' ' ' < "$T/supa/.env")"
grep -q '^desk.atendiment.sbs, acassia.tech {$' "$T/Caddyfile" && grep -q '^desk-api.atendiment.sbs, api.acassia.tech {$' "$T/Caddyfile" \
  && ok "Caddy: novo AO LADO do antigo" || erro "Caddy: $(grep '{' "$T/Caddyfile" | tr '\n' '|')"
grep -q '^www.acassia.tech {$' "$T/Caddyfile" && grep -q 'redir https://acassia.tech{uri} permanent' "$T/Caddyfile" \
  && ok "Caddy: www da raiz leva ao endereço novo" || erro "sem o bloco do www"
grep -q '^saas.atendiment.sbs {$' "$T/Caddyfile" && ok "Caddy: outros sites intactos" || erro "mexeu em outro site"
ls "$T/crm/.env.bak-antes-da-troca-"* >/dev/null 2>&1 && ls "$T/Caddyfile.bak-antes-da-troca-"* >/dev/null 2>&1 && ok "cópias de antes guardadas" || erro "sem cópias"
grep -q "systemctl reload caddy" "$T/chamadas" && grep -q "^deploy " "$T/chamadas" && ok "recarrega o Caddy e refaz o deploy" || erro "não recarregou/deploy"

# 4. rodar de novo não duplica
roda --aplicar || true
[ "$(grep -c 'acassia.tech {' "$T/Caddyfile")" = 3 ] && [ "$(grep -c '^www.acassia.tech {' "$T/Caddyfile")" = 1 ] \
  && ok "rodar de novo não duplica no Caddy" || erro "duplicou: $(grep '{' "$T/Caddyfile" | tr '\n' '|')"

[ "$falhas" = 0 ] && echo "troca de endereços: tudo verde" || { echo "troca de endereços: $falhas falha(s)"; exit 1; }
