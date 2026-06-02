#!/bin/bash
#
# deploy.sh — развёртывание фронтенда wArchi в Kubernetes через Helm.
# Проверяет kubectl/helm/docker, опционально собирает образ, устанавливает
# или обновляет Helm-релиз; поддерживает обычный и blue/green режим.
#
# Использование:
#   ./scripts/deploy.sh
#   BUILD_IMAGE=false ./scripts/deploy.sh
#   BLUE_GREEN=true BG_SWITCH=true IMAGE_TAG=0.0.22 ./scripts/deploy.sh
#   SKIP_CONFIRM=true NAMESPACE=arch ./scripts/deploy.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Параметры по умолчанию (можно переопределить переменными окружения)
NAMESPACE="${NAMESPACE:-arch}"
RELEASE_NAME="${RELEASE_NAME:-warchi}"
CHART_PATH="${CHART_PATH:-charts/warchi}"
VALUES_FILE="${VALUES_FILE:-$CHART_PATH/values.yaml}"
BUILD_IMAGE="${BUILD_IMAGE:-true}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-180}"
INGRESS_HOST="${INGRESS_HOST:-warchi.local}"
BLUE_GREEN="${BLUE_GREEN:-false}"
BG_SWITCH="${BG_SWITCH:-true}"
IMAGE_TAG="${IMAGE_TAG:-}"
SERVICE_NAME="${SERVICE_NAME:-$RELEASE_NAME}"

# Функции логирования
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

is_valid_color() {
    [ "$1" = "blue" ] || [ "$1" = "green" ]
}

opposite_color() {
    if [ "$1" = "blue" ]; then
        echo "green"
    else
        echo "blue"
    fi
}

check_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        log_error "$1 не установлен"
        exit 1
    fi
}

# Проверка необходимых команд
log_info "Проверка необходимых команд..."
check_command kubectl
check_command helm
check_command docker
check_command curl

# Проверка подключения к кластеру
log_info "Проверка подключения к Kubernetes кластеру..."
if ! kubectl cluster-info >/dev/null 2>&1; then
    log_error "Не удалось подключиться к Kubernetes кластеру"
    exit 1
fi

# Подтверждение kubectl context
CURRENT_CONTEXT=$(kubectl config current-context)
CLUSTER_NAME=$(kubectl config view -o jsonpath="{.contexts[?(@.name=='$CURRENT_CONTEXT')].context.cluster}")
log_warn "Текущий kubectl context: $CURRENT_CONTEXT (кластер: $CLUSTER_NAME)"
if [ "${SKIP_CONFIRM:-false}" != "true" ]; then
    read -p "Деплоить в этот кластер? (y/N) " CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        log_info "Деплой отменён"
        exit 0
    fi
fi

# Проверка/создание namespace
log_info "Проверка namespace '$NAMESPACE'..."
if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
    log_info "Создание namespace '$NAMESPACE'..."
    kubectl create namespace "$NAMESPACE"
fi

# Сборка Docker-образа фронтенда
if [ "$BUILD_IMAGE" = "true" ]; then
    log_info "Сборка Docker-образа фронтенда..."
    if [ -x "$SCRIPT_DIR/buildImage.sh" ]; then
        "$SCRIPT_DIR/buildImage.sh"
    else
        log_error "Скрипт buildImage.sh не найден или не является исполняемым"
        exit 1
    fi
    log_info "Docker-образ успешно собран"
    # Подставить тег только что собранного образа, чтобы Helm использовал его
    if [ -z "$IMAGE_TAG" ] && [ -f "package.json" ]; then
        IMAGE_TAG=$(node -p "require('./package.json').version")
        log_info "Используется тег только что собранного образа: $IMAGE_TAG"
    fi
else
    log_warn "Сборка Docker-образа пропущена (BUILD_IMAGE=false)"
fi

