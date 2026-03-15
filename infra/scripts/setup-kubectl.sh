#!/bin/bash
set -e

# Подключение kubectl к Yandex Cloud Managed Kubernetes
# Использование: ./setup-kubectl.sh [cluster_id]

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/../state.env"
NAMESPACE="${NAMESPACE:-arch}"

CLUSTER_ID="${1:-$CLUSTER_ID}"

if [ -z "$CLUSTER_ID" ] && [ -f "$STATE_FILE" ]; then
  source "$STATE_FILE"
fi

if [ -z "$CLUSTER_ID" ]; then
  echo -e "${RED}[ERROR]${NC} CLUSTER_ID не задан"
  echo "Использование: $0 <cluster_id>"
  exit 1
fi

echo -e "${GREEN}[INFO]${NC} Получение credentials для кластера $CLUSTER_ID..."
yc managed-kubernetes cluster get-credentials "$CLUSTER_ID" --external --force

echo -e "${GREEN}[INFO]${NC} Создание namespace $NAMESPACE..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

echo -e "${GREEN}[INFO]${NC} Проверка подключения..."
kubectl get nodes

echo -e "${GREEN}[INFO]${NC} kubectl настроен. Контекст:"
kubectl config current-context
