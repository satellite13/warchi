#!/bin/bash
set -e

# Создание всей инфраструктуры в Yandex Cloud через yc CLI
# Использование: cp ../env.example ../env.local && vim ../env.local && ./create-infra.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}[ERROR]${NC} Файл $ENV_FILE не найден"
  echo "Скопируйте env.example в env.local и заполните значения:"
  echo "  cp infra/env.example infra/env.local"
  exit 1
fi

source "$ENV_FILE"

# Файл для сохранения ID созданных ресурсов
STATE_FILE="$SCRIPT_DIR/../state.env"
touch "$STATE_FILE"

log_info()  { echo -e "${GREEN}[INFO]${NC} $1" >&2; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

save_state() {
  local key="$1" value="$2"
  # Обновляем или добавляем запись
  if grep -q "^${key}=" "$STATE_FILE" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$STATE_FILE" && rm -f "${STATE_FILE}.bak"
  else
    echo "${key}=${value}" >> "$STATE_FILE"
  fi
}

init_pg_extensions() {
  local init_user="$1"
  local init_password="$2"
  local pod_name="pg-ext-init-$(date +%s)"
  local dsn="host=${PG_HOST} port=6432 dbname=${DB_NAME} user=${init_user} sslmode=require"
  local sql_file
  local output
  local status_line

  if [ -z "$init_user" ] || [ -z "$init_password" ]; then
    log_warn "Пропускаем инициализацию расширений PostgreSQL: не заданы учетные данные"
    save_state "PG_EXTENSIONS_STATUS" "skipped-no-credentials"
    return 0
  fi

  sql_file="$(mktemp)"
  cat > "$sql_file" <<'SQL'
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping pgcrypto extension: insufficient privileges';
  END;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping pg_trgm extension: insufficient privileges';
  END;
END
$$;

\pset tuples_only on
\pset format unaligned
\pset fieldsep ','
SELECT
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'),
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'),
  (to_regproc('gen_random_uuid') IS NOT NULL);
SQL

  output="$(kubectl -n "$NAMESPACE" run "$pod_name" \
    --image=postgres:16-alpine \
    --restart=Never \
    --rm \
    -i \
    --env="PGPASSWORD=${init_password}" \
    --command -- sh -ceu "psql \"$dsn\" -v ON_ERROR_STOP=1 -f -" < "$sql_file" 2>&1)" || {
      rm -f "$sql_file"
      log_warn "Не удалось проверить/инициализировать расширения PostgreSQL автоматически"
      log_warn "Проверьте доступность БД и права пользователя '$init_user'"
      save_state "PG_EXTENSIONS_STATUS" "check-failed"
      return 0
    }

  rm -f "$sql_file"
  echo "$output"

  status_line="$(printf '%s\n' "$output" | awk -F',' '/^(t|f),(t|f),(t|f)$/ {line=$0} END {print line}')"
  case "$status_line" in
    "t,t,t")
      log_info "Расширения PostgreSQL готовы: pgcrypto=t, pg_trgm=t, gen_random_uuid=t"
      save_state "PG_EXTENSIONS_STATUS" "ready"
      ;;
    "t,f,t")
      log_warn "pg_trgm не установлен (поиск будет с fallback индексами), но gen_random_uuid доступна"
      save_state "PG_EXTENSIONS_STATUS" "partial-no-pgtrgm"
      ;;
    "f,f,t"|"f,t,t")
      log_warn "pgcrypto не установлен, но gen_random_uuid доступна (возможно через core PostgreSQL)"
      save_state "PG_EXTENSIONS_STATUS" "partial-pgcrypto-missing"
      ;;
    "t,t,f"|"t,f,f"|"f,t,f"|"f,f,f")
      log_warn "gen_random_uuid недоступна. Liquibase-миграции arepos-server могут упасть"
      log_warn "Запустите CREATE EXTENSION pgcrypto под ролью с привилегиями на БД $DB_NAME"
      save_state "PG_EXTENSIONS_STATUS" "missing-gen-random-uuid"
      ;;
    *)
      log_warn "Не удалось определить статус расширений PostgreSQL из вывода psql"
      save_state "PG_EXTENSIONS_STATUS" "unknown"
      ;;
  esac
}

