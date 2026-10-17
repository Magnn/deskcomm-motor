#!/usr/bin/env bash
# Troca o domínio da instalação — com o ANTIGO continuando a responder junto.
#
#   bash ops/vps/trocar-dominio.sh atendiment.sbs novodominio.com            # só mostra
#   bash ops/vps/trocar-dominio.sh atendiment.sbs novodominio.com --aplicar  # aplica
#
# Os endereços seguem o mesmo prefixo: desk.<antigo> → desk.<novo> (o app) e
# desk-api.<antigo> → desk-api.<novo> (o Supabase). O antigo NÃO sai do Caddy:
# webhooks da Meta, Cakto e Stripe e os links já mandados às clientes apontam
# para ele, e cada painel é atualizado à mão, no seu tempo. Quando todos
# estiverem no novo, o antigo sai do Caddy (a lista sai no fim).
#
# O que muda, e só isto:
#   .env do CRM ......... DOMAIN, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_ADMIN_URL,
#                         NEXT_PUBLIC_SUPABASE_URL, TRANSCRIPTION_BASE_URL
#   .env do Supabase .... SITE_URL, API_EXTERNAL_URL, SUPABASE_PUBLIC_URL
#   Caddyfile do host ... o domínio novo entra AO LADO do antigo em cada bloco
# Remetente de e-mail (RESEND_FROM_EMAIL, SMTP_ADMIN_EMAIL) fica: domínio de
# e-mail novo exige verificação de DNS no Resend antes, senão nenhum e-mail sai.
#
# Antes de aplicar ele confere que os endereços novos já apontam para esta VPS
# (sem isso o certificado não sai). Cada arquivo ganha cópia `.bak-antes-de-<novo>`.
set -euo pipefail

ANTIGO="${1:?uso: trocar-dominio.sh <antigo> <novo> [--aplicar]}"
NOVO="${2:?uso: trocar-dominio.sh <antigo> <novo> [--aplicar]}"
APLICAR=0; [ "${3:-}" = "--aplicar" ] && APLICAR=1

RAIZ="${DESKCOMM_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
ENV_CRM="${ENV_CRM:-$RAIZ/.env}"
ENV_SUPA="${ENV_SUPA:-/opt/supabase-selfhost/supabase/docker/.env}"
CADDY="${CADDYFILE:-/etc/caddy/Caddyfile}"
IP_DA_VPS="${IP_DA_VPS:-$(curl -fsS --max-time 10 https://api.ipify.org || true)}"
PREFIXOS=(desk desk-api)

CHAVES_CRM=(DOMAIN NEXT_PUBLIC_APP_URL NEXT_PUBLIC_ADMIN_URL NEXT_PUBLIC_SUPABASE_URL TRANSCRIPTION_BASE_URL)
CHAVES_SUPA=(SITE_URL API_EXTERNAL_URL SUPABASE_PUBLIC_URL)

esc() { printf '%s' "$1" | sed 's/[.[\*^$/]/\\&/g'; }
A="$(esc "$ANTIGO")"

# o .env com as chaves trocadas, em stdout
env_trocado() { # arquivo chaves...
  local f="$1"; shift
  local expr="" k
  for k in "$@"; do expr="$expr;/^$k=/s/$A/$NOVO/g"; done
  sed "${expr#;}" "$f"
}

# o Caddyfile com o domínio novo ao lado do antigo, em stdout
caddy_trocado() {
  local expr="" p
  for p in "${PREFIXOS[@]}"; do
    # só a linha que ABRE o bloco do site, e só se o novo ainda não estiver lá
    expr="$expr;/^$(esc "$p.$ANTIGO")\( *,[^{]*\)\? *{/{/$(esc "$p.$NOVO")/!s/^\($(esc "$p.$ANTIGO")\)/\1, $p.$NOVO/}"
  done
  sed "${expr#;}" "$CADDY"
}

mostrar() { # nome original novo
  if diff -q "$2" <(printf '%s\n' "$3") >/dev/null; then echo "  $1: nada muda"; return; fi
  echo "  $1:"
  # `diff` sai com 1 quando há diferença — é o caso esperado, não falha
  { diff "$2" <(printf '%s\n' "$3") || true; } | sed -n 's/^> /    + /p'
}

