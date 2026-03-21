#!/bin/bash
set -e

# Полный деплой всего стека wArchi в Yandex Cloud K8s
# Использование: ./deploy-all.sh

GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Деплой wArchi в Yandex Cloud           ${NC}"
echo -e "${GREEN}========================================${NC}"
echo

echo -e "${GREEN}[1/4]${NC} Создание K8s secrets..."
"$SCRIPT_DIR/create-secrets.sh"
echo

echo -e "${GREEN}[2/4]${NC} Проверка расширений PostgreSQL..."
bash "$SCRIPT_DIR/check-db-extensions.sh" --strict
echo

echo -e "${GREEN}[3/4]${NC} Деплой arepos-server..."
"$SCRIPT_DIR/deploy-arepos-server.sh"
echo

echo -e "${GREEN}[4/4]${NC} Деплой warchi..."
"$SCRIPT_DIR/deploy-warchi.sh"
echo

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Деплой завершён!                       ${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo "Проверка:"
echo "  kubectl get pods -n arch"
echo "  kubectl get ingress -n arch"