# Проверка yc CLI
if ! command -v yc >/dev/null 2>&1; then
  log_error "yc CLI не установлен. Установите: https://yandex.cloud/docs/cli/quickstart"
  exit 1
fi

log_info "Установка folder: $YC_FOLDER_ID"
yc config set folder-id "$YC_FOLDER_ID"
yc config set cloud-id "$YC_CLOUD_ID"

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} 1/8  Сеть (VPC)                        ${NC}"
echo -e "${GREEN}========================================${NC}"

NETWORK_ID=$(yc vpc network list --format json | python3 -c "
import json,sys
for n in json.load(sys.stdin):
  if n['name']=='arch-network': print(n['id']); break
" 2>/dev/null || true)

if [ -z "$NETWORK_ID" ]; then
  log_info "Создание VPC arch-network..."
  _JSON=$(yc vpc network create \
    --name arch-network \
    --format json)
  NETWORK_ID=$(echo "$_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  log_info "Сеть создана: $NETWORK_ID"
else
  log_warn "Сеть arch-network уже существует: $NETWORK_ID"
fi
save_state "NETWORK_ID" "$NETWORK_ID"

SUBNET_ID=$(yc vpc subnet list --format json | python3 -c "
import json,sys
for s in json.load(sys.stdin):
  if s['name']=='arch-subnet-a': print(s['id']); break
" 2>/dev/null || true)

if [ -z "$SUBNET_ID" ]; then
  log_info "Создание подсети arch-subnet-a..."
  _JSON=$(yc vpc subnet create \
    --name arch-subnet-a \
    --zone "$YC_ZONE" \
    --network-id "$NETWORK_ID" \
    --range 10.1.0.0/16 \
    --format json)
  SUBNET_ID=$(echo "$_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  log_info "Подсеть создана: $SUBNET_ID"
else
  log_warn "Подсеть arch-subnet-a уже существует: $SUBNET_ID"
fi
save_state "SUBNET_ID" "$SUBNET_ID"

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} 2/8  Сервисные аккаунты (IAM)          ${NC}"
echo -e "${GREEN}========================================${NC}"

create_sa() {
  local name="$1" desc="$2"
  local sa_id
  sa_id=$(yc iam service-account list --format json | python3 -c "
import json,sys
for s in json.load(sys.stdin):
  if s['name']=='$name': print(s['id']); break
" 2>/dev/null || true)

  if [ -z "$sa_id" ]; then
    log_info "Создание SA $name..."
    local _json
    _json=$(yc iam service-account create \
      --name "$name" \
      --description "$desc" \
      --format json)
    sa_id=$(echo "$_json" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  else
    log_warn "SA $name уже существует: $sa_id"
  fi
  echo "$sa_id"
}

K8S_CLUSTER_SA=$(create_sa "arch-k8s-cluster-sa" "K8s cluster management")
K8S_NODE_SA=$(create_sa "arch-k8s-node-sa" "K8s node image puller")
S3_SA=$(create_sa "arch-s3-sa" "S3 Object Storage access")

save_state "K8S_CLUSTER_SA" "$K8S_CLUSTER_SA"
save_state "K8S_NODE_SA" "$K8S_NODE_SA"
save_state "S3_SA" "$S3_SA"

log_info "Назначение ролей..."

assign_role() {
  local sa_id="$1" role="$2"
  yc resource-manager folder add-access-binding "$YC_FOLDER_ID" \
    --role "$role" \
    --subject "serviceAccount:${sa_id}" 2>/dev/null || true
}

assign_role "$K8S_CLUSTER_SA" "k8s.clusters.agent"
assign_role "$K8S_CLUSTER_SA" "vpc.publicAdmin"
assign_role "$K8S_CLUSTER_SA" "load-balancer.admin"
assign_role "$K8S_NODE_SA" "container-registry.images.puller"
assign_role "$S3_SA" "storage.editor"

log_info "Роли назначены"

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} 3/8  Container Registry                ${NC}"
echo -e "${GREEN}========================================${NC}"

REGISTRY_ID=$(yc container registry list --format json | python3 -c "
import json,sys
for r in json.load(sys.stdin):
  if r['name']=='arch-registry': print(r['id']); break
" 2>/dev/null || true)

if [ -z "$REGISTRY_ID" ]; then
  log_info "Создание Container Registry..."
  _JSON=$(yc container registry create \
    --name arch-registry \
    --format json)
  REGISTRY_ID=$(echo "$_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  log_info "Registry создан: $REGISTRY_ID"
else
  log_warn "Registry arch-registry уже существует: $REGISTRY_ID"
fi
save_state "REGISTRY_ID" "$REGISTRY_ID"

log_info "Настройка Docker auth для YCR..."
yc container registry configure-docker

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} 4/8  Managed Kubernetes                ${NC}"
echo -e "${GREEN}========================================${NC}"

CLUSTER_ID=$(yc managed-kubernetes cluster list --format json | python3 -c "
import json,sys
for c in json.load(sys.stdin):
  if c['name']=='arch-k8s': print(c['id']); break
" 2>/dev/null || true)

if [ -z "$CLUSTER_ID" ]; then
  log_info "Создание K8s кластера (это займёт несколько минут)..."
  CLUSTER_JSON=$(yc managed-kubernetes cluster create \
    --name arch-k8s \
    --network-id "$NETWORK_ID" \
    --zone "$YC_ZONE" \
    --subnet-id "$SUBNET_ID" \
    --public-ip \
    --service-account-id "$K8S_CLUSTER_SA" \
    --node-service-account-id "$K8S_NODE_SA" \
    --release-channel stable \
    --version "$K8S_VERSION" \
    --format json)
  CLUSTER_ID=$(echo "$CLUSTER_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  log_info "Кластер создан: $CLUSTER_ID"
else
  log_warn "Кластер arch-k8s уже существует: $CLUSTER_ID"
fi
save_state "CLUSTER_ID" "$CLUSTER_ID"

# Ждём пока кластер станет RUNNING
log_info "Ожидание готовности кластера..."
while true; do
  STATUS=$(yc managed-kubernetes cluster get "$CLUSTER_ID" --format json | python3 -c "import json,sys; print(json.load(sys.stdin)['status'])")
  if [ "$STATUS" = "RUNNING" ]; then
    log_info "Кластер готов"
    break
  fi
  echo -n "."
  sleep 10
done

# Node group
NODE_GROUP_ID=$(yc managed-kubernetes node-group list --format json | python3 -c "
import json,sys
for n in json.load(sys.stdin):
  if n['name']=='arch-node-group': print(n['id']); break
" 2>/dev/null || true)

if [ -z "$NODE_GROUP_ID" ]; then
  log_info "Создание node group (это займёт несколько минут)..."
  _JSON=$(yc managed-kubernetes node-group create \
    --cluster-id "$CLUSTER_ID" \
    --name arch-node-group \
    --platform-id standard-v3 \
    --cores "$NODE_CPU" \
    --memory "$NODE_MEMORY" \
    --disk-type network-ssd \
    --disk-size "$NODE_DISK_SIZE" \
    --network-interface subnets="$SUBNET_ID",ipv4-address=nat \
    --fixed-size "$NODE_COUNT" \
    --version "$K8S_VERSION" \
    --format json)
  NODE_GROUP_ID=$(echo "$_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  log_info "Node group создана: $NODE_GROUP_ID"
else
  log_warn "Node group arch-node-group уже существует: $NODE_GROUP_ID"
fi
save_state "NODE_GROUP_ID" "$NODE_GROUP_ID"

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} 5/8  Managed PostgreSQL                ${NC}"
echo -e "${GREEN}========================================${NC}"

PG_CLUSTER_ID=$(yc managed-postgresql cluster list --format json | python3 -c "
import json,sys
for c in json.load(sys.stdin):
  if c['name']=='arch-pg': print(c['id']); break
" 2>/dev/null || true)

if [ -z "$PG_CLUSTER_ID" ]; then
  log_info "Создание PostgreSQL кластера (это займёт несколько минут)..."
  _JSON=$(yc managed-postgresql cluster create \
    --name arch-pg \
    --environment production \
    --network-id "$NETWORK_ID" \
    --postgresql-version "$PG_VERSION" \
    --resource-preset "$PG_RESOURCE_PRESET" \
    --disk-type network-ssd \
    --disk-size "$PG_DISK_SIZE" \
    --host zone-id="$YC_ZONE",subnet-id="$SUBNET_ID" \
    --user name="$DB_USER",password="$DB_PASSWORD" \
    --database name="$DB_NAME",owner="$DB_USER" \
    --format json)
  PG_CLUSTER_ID=$(echo "$_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
  log_info "PostgreSQL кластер создан: $PG_CLUSTER_ID"
else
  log_warn "PostgreSQL кластер arch-pg уже существует: $PG_CLUSTER_ID"
fi
save_state "PG_CLUSTER_ID" "$PG_CLUSTER_ID"

# Получаем FQDN хоста
PG_HOST=$(yc managed-postgresql host list --cluster-id "$PG_CLUSTER_ID" --format json | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['name'])")
save_state "PG_HOST" "$PG_HOST"
log_info "PostgreSQL host: $PG_HOST"

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} 6/8  Object Storage (S3)               ${NC}"
echo -e "${GREEN}========================================${NC}"

# Создаём static key для S3
log_info "Создание static access key для S3..."
S3_KEY_JSON=$(yc iam access-key create \
  --service-account-id "$S3_SA" \
  --description "S3 access key for arepos" \
  --format json)

S3_ACCESS_KEY=$(echo "$S3_KEY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['access_key']['key_id'])")
S3_SECRET_KEY=$(echo "$S3_KEY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['secret'])")

save_state "S3_ACCESS_KEY" "$S3_ACCESS_KEY"
save_state "S3_SECRET_KEY" "$S3_SECRET_KEY"

# Создаём bucket через AWS CLI (S3-совместимый API)
if command -v aws >/dev/null 2>&1; then
  log_info "Создание S3 bucket $S3_BUCKET_NAME..."
  AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
  AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  aws s3 mb "s3://$S3_BUCKET_NAME" \
    --endpoint-url https://storage.yandexcloud.net \
    --region "$YC_ZONE" 2>/dev/null || log_warn "Bucket уже существует или ошибка создания"
else
  log_warn "aws CLI не установлен. Создайте bucket вручную:"
  echo "  yc storage bucket create --name $S3_BUCKET_NAME"
fi

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} 7/8  Подключение kubectl               ${NC}"
echo -e "${GREEN}========================================${NC}"

yc managed-kubernetes cluster get-credentials "$CLUSTER_ID" --external --force
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
log_info "kubectl настроен, namespace '$NAMESPACE' создан"

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} 8/8  Проверка расширений PostgreSQL    ${NC}"
echo -e "${GREEN}========================================${NC}"

DB_INIT_USER="${DB_ADMIN_USER:-$DB_USER}"
DB_INIT_PASSWORD="${DB_ADMIN_PASSWORD:-$DB_PASSWORD}"
if [ "$DB_INIT_USER" != "$DB_USER" ]; then
  log_info "Для инициализации расширений используется админ-пользователь '$DB_INIT_USER'"
else
  log_info "Для инициализации расширений используется пользователь БД '$DB_INIT_USER'"
fi
init_pg_extensions "$DB_INIT_USER" "$DB_INIT_PASSWORD"

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Инфраструктура создана!                ${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo "Созданные ресурсы сохранены в: $STATE_FILE"
echo
echo "Следующие шаги:"
echo "  1. ./create-secrets.sh    — создать K8s secrets"
echo "  2. Установить NGINX Ingress:"
echo "     helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace"
echo "  3. ./setup-cert-manager.sh — установить cert-manager и ClusterIssuer"
echo "  4. ./check-db-extensions.sh — проверить расширения PostgreSQL"
echo "  5. ./deploy-all.sh        — задеплоить приложения"
