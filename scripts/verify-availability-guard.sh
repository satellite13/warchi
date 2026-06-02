#!/bin/bash
#
# verify-availability-guard.sh — проверка «сторожа доступности» (outage guard).
# Убеждается, что apiClient, App.vue и i18n правильно подключены к блокировке UI
# при недоступности бэкенда или authz; затем выполняет npm run build.
# Используется в CI и локально перед релизом.
#
# Использование:
#   ./scripts/verify-availability-guard.sh
#   npm run verify:availability
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

assert_has_match() {
  local pattern="$1"
  local path="$2"
  local description="$3"
  if ! rg -n "$pattern" "$path" >/dev/null; then
    log_error "Failed: $description"
    exit 1
  fi
  log_info "OK: $description"
}

main() {
  log_info "Checking outage guard wiring in api client..."
  assert_has_match "reportAvailabilityOutage\\(" "src/api/apiClient.ts" "apiClient reports outage"
  assert_has_match "clearOutage\\(" "src/api/apiClient.ts" "apiClient clears outage on success"
  assert_has_match "resolveOutageKind\\(" "src/api/apiClient.ts" "apiClient classifies outage kind"

  log_info "Checking global outage blocker in App.vue..."
  assert_has_match "useAvailabilityGuard\\(" "src/App.vue" "App uses availability guard"
  assert_has_match "outage-blocker" "src/App.vue" "App renders outage blocker"

  log_info "Checking i18n keys for outage UI..."
  assert_has_match "outageTitle|outageAuthzMessage|outageBackendMessage|outageRetry|outageChecking" \
    "src/i18n/locales/common.ts" \
    "common locale has outage keys"

  log_info "Building frontend..."
  npm run build

  log_info "Availability guard verification passed."
}

main "$@"
