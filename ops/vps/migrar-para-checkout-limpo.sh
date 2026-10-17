#!/usr/bin/env bash
# Troca, UMA vez, a pasta que roda o CRM: da cópia antiga (repositório original,
# editada à mão) para um checkout limpo do motor, sem nada fora do repositório.
#
#   bash migrar-para-checkout-limpo.sh [commit]     # roda no HOST, como root
#
# Mantém o nome do projeto Docker (`deskcommcrm`): contêineres, volumes (sessão
# do WhatsApp) e a rede interna seguem os mesmos — a ponte da porta 3300 do Caddy
# aponta para `deskcommcrm-app-1` e continua achando. A pasta antiga fica
# intacta, para voltar (ver ops/vps/README.md).
set -euo pipefail

ANTIGO="${ANTIGO:-/opt/deskcommcrm-stack/DeskcommCRM}"
NOVO="${NOVO:-/opt/deskcommcrm-stack/deskcomm}"
REPO="${REPO:-https://github.com/Magnn/deskcomm-motor.git}"
ALVO="${1:-origin/main}"

[ -f "$ANTIGO/.env" ] || { echo "não achei $ANTIGO/.env" >&2; exit 1; }

if [ ! -d "$NOVO/.git" ]; then
  git clone -q "$REPO" "$NOVO"
fi
cd "$NOVO"
git fetch -q origin
git checkout -q --detach "$(git rev-parse --verify "${ALVO}^{commit}")"

# Configuração própria desta instalação: só o que não está no repositório.
if [ ! -f .env ]; then
  install -m 600 "$ANTIGO/.env" .env
fi
[ -f .env.cron-drain ] || install -m 600 "$ANTIGO/.env.cron-drain" .env.cron-drain

# O nome do projeto deixa de depender do nome da pasta.
if grep -q '^COMPOSE_PROJECT_NAME=' .env; then
  sed -i 's/^COMPOSE_PROJECT_NAME=.*/COMPOSE_PROJECT_NAME=deskcommcrm/' .env
else
  printf '\nCOMPOSE_PROJECT_NAME=deskcommcrm\n' >> .env
fi

# Cron: sai o atualizador do kit original (o botão "Atualizar agora" rodaria a
# versão do repositório ORIGINAL por cima desta) e o drain passa a ler o
# segredo da pasta nova.
crontab -l > "$NOVO/.deploy-crontab.antes" 2>/dev/null || true
crontab -l 2>/dev/null \
  | grep -v 'hostgator-setup-kit/agent.sh' \
  | sed "s#$ANTIGO/.env.cron-drain#$NOVO/.env.cron-drain#g" \
  | crontab -

echo "Checkout limpo pronto em $NOVO ($(git rev-parse --short HEAD))."
echo "Agora: bash $NOVO/ops/vps/deploy.sh $(git rev-parse --short HEAD) --migrations-aplicadas"
