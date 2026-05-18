#!/bin/bash
set -e

# Подключение kubectl к Yandex Cloud Managed Kubernetes
# Использование: ./setup-kubectl.sh [cluster_id]

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NAMESPACE="${NAMESPACE:-arch}"
PROFILE_NAME=""

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--profile)
      if [ -z "${2:-}" ]; then
        echo -e "${RED}[ERROR]${NC} Для --profile требуется имя профиля"
        echo "Использование: $0 [--profile <name>] [cluster_id]"
        exit 1
      fi
      PROFILE_NAME="$2"
      shift 2
      ;;
    -h|--help)
      echo "Использование: $0 [--profile <name>] [cluster_id]"
      exit 0
      ;;
    *)
      if [ -z "${CLUSTER_ID_ARG:-}" ]; then
        CLUSTER_ID_ARG="$1"
        shift
      else
        echo -e "${RED}[ERROR]${NC} Неожиданный аргумент: $1"
        echo "Использование: $0 [--profile <name>] [cluster_id]"
        exit 1
      fi
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

if [ -n "$PROFILE_NAME" ] && [ -z "${ENV_FILE:-}" ]; then
  ENV_FILE="$SCRIPT_DIR/../env.${PROFILE_NAME}.local"
fi
if [ -n "${ENV_FILE:-}" ] && [ -f "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

if [ -f "$STATE_FILE" ]; then
  # shellcheck source=/dev/null
  source "$STATE_FILE"
fi

CLUSTER_ID="${CLUSTER_ID_ARG:-$CLUSTER_ID}"

if [ -z "$CLUSTER_ID" ]; then
  echo -e "${RED}[ERROR]${NC} CLUSTER_ID не задан"
  echo "Использование: $0 [--profile <name>] [cluster_id]"
  exit 1
fi

echo -e "${GREEN}[INFO]${NC} Используется state файл: $STATE_FILE"
if [ -n "${ENV_FILE:-}" ]; then
  echo -e "${GREEN}[INFO]${NC} Используется env файл: $ENV_FILE"
fi

echo -e "${GREEN}[INFO]${NC} Получение credentials для кластера $CLUSTER_ID..."
yc managed-kubernetes cluster get-credentials "$CLUSTER_ID" --external --force

echo -e "${GREEN}[INFO]${NC} Создание namespace $NAMESPACE..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

echo -e "${GREEN}[INFO]${NC} Проверка подключения..."
kubectl get nodes

echo -e "${GREEN}[INFO]${NC} kubectl настроен. Контекст:"
kubectl config current-context
