#!/bin/bash
set -e

# Создание K8s secrets для managed-сервисов Yandex Cloud
# Значения берутся из state.env (создаётся скриптом create-infra.sh)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/../state.env"
ENV_FILE="$SCRIPT_DIR/../env.local"
NAMESPACE="${NAMESPACE:-arch}"

if [ -f "$STATE_FILE" ]; then
  source "$STATE_FILE"
fi
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

if [ -z "$PG_HOST" ] || [ -z "$S3_ACCESS_KEY" ]; then
  echo -e "${RED}[ERROR]${NC} Не найдены данные инфраструктуры"
  echo "Сначала выполните: ./create-infra.sh"
  exit 1
fi

# Запрашиваем пароль БД, если не задан
if [ -z "$DB_PASSWORD" ]; then
  echo -n "Введите пароль PostgreSQL: "
  read -rs DB_PASSWORD
  echo
fi

DB_NAME="${DB_NAME:-arepos}"
DB_USER="${DB_USER:-arepos}"
DB_URL="jdbc:postgresql://${PG_HOST}:6432/${DB_NAME}?sslmode=verify-full"

echo -e "${GREEN}[INFO]${NC} Создание secrets в namespace '$NAMESPACE'..."

# 0. Secret для pull из Yandex Container Registry (если доступен yc CLI)
if command -v yc >/dev/null 2>&1; then
  echo -e "${GREEN}[INFO]${NC} Создание secret yc-cr-pull-secret..."
  YC_IAM_TOKEN=$(yc iam create-token)
  if [ -n "$YC_IAM_TOKEN" ]; then
    kubectl create secret docker-registry yc-cr-pull-secret \
      --namespace "$NAMESPACE" \
      --docker-server=cr.yandex \
      --docker-username=oauth \
      --docker-password="$YC_IAM_TOKEN" \
      --dry-run=client -o yaml | kubectl apply -f -
  else
    echo -e "${YELLOW}[WARN]${NC} Не удалось получить IAM token через yc, пропускаем yc-cr-pull-secret"
  fi
else
  echo -e "${YELLOW}[WARN]${NC} yc CLI не найден, пропускаем yc-cr-pull-secret"
fi

# 1. Secret для PostgreSQL
echo -e "${GREEN}[INFO]${NC} Создание secret arepos-db-secret..."
kubectl create secret generic arepos-db-secret \
  --namespace "$NAMESPACE" \
  --from-literal=DB_URL="$DB_URL" \
  --from-literal=DB_USERNAME="$DB_USER" \
  --from-literal=DB_PASSWORD="$DB_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# 2. Secret для S3
echo -e "${GREEN}[INFO]${NC} Создание secret arepos-s3-secret..."
kubectl create secret generic arepos-s3-secret \
  --namespace "$NAMESPACE" \
  --from-literal=access-key="$S3_ACCESS_KEY" \
  --from-literal=secret-key="$S3_SECRET_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Secret для аутентификации (генерируется один раз)
if kubectl get secret arepos-server-auth-secret -n "$NAMESPACE" >/dev/null 2>&1; then
  echo -e "${YELLOW}[WARN]${NC} Secret arepos-server-auth-secret уже существует, пропускаем"
else
  echo -e "${GREEN}[INFO]${NC} Создание secret arepos-server-auth-secret..."
  JWT_SECRET=$(openssl rand -base64 48)
  ADMIN_SECRET=$(openssl rand -base64 32)
  kubectl create secret generic arepos-server-auth-secret \
    --namespace "$NAMESPACE" \
    --from-literal=jwt-secret="$JWT_SECRET" \
    --from-literal=admin-secret="$ADMIN_SECRET"
fi

echo -e "${GREEN}[INFO]${NC} Все secrets созданы:"
kubectl get secrets -n "$NAMESPACE"
