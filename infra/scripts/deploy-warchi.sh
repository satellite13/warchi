#!/bin/bash
set -e

# Сборка, push и деплой warchi (фронтенд) в Yandex Cloud K8s
# Использование: ./deploy-warchi.sh [version]

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/.."
PROJECT_ROOT="$INFRA_DIR/.."
STATE_FILE="$INFRA_DIR/state.env"

if [ -f "$STATE_FILE" ]; then
  source "$STATE_FILE"
fi

NAMESPACE="${NAMESPACE:-arch}"
VERSION="${1:-}"

if [ -z "$REGISTRY_ID" ]; then
  echo -e "${RED}[ERROR]${NC} REGISTRY_ID не задан. Сначала выполните create-infra.sh"
  exit 1
fi

IMAGE_REPO="cr.yandex/${REGISTRY_ID}/warchi"

cd "$PROJECT_ROOT"

APP_VERSION=$(node -p "require('./package.json').version")
if [ -z "$APP_VERSION" ]; then
  echo -e "${RED}[ERROR]${NC} Не удалось определить версию из package.json"
  exit 1
fi

if [ -z "$VERSION" ]; then
  GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
  VERSION="${APP_VERSION}-${GIT_HASH}"
fi

echo -e "${GREEN}[INFO]${NC} Версия: $VERSION"
echo -e "${GREEN}[INFO]${NC} APP_VERSION: $APP_VERSION"

# Сборка
REMOTE_IMAGE="${IMAGE_REPO}:${VERSION}"

echo -e "${GREEN}[INFO]${NC} Сборка Docker-образа warchi для linux/amd64..."
docker buildx build \
  --platform linux/amd64 \
  --build-arg APP_VERSION="${APP_VERSION}" \
  --build-arg VITE_API_BASE_URL="" \
  --build-arg VITE_NOTATION_URL="/api/v1/notation" \
  -t "$REMOTE_IMAGE" \
  --load \
  .

echo -e "${GREEN}[INFO]${NC} Push: $REMOTE_IMAGE"
docker push "$REMOTE_IMAGE"

# Helm deploy
echo -e "${GREEN}[INFO]${NC} Деплой через Helm..."
VALUES_FILE="$INFRA_DIR/helm-values/warchi-yc.yaml"
TEMP_VALUES=$(mktemp)
sed "s/<REGISTRY_ID>/${REGISTRY_ID}/g" "$VALUES_FILE" > "$TEMP_VALUES"

helm upgrade --install warchi charts/warchi \
  -n "$NAMESPACE" \
  -f "$TEMP_VALUES" \
  --set image.tag="$VERSION" \
  --set-string podAnnotations.deployedAt="$(date +%s)"

rm -f "$TEMP_VALUES"

echo -e "${GREEN}[INFO]${NC} warchi $VERSION задеплоен"
kubectl rollout status deployment/warchi -n "$NAMESPACE" --timeout=180s

DEPLOY_IMAGE=$(kubectl get deployment warchi -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].image}')
echo -e "${GREEN}[INFO]${NC} Deployment image: ${DEPLOY_IMAGE}"

POD_IMAGE=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=warchi -o jsonpath='{.items[0].spec.containers[0].image}')
POD_IMAGE_ID=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=warchi -o jsonpath='{.items[0].status.containerStatuses[0].imageID}')
echo -e "${GREEN}[INFO]${NC} Pod image: ${POD_IMAGE}"
echo -e "${GREEN}[INFO]${NC} Pod imageID: ${POD_IMAGE_ID}"
