#!/bin/bash

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Параметры по умолчанию (можно переопределить переменными окружения)
CHART_PATH="${CHART_PATH:-charts/warchi}"
BUILD_IMAGE="${BUILD_IMAGE:-true}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-180}"
IMAGE_TAG="${IMAGE_TAG:-}"
BASE_VERSION="${BASE_VERSION:-}"

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

log_env() {
    echo -e "${CYAN}[ENV]${NC}  $1"
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
        log_error "$1 not installed"
        exit 1
    fi
}

# Определение среды и переменных
detect_environment() {
    if [ -z "$BASE_VERSION" ] && [ -f "package.json" ]; then
        BASE_VERSION=$(node -p "require('./package.json').version")
    fi

    local tag_to_check="${IMAGE_TAG:-$BASE_VERSION}"

    if echo "$tag_to_check" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
        # Clean version — prod
        ENVIRONMENT="prod"
        NAMESPACE="warchi"
        RELEASE_NAME="warchi"
        INGRESS_HOST="warchi.lmru.tech"
        VALUES_FILE="$CHART_PATH/values-prod.yaml"
    else
        # Preprod
        ENVIRONMENT="preprod"
        NAMESPACE="warchi-preprod"
        RELEASE_NAME="warchi-preprod"
        INGRESS_HOST="t-warchi.lmru.tech"
        VALUES_FILE="$CHART_PATH/values-preprod.yaml"
    fi

    SERVICE_NAME="$RELEASE_NAME"
}

# Проверка необходимых команд
log_info "Checking required commands..."
check_command kubectl
check_command helm
check_command docker
check_command curl

# Проверка подключения к кластеру
log_info "Checking Kubernetes cluster connection..."
if ! kubectl cluster-info >/dev/null 2>&1; then
    log_error "Cannot connect to Kubernetes cluster"
    exit 1
fi

# Определение переменных среды (первичное)
detect_environment

# Подтверждение kubectl context
CURRENT_CONTEXT=$(kubectl config current-context)
CLUSTER_NAME=$(kubectl config view -o jsonpath="{.contexts[?(@.name=='$CURRENT_CONTEXT')].context.cluster}")
log_warn "Current kubectl context: $CURRENT_CONTEXT (cluster: $CLUSTER_NAME)"
if [ "${SKIP_CONFIRM:-false}" != "true" ]; then
    read -p "Deploy to this cluster? (y/N) " CONFIRM
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        log_info "Deployment cancelled"
        exit 0
    fi
fi

# Build Docker image
if [ "$BUILD_IMAGE" = "true" ]; then
    log_info "Building Docker image..."
    if [ -x "./buildImage.sh" ]; then
        . ./buildImage.sh
    else
        log_error "buildImage.sh not found or not executable"
        exit 1
    fi
    log_info "Docker image built successfully"
    log_info "Built image tag: $IMAGE_TAG"
else
    log_warn "Docker image build skipped (BUILD_IMAGE=false)"
fi

# Push image to registry
if [ "$BUILD_IMAGE" = "true" ]; then
    log_info "Pushing image to registry..."
    docker push "art.lmru.tech/arch/warchi:${IMAGE_TAG}"
    log_info "Image pushed successfully"
fi

# Повторное определение среды после билда (тег может быть изменён)
detect_environment

log_env "Environment: $ENVIRONMENT"
log_env "Namespace:    $NAMESPACE"
log_env "Release:      $RELEASE_NAME"
log_env "Domain:       $INGRESS_HOST"
log_env "Image tag:    $IMAGE_TAG"

# Blue/Green deployment
log_info "Blue/Green deployment mode"

CURRENT_COLOR=$(kubectl get service "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.selector.app\.kubernetes\.io/color}' 2>/dev/null || true)
if ! is_valid_color "$CURRENT_COLOR"; then
    CURRENT_COLOR="blue"
fi
TARGET_COLOR=$(opposite_color "$CURRENT_COLOR")
log_info "Current active color: $CURRENT_COLOR, deploying to inactive: $TARGET_COLOR"

if [ -f "$VALUES_FILE" ]; then
    log_info "Using values file: $VALUES_FILE"
else
    log_warn "Values file '$VALUES_FILE' not found, using chart defaults"
fi

if [ -n "$IMAGE_TAG" ]; then
    log_info "Image tag: $IMAGE_TAG"
fi

helm upgrade --install "$RELEASE_NAME" "$CHART_PATH" -n "$NAMESPACE" \
    --set blueGreen.enabled=true \
    --set blueGreen.activeColor="$CURRENT_COLOR" \
    --set image.tag="$IMAGE_TAG" \
    --set blueGreen.image.${TARGET_COLOR}Tag="$IMAGE_TAG" \
    --set-string ingress.hosts[0].host="$INGRESS_HOST" \
    --set-string ingress.tls[0].hosts[0]="$INGRESS_HOST" \
    -f "$VALUES_FILE"

DEPLOYMENT_NAME="${SERVICE_NAME}-${TARGET_COLOR}"
log_info "Waiting for Deployment '$DEPLOYMENT_NAME' (timeout: ${WAIT_TIMEOUT}s)..."
kubectl rollout status deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE" --timeout="${WAIT_TIMEOUT}s"

if [ "${BG_SWITCH:-true}" = "true" ]; then
    log_info "Switching traffic to '$TARGET_COLOR'..."
    # Re-deploy to switch the active color
    helm upgrade --install "$RELEASE_NAME" "$CHART_PATH" -n "$NAMESPACE" \
        --set blueGreen.enabled=true \
        --set blueGreen.activeColor="$TARGET_COLOR" \
        --set blueGreen.image.${TARGET_COLOR}Tag="$IMAGE_TAG" \
        --set-string ingress.hosts[0].host="$INGRESS_HOST" \
        --set-string ingress.tls[0].hosts[0]="$INGRESS_HOST" \
        -f "$VALUES_FILE"
    log_info "Traffic switched to '$TARGET_COLOR'"
else
    log_warn "Traffic switch skipped (BG_SWITCH=false). Active remains '$CURRENT_COLOR'"
fi

# Status output
log_info "Pod status:"
kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=warchi

log_info "Frontend available at: https://$INGRESS_HOST"
echo ""
log_info "Deployment completed!"
echo "Environment:  $ENVIRONMENT"
echo "Namespace:    $NAMESPACE"
echo "Release:      $RELEASE_NAME"
echo "Domain:       $INGRESS_HOST"
