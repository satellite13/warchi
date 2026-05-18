#!/bin/bash
set -e

# Удаление всей инфраструктуры из Yandex Cloud
# ВНИМАНИЕ: Это необратимая операция!

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE_NAME=""

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--profile)
      if [ -z "${2:-}" ]; then
        echo -e "${RED}[ERROR]${NC} Для --profile требуется имя профиля"
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
      echo -e "${RED}[ERROR]${NC} Неизвестный аргумент: $1"
      echo "Использование: $0 [--profile <name>]"
      exit 1
      ;;
  esac
done

if [ -z "${STATE_FILE:-}" ]; then
  if [ -n "$PROFILE_NAME" ]; then
    STATE_FILE="$SCRIPT_DIR/../state.${PROFILE_NAME}.env"
  else
    STATE_FILE="$SCRIPT_DIR/../state.env"
  fi
fi

if [ ! -f "$STATE_FILE" ]; then
  echo -e "${RED}[ERROR]${NC} Файл state не найден: $STATE_FILE"
  exit 1
fi

source "$STATE_FILE"
echo -e "${GREEN}[INFO]${NC} Используется state файл: $STATE_FILE"

echo -e "${RED}========================================${NC}"
echo -e "${RED} УДАЛЕНИЕ ИНФРАСТРУКТУРЫ               ${NC}"
echo -e "${RED}========================================${NC}"
echo
echo -e "${YELLOW}Будут удалены:${NC}"
echo "  - K8s node group: $NODE_GROUP_ID"
echo "  - K8s cluster:    $CLUSTER_ID"
echo "  - PostgreSQL:     $PG_CLUSTER_ID"
echo "  - Registry:       $REGISTRY_ID"
echo "  - Service accounts, сеть, подсеть"
echo
read -rp "Продолжить? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Отменено"
  exit 0
fi

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Node group
if [ -n "$NODE_GROUP_ID" ]; then
  log_info "Удаление node group..."
  yc managed-kubernetes node-group delete "$NODE_GROUP_ID" --async 2>/dev/null || log_warn "Node group не найдена"
fi

# K8s cluster
if [ -n "$CLUSTER_ID" ]; then
  log_info "Удаление K8s кластера..."
  yc managed-kubernetes cluster delete "$CLUSTER_ID" --async 2>/dev/null || log_warn "Кластер не найден"
fi

# PostgreSQL
if [ -n "$PG_CLUSTER_ID" ]; then
  log_info "Удаление PostgreSQL кластера..."
  yc managed-postgresql cluster delete "$PG_CLUSTER_ID" --async 2>/dev/null || log_warn "PG кластер не найден"
fi

# Registry
if [ -n "$REGISTRY_ID" ]; then
  log_info "Удаление Container Registry..."
  yc container registry delete "$REGISTRY_ID" 2>/dev/null || log_warn "Registry не найден"
fi

# Service accounts
for SA_ID in "$S3_SA" "$K8S_NODE_SA" "$K8S_CLUSTER_SA"; do
  if [ -n "$SA_ID" ]; then
    log_info "Удаление SA $SA_ID..."
    yc iam service-account delete "$SA_ID" 2>/dev/null || log_warn "SA не найден: $SA_ID"
  fi
done

# Подсеть и сеть (ждём удаления зависимых ресурсов)
log_info "Ожидание удаления зависимых ресурсов (30с)..."
sleep 30

if [ -n "$SUBNET_ID" ]; then
  log_info "Удаление подсети..."
  yc vpc subnet delete "$SUBNET_ID" 2>/dev/null || log_warn "Подсеть не найдена или ещё используется"
fi

if [ -n "$NETWORK_ID" ]; then
  log_info "Удаление сети..."
  yc vpc network delete "$NETWORK_ID" 2>/dev/null || log_warn "Сеть не найдена или ещё используется"
fi

log_info "Удаление завершено. Некоторые ресурсы удаляются асинхронно."
echo "Проверить статус: yc managed-kubernetes cluster list"
