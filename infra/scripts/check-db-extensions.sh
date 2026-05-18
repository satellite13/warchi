#!/bin/bash
set -e

# Проверка и (по возможности) инициализация расширений PostgreSQL.
# Использование:
#   ./check-db-extensions.sh
#   ./check-db-extensions.sh --strict

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NAMESPACE="${NAMESPACE:-arch}"
STRICT_MODE=false
PROFILE_NAME=""

while [ $# -gt 0 ]; do
  case "$1" in
    --strict)
      STRICT_MODE=true
      shift
      ;;
    -p|--profile)
      if [ -z "${2:-}" ]; then
        echo -e "${RED}[ERROR]${NC} Для --profile требуется имя профиля"
        echo "Использование: $0 [--strict] [--profile <name>]"
        exit 1
      fi
      PROFILE_NAME="$2"
      shift 2
      ;;
    -h|--help)
      echo "Использование: $0 [--strict] [--profile <name>]"
      exit 0
      ;;
    *)
      echo -e "${RED}[ERROR]${NC} Неизвестный аргумент: $1"
      echo "Использование: $0 [--strict] [--profile <name>]"
      exit 1
      ;;
  esac
done

if [ -z "${ENV_FILE:-}" ]; then
  if [ -n "$PROFILE_NAME" ]; then
    ENV_FILE="$SCRIPT_DIR/../env.${PROFILE_NAME}.local"
  else
    ENV_FILE="$SCRIPT_DIR/../env.local"
  fi
fi

if [ -z "${STATE_FILE:-}" ]; then
  if [ -n "$PROFILE_NAME" ]; then
    STATE_FILE="$SCRIPT_DIR/../state.${PROFILE_NAME}.env"
  else
    STATE_FILE="$SCRIPT_DIR/../state.env"
  fi
fi

if [ -f "$STATE_FILE" ]; then
  source "$STATE_FILE"
fi
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

echo -e "${GREEN}[INFO]${NC} Используется env файл: $ENV_FILE"
echo -e "${GREEN}[INFO]${NC} Используется state файл: $STATE_FILE"

if [ -z "$PG_HOST" ]; then
  echo -e "${RED}[ERROR]${NC} PG_HOST не задан"
  echo "Сначала выполните: ./create-infra.sh"
  exit 1
fi

if [ -z "$DB_NAME" ]; then
  DB_NAME="arepos"
fi
if [ -z "$DB_USER" ]; then
  DB_USER="arepos"
fi

DB_INIT_USER="${DB_ADMIN_USER:-$DB_USER}"
DB_INIT_PASSWORD="${DB_ADMIN_PASSWORD:-$DB_PASSWORD}"

if [ -z "$DB_INIT_PASSWORD" ]; then
  echo -n "Введите пароль PostgreSQL для пользователя '$DB_INIT_USER': "
  read -rs DB_INIT_PASSWORD
  echo
fi

if [ -z "$DB_INIT_PASSWORD" ]; then
  echo -e "${RED}[ERROR]${NC} Пароль PostgreSQL не задан"
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  echo -e "${RED}[ERROR]${NC} kubectl не найден"
  exit 1
fi

save_state() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$STATE_FILE" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$STATE_FILE" && rm -f "${STATE_FILE}.bak"
  else
    echo "${key}=${value}" >> "$STATE_FILE"
  fi
}

echo -e "${GREEN}[INFO]${NC} Проверка расширений PostgreSQL..."
echo -e "${GREEN}[INFO]${NC} Хост: $PG_HOST, БД: $DB_NAME, пользователь: $DB_INIT_USER"

POD_NAME="pg-ext-check-$(date +%s)"
DSN="host=${PG_HOST} port=6432 dbname=${DB_NAME} user=${DB_INIT_USER} sslmode=require"
SQL_FILE="$(mktemp)"

cat > "$SQL_FILE" <<'SQL'
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

set +e
OUTPUT="$(kubectl -n "$NAMESPACE" run "$POD_NAME" \
  --image=postgres:16-alpine \
  --restart=Never \
  --rm \
  -i \
  --env="PGPASSWORD=${DB_INIT_PASSWORD}" \
  --command -- sh -ceu "psql \"$DSN\" -v ON_ERROR_STOP=1 -f -" < "$SQL_FILE" 2>&1)"
RC=$?
set -e
rm -f "$SQL_FILE"

if [ $RC -ne 0 ]; then
  echo -e "${YELLOW}[WARN]${NC} Автопроверка расширений не удалась"
  echo -e "${YELLOW}[WARN]${NC} $OUTPUT"
  save_state "PG_EXTENSIONS_STATUS" "check-failed"
  if [ "$STRICT_MODE" = "true" ]; then
    echo -e "${RED}[ERROR]${NC} STRICT_MODE: остановка из-за ошибки проверки расширений"
    exit 1
  fi
  exit 0
fi

echo "$OUTPUT"
STATUS_LINE="$(printf '%s\n' "$OUTPUT" | awk -F',' '/^(t|f),(t|f),(t|f)$/ {line=$0} END {print line}')"

case "$STATUS_LINE" in
  "t,t,t")
    echo -e "${GREEN}[INFO]${NC} Расширения готовы: pgcrypto=t, pg_trgm=t, gen_random_uuid=t"
    save_state "PG_EXTENSIONS_STATUS" "ready"
    ;;
  "t,f,t")
    echo -e "${YELLOW}[WARN]${NC} pg_trgm не установлен, но gen_random_uuid доступна"
    save_state "PG_EXTENSIONS_STATUS" "partial-no-pgtrgm"
    ;;
  "f,f,t"|"f,t,t")
    echo -e "${YELLOW}[WARN]${NC} pgcrypto не установлен, но gen_random_uuid доступна"
    save_state "PG_EXTENSIONS_STATUS" "partial-pgcrypto-missing"
    ;;
  "t,t,f"|"t,f,f"|"f,t,f"|"f,f,f")
    echo -e "${YELLOW}[WARN]${NC} gen_random_uuid недоступна: миграции arepos-server могут упасть"
    echo -e "${YELLOW}[WARN]${NC} Нужен CREATE EXTENSION pgcrypto под ролью с нужными правами"
    save_state "PG_EXTENSIONS_STATUS" "missing-gen-random-uuid"
    if [ "$STRICT_MODE" = "true" ]; then
      echo -e "${RED}[ERROR]${NC} STRICT_MODE: остановка из-за недоступности gen_random_uuid"
      exit 1
    fi
    ;;
  *)
    echo -e "${YELLOW}[WARN]${NC} Не удалось распознать статус расширений из вывода psql"
    save_state "PG_EXTENSIONS_STATUS" "unknown"
    if [ "$STRICT_MODE" = "true" ]; then
      echo -e "${RED}[ERROR]${NC} STRICT_MODE: остановка из-за неизвестного статуса расширений"
      exit 1
    fi
    ;;
esac