echo "Troca de domínio: $ANTIGO → $NOVO (o antigo continua respondendo)"
NOVO_CRM="$(env_trocado "$ENV_CRM" "${CHAVES_CRM[@]}")"
NOVO_SUPA="$( [ -f "$ENV_SUPA" ] && env_trocado "$ENV_SUPA" "${CHAVES_SUPA[@]}" || true)"
NOVO_CADDY="$( [ -f "$CADDY" ] && caddy_trocado || true)"
mostrar ".env do CRM" "$ENV_CRM" "$NOVO_CRM" | sed -E 's/(=.{0,60}).*/\1/'
[ -f "$ENV_SUPA" ] && mostrar ".env do Supabase" "$ENV_SUPA" "$NOVO_SUPA" | sed -E 's/(=.{0,60}).*/\1/'
[ -f "$CADDY" ] && mostrar "Caddyfile" "$CADDY" "$NOVO_CADDY"

# os endereços novos apontam para cá?
dns_ok=1
for p in "${PREFIXOS[@]}"; do
  ip="$( { getent ahostsv4 "$p.$NOVO" 2>/dev/null || true; } | awk 'NR==1{print $1}')"
  if [ -n "$IP_DA_VPS" ] && [ "$ip" = "$IP_DA_VPS" ]; then echo "  DNS ok: $p.$NOVO → $ip"
  else echo "  DNS FALTA: $p.$NOVO → ${ip:-nada} (precisa ser ${IP_DA_VPS:-o IP desta VPS})"; dns_ok=0; fi
done

if [ "$APLICAR" = 0 ]; then echo "Nada foi aplicado. Rode de novo com --aplicar."; exit 0; fi
[ "$dns_ok" = 1 ] || { echo "Recusado: crie os registros A no DNS antes (sem isso o certificado não sai)."; exit 1; }

# aplica: cópia de cada arquivo, depois troca, depois valida o Caddy
cp -p "$ENV_CRM" "$ENV_CRM.bak-antes-de-$NOVO"; printf '%s\n' "$NOVO_CRM" > "$ENV_CRM"
if [ -f "$ENV_SUPA" ]; then cp -p "$ENV_SUPA" "$ENV_SUPA.bak-antes-de-$NOVO"; printf '%s\n' "$NOVO_SUPA" > "$ENV_SUPA"; fi
cp -p "$CADDY" "$CADDY.bak-antes-de-$NOVO"; printf '%s\n' "$NOVO_CADDY" > "$CADDY"
if ! caddy validate --config "$CADDY" --adapter caddyfile >/dev/null 2>&1; then
  cp -p "$CADDY.bak-antes-de-$NOVO" "$CADDY"
  echo "Recusado: o Caddyfile novo não valida — restaurado o anterior. Nada foi recarregado."; exit 1
fi
systemctl reload caddy

# serviços que leem os endereços
( cd "$(dirname "$ENV_SUPA")" && docker compose up -d auth studio >/dev/null )
bash "$RAIZ/ops/vps/deploy.sh" "$(git -C "$RAIZ" rev-parse --short HEAD)" --migrations-aplicadas

for p in "${PREFIXOS[@]}"; do
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "https://$p.$NOVO/" || echo 000)"
  echo "  https://$p.$NOVO/ → $c"
done

cat <<EOF

Feito. O domínio antigo continua respondendo. Falta, à mão, em cada painel:
  - Meta (app Arcanum): Webhook e URIs de redirecionamento do OAuth → https://desk.$NOVO
  - Login com Facebook (config_id): domínio do app e URL do site
  - Cakto e Stripe: endpoint de webhook → https://desk.$NOVO/api/v1/webhooks/...
  - Resend: verificar o domínio de e-mail novo, depois trocar RESEND_FROM_EMAIL
  - Supabase Auth: ADDITIONAL_REDIRECT_URLS, se algum login externo usar
Quando todos apontarem para o novo, tire "desk.$ANTIGO" e "desk-api.$ANTIGO" do Caddyfile.
EOF
