#!/bin/bash
set -e

# Сборка, push и деплой warchi (фронтенд) в Yandex Cloud K8s
# Использование: ./deploy-warchi.sh [version]

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

NAMESPACE="${NAMESPACE:-arch}"
confirm_kubectl_deploy_target

if [ -z "$REGISTRY_ID" ]; then
  echo -e "${RED}[ERROR]${NC} REGISTRY_ID не задан. Сначала выполните create-infra.sh"
  exit 1
fi

IMAGE_REPO="cr.yandex/${REGISTRY_ID}/warchi"
# Публичный host из браузера (должен совпадать с DNS A/AAAA на Ingress). Иначе правьте state.env или экспорт перед деплоем.
WARCHI_INGRESS_HOST="${WARCHI_INGRESS_HOST:-warchi.ru}"

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
if [ "${SKIP_DOCKER_PUSH:-false}" = "true" ]; then
  echo -e "${YELLOW}[WARN]${NC} SKIP_DOCKER_PUSH=true, пропускаем docker push"
else
  docker push "$REMOTE_IMAGE"
fi

# Helm deploy
echo -e "${GREEN}[INFO]${NC} Деплой через Helm..."
VALUES_FILE="$INFRA_DIR/helm-values/warchi-yc.yaml"
TEMP_VALUES=$(mktemp)
sed -e "s/<REGISTRY_ID>/${REGISTRY_ID}/g" -e "s/<WARCHI_INGRESS_HOST>/${WARCHI_INGRESS_HOST}/g" "$VALUES_FILE" > "$TEMP_VALUES"
echo -e "${GREEN}[INFO]${NC} Ingress host: ${WARCHI_INGRESS_HOST}"

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