if [ "$BLUE_GREEN" = "true" ]; then
    log_info "Blue/Green режим включён"

    CURRENT_COLOR=$(kubectl get service "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.selector.app\.kubernetes\.io/color}' 2>/dev/null || true)
    if ! is_valid_color "$CURRENT_COLOR"; then
        CURRENT_COLOR="blue"
    fi
    TARGET_COLOR=$(opposite_color "$CURRENT_COLOR")
    log_info "Текущий активный цвет: $CURRENT_COLOR, деплой в неактивный: $TARGET_COLOR"

    HELM_CMD="helm upgrade --install $RELEASE_NAME $CHART_PATH -n $NAMESPACE --set blueGreen.enabled=true --set blueGreen.activeColor=$CURRENT_COLOR"
    if [ -f "$VALUES_FILE" ]; then
        HELM_CMD="$HELM_CMD -f $VALUES_FILE"
        log_info "Использование файла значений: $VALUES_FILE"
    else
        log_warn "Файл значений '$VALUES_FILE' не найден, используются значения по умолчанию чарта"
    fi
    if [ -n "$IMAGE_TAG" ]; then
        HELM_CMD="$HELM_CMD --set image.tag=$IMAGE_TAG --set blueGreen.image.${TARGET_COLOR}Tag=$IMAGE_TAG"
        log_info "Для $TARGET_COLOR выбран тег образа: $IMAGE_TAG"
    fi

    eval "$HELM_CMD"

    DEPLOYMENT_NAME="${SERVICE_NAME}-${TARGET_COLOR}"
    log_info "Ожидание готовности Deployment '$DEPLOYMENT_NAME' (таймаут: ${WAIT_TIMEOUT}с)..."
    kubectl rollout status deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE" --timeout="${WAIT_TIMEOUT}s"

    if [ "$BG_SWITCH" = "true" ]; then
        log_info "Переключение трафика на цвет '$TARGET_COLOR'..."
        HELM_SWITCH_CMD="helm upgrade --install $RELEASE_NAME $CHART_PATH -n $NAMESPACE --reuse-values --set blueGreen.enabled=true --set blueGreen.activeColor=$TARGET_COLOR"
        eval "$HELM_SWITCH_CMD"
        log_info "Трафик переключен на '$TARGET_COLOR'"
    else
        log_warn "Переключение трафика пропущено (BG_SWITCH=false). Активным остаётся '$CURRENT_COLOR'"
    fi
else
    # Legacy single deployment mode (пересоздание релиза)
    if helm list -n "$NAMESPACE" | grep -q "$RELEASE_NAME"; then
        log_warn "Найден существующий релиз '$RELEASE_NAME'. Удаление..."
        helm uninstall "$RELEASE_NAME" -n "$NAMESPACE" || true
        sleep 5
    fi

    log_info "Развертывание фронтенда через Helm..."
    HELM_CMD="helm upgrade --install $RELEASE_NAME $CHART_PATH -n $NAMESPACE"

    if [ -f "$VALUES_FILE" ]; then
        HELM_CMD="$HELM_CMD -f $VALUES_FILE"
        log_info "Использование файла значений: $VALUES_FILE"
    else
        log_warn "Файл значений '$VALUES_FILE' не найден, используются значения по умолчанию чарта"
    fi

    if [ -n "$IMAGE_TAG" ]; then
        HELM_CMD="$HELM_CMD --set image.tag=$IMAGE_TAG"
        log_info "Тег образа: $IMAGE_TAG"
    fi

    eval "$HELM_CMD"

    log_info "Ожидание запуска подов..."
    sleep 10

    # Ожидание готовности подов
    log_info "Ожидание готовности фронтенда (таймаут: ${WAIT_TIMEOUT}с)..."
    TIMEOUT=$WAIT_TIMEOUT
    ELAPSED=0
    INTERVAL=5
    READY="false"

    while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
        READY=$(kubectl get pods -n "$NAMESPACE" \
            -l app.kubernetes.io/name=warchi \
            -o jsonpath='{.items[0].status.containerStatuses[0].ready}' 2>/dev/null || echo "false")

        if [ "$READY" = "true" ]; then
            log_info "Фронтенд готов!"
            break
        fi

        ELAPSED=$((ELAPSED + INTERVAL))
        REMAINING=$((TIMEOUT - ELAPSED))
        if [ "$REMAINING" -gt 0 ]; then
            echo -n "."
            sleep "$INTERVAL"
        fi
    done

    echo ""

    if [ "$READY" != "true" ]; then
        log_error "Таймаут ожидания готовности фронтенда"
        log_info "Текущий статус подов:"
        kubectl get pods -n "$NAMESPACE"
        exit 1
    fi
fi

# Вывод статуса
log_info "Статус подов фронтенда:"
kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=warchi

# Пробуем проверить доступность через сервис/ingress (если настроен)
SERVICE_URL="http://warchi.$NAMESPACE.svc.cluster.local"
INGRESS_URL="http://$INGRESS_HOST"

log_info "Проверка доступности по ClusterIP сервису: $SERVICE_URL"
if curl -sSf "$SERVICE_URL" >/dev/null 2>&1; then
    log_info "Фронтенд доступен по ClusterIP сервису"
else
    log_warn "Не удалось обратиться к ClusterIP сервису (возможно, нужен порт-форвардинг или ingress)"
fi

log_info "Если включен Ingress и DNS настроен, фронтенд должен быть доступен по адресу: $INGRESS_URL"

echo ""
log_info "Деплой фронтенда завершён!"
echo "Namespace:  $NAMESPACE"
echo "Release:    $RELEASE_NAME"
echo "Helm chart: $CHART_PATH"
