#!/bin/bash
set -e

# Полный деплой всего стека wArchi в Yandex Cloud K8s
# Использование: ./deploy-all.sh

GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/.."
PROFILE_NAME=""

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--profile)
      if [ -z "${2:-}" ]; then
        echo "Для --profile требуется имя профиля"
        echo "Использование: $0 [--profile <name>]"
        exit 1
      fi
      PROFILE_NAME="$2"
      shift 2
      ;;
    -h|--help)
      echo "Использование: $0 [--profile <name>]"
      exit 0
      ;;
    *)
      echo "Неизвестный аргумент: $1"
      echo "Использование: $0 [--profile <name>]"
      exit 1
      ;;
  esac
done

if [ -z "${STATE_FILE:-}" ]; then
  if [ -n "$PROFILE_NAME" ]; then
    STATE_FILE="$INFRA_DIR/state.${PROFILE_NAME}.env"
  else
    STATE_FILE="$INFRA_DIR/state.env"
  fi
fi
if [ -f "$STATE_FILE" ]; then
  # shellcheck source=/dev/null
  source "$STATE_FILE"
fi

if [ -n "$PROFILE_NAME" ] && [ -z "${ENV_FILE:-}" ]; then
  ENV_FILE="$INFRA_DIR/env.${PROFILE_NAME}.local"
fi
if [ -n "${ENV_FILE:-}" ] && [ -f "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
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
echo -e "${GREEN}[INFO]${NC} Используется state файл: $STATE_FILE"
if [ -n "${ENV_FILE:-}" ]; then
  echo -e "${GREEN}[INFO]${NC} Используется env файл: $ENV_FILE"
fi
echo

echo -e "${GREEN}[1/5]${NC} Создание K8s secrets..."
"$SCRIPT_DIR/create-secrets.sh" ${PROFILE_NAME:+--profile "$PROFILE_NAME"}
echo

echo -e "${GREEN}[2/5]${NC} Установка cert-manager и ClusterIssuer..."
bash "$SCRIPT_DIR/setup-cert-manager.sh"
echo

echo -e "${GREEN}[3/5]${NC} Проверка расширений PostgreSQL..."
bash "$SCRIPT_DIR/check-db-extensions.sh" --strict ${PROFILE_NAME:+--profile "$PROFILE_NAME"}
echo

echo -e "${GREEN}[4/5]${NC} Деплой arepos-server..."
"$SCRIPT_DIR/deploy-arepos-server.sh" ${PROFILE_NAME:+--profile "$PROFILE_NAME"}
echo

echo -e "${GREEN}[5/5]${NC} Деплой warchi..."
"$SCRIPT_DIR/deploy-warchi.sh" ${PROFILE_NAME:+--profile "$PROFILE_NAME"}
echo

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Деплой завершён!                       ${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo "Проверка:"
echo "  kubectl get pods -n arch"
echo "  kubectl get ingress -n arch"
