#!/bin/bash

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Параметры по умолчанию
NAMESPACE="${NAMESPACE:-arch}"
RELEASE_NAME="${RELEASE_NAME:-warchi}"

# Функции
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка подключения к кластеру
log_info "Проверка подключения к Kubernetes кластеру..."
if ! kubectl cluster-info >/dev/null 2>&1; then
    log_error "Не удалось подключиться к Kubernetes кластеру"
    exit 1
fi

# Удаление только фронтового Helm release
if helm list -n "$NAMESPACE" | grep -q "$RELEASE_NAME"; then
    log_info "Удаление Helm release фронтенда '$RELEASE_NAME' из namespace '$NAMESPACE'..."
    helm uninstall "$RELEASE_NAME" -n "$NAMESPACE"
    log_info "Helm release фронтенда удалён"
else
    log_warn "Helm release '$RELEASE_NAME' в namespace '$NAMESPACE' не найден"
fi

log_info "Удаление фронтенда завершено"


