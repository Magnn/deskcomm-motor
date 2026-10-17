#!/usr/bin/env bash
# Troca os endereços da instalação — com os ANTIGOS continuando a responder junto.
#
#   bash ops/vps/trocar-dominio.sh desk.atendiment.sbs=acassia.tech desk-api.atendiment.sbs=api.acassia.tech
#   bash ops/vps/trocar-dominio.sh desk.atendiment.sbs=acassia.tech desk-api.atendiment.sbs=api.acassia.tech --aplicar
#
# Cada par é `endereço antigo=endereço novo`, inteiro: o nome pode mudar junto com o domínio
# (`desk.` vira a raiz, `desk-api.` vira `api.`). O antigo NÃO sai do Caddy: webhooks da Meta,
# Cakto e Stripe e os links já mandados às clientes apontam para ele, e cada painel é atualizado à
# mão, no seu tempo. Quando todos estiverem no novo, o antigo sai do Caddy (a lista sai no fim).
# Endereço novo na raiz do domínio (dois rótulos, como `acassia.tech`) ganha o `www.` levando a ele.
#
# O que muda, e só isto:
#   .env do CRM ......... DOMAIN, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_ADMIN_URL,
#                         NEXT_PUBLIC_SUPABASE_URL, TRANSCRIPTION_BASE_URL
#   .env do Supabase .... SITE_URL, API_EXTERNAL_URL, SUPABASE_PUBLIC_URL
#   Caddyfile do host ... o endereço novo entra AO LADO do antigo em cada bloco (+ o bloco do www)
# Remetente de e-mail (RESEND_FROM_EMAIL, SMTP_ADMIN_EMAIL, ACME_EMAIL) fica: domínio de e-mail novo
# exige verificação de DNS no Resend antes, senão nenhum e-mail sai.
#
# Antes de aplicar ele confere que cada endereço novo aponta SÓ para esta VPS (um registro a mais —
# a página de estacionamento do registrador, por exemplo — manda metade das visitas para outro lugar
# e o certificado pode não sair). Cada arquivo ganha cópia `.bak-antes-da-troca-<data>`.
set -euo pipefail

PARES=(); APLICAR=0
for a in "$@"; do
  case "$a" in
    --aplicar) APLICAR=1 ;;
    *=*) PARES+=("$a") ;;
    *) echo "argumento inválido: $a (use antigo=novo)" >&2; exit 2 ;;
  esac
done
[ "${#PARES[@]}" -gt 0 ] || { echo "uso: trocar-dominio.sh antigo=novo [antigo=novo…] [--aplicar]" >&2; exit 2; }

RAIZ="${DESKCOMM_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
ENV_CRM="${ENV_CRM:-$RAIZ/.env}"
ENV_SUPA="${ENV_SUPA:-/opt/supabase-selfhost/supabase/docker/.env}"
CADDY="${CADDYFILE:-/etc/caddy/Caddyfile}"
IP_DA_VPS="${IP_DA_VPS:-$(curl -fsS --max-time 10 https://api.ipify.org || true)}"
SUFIXO="$(date +%Y%m%d-%H%M)"

CHAVES_CRM=(DOMAIN NEXT_PUBLIC_APP_URL NEXT_PUBLIC_ADMIN_URL NEXT_PUBLIC_SUPABASE_URL TRANSCRIPTION_BASE_URL)
CHAVES_SUPA=(SITE_URL API_EXTERNAL_URL SUPABASE_PUBLIC_URL)

esc() { printf '%s' "$1" | sed 's/[.[\*^$/]/\\&/g'; }
raiz_do_dominio() { [ "$(printf '%s' "$1" | tr -cd '.' | wc -c)" -eq 1 ]; }

# o .env com os endereços trocados nas chaves listadas, em stdout. O endereço antigo só casa inteiro:
# `desk.atendiment.sbs` não pode trocar dentro de `desk-api.atendiment.sbs`.
env_trocado() { # arquivo chaves...
  local f="$1"; shift
  local expr="" k par antigo novo
  for k in "$@"; do
    for par in "${PARES[@]}"; do
      antigo="${par%%=*}"; novo="${par#*=}"
      expr="$expr;/^$k=/s#\([=/@.]\)$(esc "$antigo")\([/:\"' ]\|\$\)#\1$novo\2#g"
    done
  done
  sed "${expr#;}" "$f"
}

# o Caddyfile com cada endereço novo ao lado do antigo, e o www da raiz nova, em stdout
caddy_trocado() {
  local expr="" par antigo novo extra=""
  for par in "${PARES[@]}"; do
    antigo="${par%%=*}"; novo="${par#*=}"
    # só a linha que ABRE o bloco do site, e só se o novo ainda não estiver lá
    expr="$expr;/^$(esc "$antigo")\( *,[^{]*\)\? *{/{/\(^\|[ ,]\)$(esc "$novo")\( *,\| *{\)/!s/^\($(esc "$antigo")\)/\1, $novo/}"
    if raiz_do_dominio "$novo" && ! grep -q "^www\.$(esc "$novo") *{" "$CADDY"; then
      extra="$extra
www.$novo {
	redir https://$novo{uri} permanent
}"
    fi
  done
  sed "${expr#;}" "$CADDY"
  [ -z "$extra" ] || printf '%s\n' "$extra"
}

