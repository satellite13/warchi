#!/bin/bash
set -e

# Установка cert-manager и применение ClusterIssuer.
# Использование: ./setup-cert-manager.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/.."
ISSUER_FILE="$INFRA_DIR/k8s/cluster-issuer.yaml"

if ! command -v helm >/dev/null 2>&1; then
  echo -e "${RED}[ERROR]${NC} helm не найден"
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo -e "${RED}[ERROR]${NC} kubectl не найден"
  exit 1
fi

if [ ! -f "$ISSUER_FILE" ]; then
  echo -e "${RED}[ERROR]${NC} Файл issuer не найден: $ISSUER_FILE"
  exit 1
fi

echo -e "${GREEN}[INFO]${NC} Установка/обновление cert-manager..."
helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
helm repo update >/dev/null

kubectl create namespace cert-manager --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --set crds.enabled=true

echo -e "${GREEN}[INFO]${NC} Ожидание готовности cert-manager..."
kubectl rollout status deployment/cert-manager -n cert-manager --timeout=300s
kubectl rollout status deployment/cert-manager-webhook -n cert-manager --timeout=300s
kubectl rollout status deployment/cert-manager-cainjector -n cert-manager --timeout=300s

echo -e "${GREEN}[INFO]${NC} Применение ClusterIssuer..."
kubectl apply -f "$ISSUER_FILE"

if kubectl get clusterissuer letsencrypt-prod >/dev/null 2>&1; then
  echo -e "${GREEN}[INFO]${NC} ClusterIssuer letsencrypt-prod создан/обновлён"
else
  echo -e "${YELLOW}[WARN]${NC} ClusterIssuer letsencrypt-prod пока не найден"
fi

echo -e "${GREEN}[INFO]${NC} cert-manager готов"
