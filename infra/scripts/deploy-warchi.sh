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

if [ -z "$VERSION" ]; then
  VERSION=$(node -p "require('./package.json').version")
fi

echo -e "${GREEN}[INFO]${NC} Версия: $VERSION"

# Сборка
REMOTE_IMAGE="${IMAGE_REPO}:${VERSION}"

echo -e "${GREEN}[INFO]${NC} Сборка Docker-образа warchi для linux/amd64..."
docker buildx build \
  --platform linux/amd64 \
  --build-arg APP_VERSION="${VERSION}" \
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
  --set image.tag="$VERSION"

rm -f "$TEMP_VALUES"

echo -e "${GREEN}[INFO]${NC} warchi $VERSION задеплоен"
kubectl rollout status deployment/warchi -n "$NAMESPACE" --timeout=180s
