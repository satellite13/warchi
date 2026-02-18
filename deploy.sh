#!/bin/bash

set -e

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

# Проверка/создание namespace
log_info "Проверка namespace '$NAMESPACE'..."
if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
    log_info "Создание namespace '$NAMESPACE'..."
    kubectl create namespace "$NAMESPACE"
fi

# Сборка Docker-образа фронтенда
if [ "$BUILD_IMAGE" = "true" ]; then
    log_info "Сборка Docker-образа фронтенда..."
    if [ -x "./buildImage.sh" ]; then
        ./buildImage.sh
    else
        log_error "Скрипт buildImage.sh не найден или не является исполняемым"
        exit 1
    fi
    log_info "Docker-образ успешно собран"
else
    log_warn "Сборка Docker-образа пропущена (BUILD_IMAGE=false)"
fi

# Удаление предыдущего релиза (если существует)
if helm list -n "$NAMESPACE" | grep -q "$RELEASE_NAME"; then
    log_warn "Найден существующий релиз '$RELEASE_NAME'. Удаление..."
    helm uninstall "$RELEASE_NAME" -n "$NAMESPACE" || true
    sleep 5
fi

# Развертывание Helm-чарта
log_info "Развертывание фронтенда через Helm..."
HELM_CMD="helm upgrade --install $RELEASE_NAME $CHART_PATH -n $NAMESPACE"

if [ -f "$VALUES_FILE" ]; then
    HELM_CMD="$HELM_CMD -f $VALUES_FILE"
    log_info "Использование файла значений: $VALUES_FILE"
else
    log_warn "Файл значений '$VALUES_FILE' не найден, используются значения по умолчанию чарта"
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