mostrar() { # nome original novo
  if diff -q "$2" <(printf '%s\n' "$3") >/dev/null; then echo "  $1: nada muda"; return; fi
  echo "  $1:"
  # `diff` sai com 1 quando há diferença — é o caso esperado, não falha
  { diff "$2" <(printf '%s\n' "$3") || true; } | sed -n 's/^> /    + /p'
}

echo "Troca de endereços (os antigos continuam respondendo):"
for par in "${PARES[@]}"; do echo "  ${par%%=*} → ${par#*=}"; done
NOVO_CRM="$(env_trocado "$ENV_CRM" "${CHAVES_CRM[@]}")"
NOVO_SUPA="$( [ -f "$ENV_SUPA" ] && env_trocado "$ENV_SUPA" "${CHAVES_SUPA[@]}" || true)"
NOVO_CADDY="$( [ -f "$CADDY" ] && caddy_trocado || true)"
mostrar ".env do CRM" "$ENV_CRM" "$NOVO_CRM" | sed -E 's/(=.{0,70}).*/\1/'
[ -f "$ENV_SUPA" ] && mostrar ".env do Supabase" "$ENV_SUPA" "$NOVO_SUPA" | sed -E 's/(=.{0,70}).*/\1/'
[ -f "$CADDY" ] && mostrar "Caddyfile" "$CADDY" "$NOVO_CADDY"

# cada endereço novo aponta SÓ para cá?
dns_ok=1
for par in "${PARES[@]}"; do
  novo="${par#*=}"
  hosts=("$novo"); raiz_do_dominio "$novo" && hosts+=("www.$novo")
  for h in "${hosts[@]}"; do
    ips="$( { getent ahostsv4 "$h" 2>/dev/null || true; } | awk '{print $1}' | sort -u | tr '\n' ' ' | sed 's/ $//')"
    if [ -n "$IP_DA_VPS" ] && [ "$ips" = "$IP_DA_VPS" ]; then echo "  DNS ok: $h → $ips"
    elif [ -z "$ips" ]; then echo "  DNS FALTA: $h → nada (precisa ser ${IP_DA_VPS:-o IP desta VPS})"; dns_ok=0
    else echo "  DNS ERRADO: $h → $ips (precisa ser só ${IP_DA_VPS:-o IP desta VPS}; apague os outros registros)"; dns_ok=0; fi
  done
done

if [ "$APLICAR" = 0 ]; then echo "Nada foi aplicado. Rode de novo com --aplicar."; exit 0; fi
[ "$dns_ok" = 1 ] || { echo "Recusado: acerte o DNS antes (sem isso o certificado não sai)."; exit 1; }

# aplica: cópia de cada arquivo, depois troca, depois valida o Caddy
cp -p "$ENV_CRM" "$ENV_CRM.bak-antes-da-troca-$SUFIXO"; printf '%s\n' "$NOVO_CRM" > "$ENV_CRM"
if [ -f "$ENV_SUPA" ]; then cp -p "$ENV_SUPA" "$ENV_SUPA.bak-antes-da-troca-$SUFIXO"; printf '%s\n' "$NOVO_SUPA" > "$ENV_SUPA"; fi
cp -p "$CADDY" "$CADDY.bak-antes-da-troca-$SUFIXO"; printf '%s\n' "$NOVO_CADDY" > "$CADDY"
if ! caddy validate --config "$CADDY" --adapter caddyfile >/dev/null 2>&1; then
  cp -p "$CADDY.bak-antes-da-troca-$SUFIXO" "$CADDY"
  echo "Recusado: o Caddyfile novo não valida — restaurado o anterior. Nada foi recarregado."; exit 1
fi
systemctl reload caddy

# serviços que leem os endereços
( cd "$(dirname "$ENV_SUPA")" && docker compose up -d auth studio >/dev/null )
bash "$RAIZ/ops/vps/deploy.sh" "$(git -C "$RAIZ" rev-parse --short HEAD)" --migrations-aplicadas

for par in "${PARES[@]}"; do
  novo="${par#*=}"
  c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "https://$novo/" || echo 000)"
  echo "  https://$novo/ → $c"
done

NOVO_APP="${PARES[0]#*=}"
cat <<EOF

Feito. Os endereços antigos continuam respondendo. Falta, à mão, em cada painel:
  - Meta (app): Webhook e URIs de redirecionamento do OAuth → https://$NOVO_APP
  - Login com Facebook (config_id): domínio do app e URL do site
  - Cakto e Stripe: endpoint de webhook → https://$NOVO_APP/api/v1/webhooks/...
  - Resend: verificar o domínio de e-mail novo, depois trocar RESEND_FROM_EMAIL
  - Supabase Auth: ADDITIONAL_REDIRECT_URLS, se algum login externo usar
Quando todos apontarem para o novo, tire os endereços antigos do Caddyfile.
EOF
