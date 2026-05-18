#!/bin/bash
set -e

# Сборка, push и деплой arepos-server в Yandex Cloud K8s
# Использование: ./deploy-arepos-server.sh [version]

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=guard-no-orbstack.sh
source "$SCRIPT_DIR/guard-no-orbstack.sh"
assert_not_orbstack

INFRA_DIR="$SCRIPT_DIR/.."
PROJECT_ROOT="$INFRA_DIR/.."
PROFILE_NAME=""
VERSION=""

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--profile)
      if [ -z "${2:-}" ]; then
        echo -e "${RED}[ERROR]${NC} Для --profile требуется имя профиля"
        echo "Использование: $0 [--profile <name>] [version]"
        exit 1
      fi
      PROFILE_NAME="$2"
      shift 2
      ;;
    -h|--help)
      echo "Использование: $0 [--profile <name>] [version]"
      exit 0
      ;;
    *)
      if [ -z "$VERSION" ]; then
        VERSION="$1"
        shift
      else
        echo -e "${RED}[ERROR]${NC} Неожиданный аргумент: $1"
        echo "Использование: $0 [--profile <name>] [version]"
        exit 1
      fi
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
  source "$STATE_FILE"
fi

if [ -n "$PROFILE_NAME" ] && [ -z "${ENV_FILE:-}" ]; then
  ENV_FILE="$INFRA_DIR/env.${PROFILE_NAME}.local"
fi
if [ -n "${ENV_FILE:-}" ] && [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

echo -e "${GREEN}[INFO]${NC} Используется state файл: $STATE_FILE"
if [ -n "${ENV_FILE:-}" ]; then
  echo -e "${GREEN}[INFO]${NC} Используется env файл: $ENV_FILE"
fi

# Путь к проекту arepos-server (рядом с warchi)
AREPOS_DIR="${AREPOS_DIR:-$PROJECT_ROOT/../arepos-server}"
NAMESPACE="${NAMESPACE:-arch}"
confirm_kubectl_deploy_target

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

APP_VERSION=$(./gradlew properties -q | grep "^version:" | awk '{print $2}')
if [ -z "$APP_VERSION" ]; then
  echo -e "${RED}[ERROR]${NC} Не удалось определить app version из Gradle"
  exit 1
fi

echo -e "${GREEN}[INFO]${NC} Версия: $VERSION"

echo -e "${GREEN}[INFO]${NC} Сборка JAR..."
./gradlew bootJar

JAR_FILE="build/libs/arepos-server-${APP_VERSION}.jar"
if [ -z "$JAR_FILE" ]; then
  echo -e "${RED}[ERROR]${NC} JAR не найден в build/libs/"
  exit 1
fi
if [ ! -f "$JAR_FILE" ]; then
  echo -e "${RED}[ERROR]${NC} Ожидаемый JAR не найден: $JAR_FILE"
  echo -e "${RED}[ERROR]${NC} Проверьте версию и содержимое build/libs/"
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
if [ "${SKIP_DOCKER_PUSH:-false}" = "true" ]; then
  echo -e "${YELLOW}[WARN]${NC} SKIP_DOCKER_PUSH=true, пропускаем docker push"
else
  docker push "$REMOTE_IMAGE"
fi

# Helm deploy
echo -e "${GREEN}[INFO]${NC} Деплой через Helm..."
cd "$PROJECT_ROOT"

VALUES_FILE="$INFRA_DIR/helm-values/arepos-server-yc.yaml"
TEMP_VALUES=$(mktemp)
S3_BUCKET_NAME="${S3_BUCKET_NAME:-arepos-files}"
sed \
  -e "s/<REGISTRY_ID>/${REGISTRY_ID}/g" \
  -e "s/<S3_BUCKET_NAME>/${S3_BUCKET_NAME}/g" \
  "$VALUES_FILE" > "$TEMP_VALUES"
echo -e "${GREEN}[INFO]${NC} S3 bucket: ${S3_BUCKET_NAME}"

helm upgrade --install arepos-server "$AREPOS_DIR/charts/arepos-server" \
  -n "$NAMESPACE" \
  -f "$TEMP_VALUES" \
  --set image.tag="$VERSION" \
  --set-string podAnnotations.deployedAt="$(date +%s)"

rm -f "$TEMP_VALUES"

echo -e "${GREEN}[INFO]${NC} arepos-server $VERSION задеплоен"
kubectl rollout status deployment/arepos-server -n "$NAMESPACE" --timeout=600s
