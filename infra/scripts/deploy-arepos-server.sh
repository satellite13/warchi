#!/bin/bash
set -e

# Сборка, push и деплой arepos-server в Yandex Cloud K8s
# Использование: ./deploy-arepos-server.sh [version]

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

# Путь к проекту arepos-server (рядом с warchi)
AREPOS_DIR="${AREPOS_DIR:-$PROJECT_ROOT/../arepos-server}"
NAMESPACE="${NAMESPACE:-arch}"
VERSION="${1:-}"

if [ -z "$REGISTRY_ID" ]; then
  echo -e "${RED}[ERROR]${NC} REGISTRY_ID не задан. Сначала выполните create-infra.sh"
  exit 1
fi

IMAGE_REPO="cr.yandex/${REGISTRY_ID}/arepos-server"

# Сборка
echo -e "${GREEN}[INFO]${NC} Сборка arepos-server..."
cd "$AREPOS_DIR"

if [ -z "$VERSION" ]; then
  VERSION=$(./gradlew properties -q | grep "^version:" | awk '{print $2}')
  if [ -z "$VERSION" ]; then
    echo -e "${RED}[ERROR]${NC} Не удалось определить версию. Передайте аргументом: $0 <version>"
    exit 1
  fi
fi

echo -e "${GREEN}[INFO]${NC} Версия: $VERSION"

echo -e "${GREEN}[INFO]${NC} Сборка JAR..."
./gradlew bootJar

JAR_FILE=$(find build/libs -name "*.jar" ! -name "*-plain.jar" | head -1)
if [ -z "$JAR_FILE" ]; then
  echo -e "${RED}[ERROR]${NC} JAR не найден в build/libs/"
  exit 1
fi

REMOTE_IMAGE="${IMAGE_REPO}:${VERSION}"

echo -e "${GREEN}[INFO]${NC} Сборка Docker-образа для linux/amd64..."
docker buildx build \
  --platform linux/amd64 \
  --build-arg JAR_FILE="$JAR_FILE" \
  -t "$REMOTE_IMAGE" \
  -f "$SCRIPT_DIR/Dockerfile.arepos-server" \
  --load \
  .

echo -e "${GREEN}[INFO]${NC} Push: $REMOTE_IMAGE"
docker push "$REMOTE_IMAGE"

# Helm deploy
echo -e "${GREEN}[INFO]${NC} Деплой через Helm..."
cd "$PROJECT_ROOT"

VALUES_FILE="$INFRA_DIR/helm-values/arepos-server-yc.yaml"
TEMP_VALUES=$(mktemp)
sed "s/<REGISTRY_ID>/${REGISTRY_ID}/g" "$VALUES_FILE" > "$TEMP_VALUES"

helm upgrade --install arepos-server "$AREPOS_DIR/charts/arepos-server" \
  -n "$NAMESPACE" \
  -f "$TEMP_VALUES" \
  --set image.tag="$VERSION"

rm -f "$TEMP_VALUES"

echo -e "${GREEN}[INFO]${NC} arepos-server $VERSION задеплоен"
kubectl rollout status deployment/arepos-server -n "$NAMESPACE" --timeout=180s
