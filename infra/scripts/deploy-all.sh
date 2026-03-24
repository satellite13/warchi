#!/bin/bash
set -e

# Полный деплой всего стека wArchi в Yandex Cloud K8s
# Использование: ./deploy-all.sh

GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/.."
STATE_FILE="$INFRA_DIR/state.env"
if [ -f "$STATE_FILE" ]; then
  # shellcheck source=/dev/null
  source "$STATE_FILE"
fi
NAMESPACE="${NAMESPACE:-arch}"

# shellcheck source=guard-no-orbstack.sh
source "$SCRIPT_DIR/guard-no-orbstack.sh"
assert_not_orbstack
confirm_kubectl_deploy_target

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Деплой wArchi в Yandex Cloud           ${NC}"
echo -e "${GREEN}========================================${NC}"
echo

echo -e "${GREEN}[1/5]${NC} Создание K8s secrets..."
"$SCRIPT_DIR/create-secrets.sh"
echo

echo -e "${GREEN}[2/5]${NC} Установка cert-manager и ClusterIssuer..."
bash "$SCRIPT_DIR/setup-cert-manager.sh"
echo

echo -e "${GREEN}[3/5]${NC} Проверка расширений PostgreSQL..."
bash "$SCRIPT_DIR/check-db-extensions.sh" --strict
echo

echo -e "${GREEN}[4/5]${NC} Деплой arepos-server..."
"$SCRIPT_DIR/deploy-arepos-server.sh"
echo

echo -e "${GREEN}[5/5]${NC} Деплой warchi..."
"$SCRIPT_DIR/deploy-warchi.sh"
echo

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Деплой завершён!                       ${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo "Проверка:"
echo "  kubectl get pods -n arch"
echo "  kubectl get ingress -n arch"
