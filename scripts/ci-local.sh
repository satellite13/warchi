#!/bin/bash
#
# ci-local.sh — локальный quality gate (этапы CI/CD до появления runner).
# Эквивалент этапов 1–4 из Фазы 2; опционально coverage и npm audit.
#
# Использование:
#   ./scripts/ci-local.sh
#   RUN_E2E=true ./scripts/ci-local.sh
#   RUN_COVERAGE=true ./scripts/ci-local.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() {
  echo -e "${GREEN}==>${NC} $1"
}

warn() {
  echo -e "${YELLOW}WARN:${NC} $1"
}

step "Sync chart version from package.json"
node scripts/sync-chart-version.mjs

step "Verify version alignment"
node scripts/check-versions.mjs

step "lint"
npm run lint

step "type-check"
npx vue-tsc -b

if [ "${RUN_COVERAGE:-false}" = "true" ]; then
  step "unit-test (with coverage)"
  npm run test:coverage
else
  step "unit-test"
  npm run test
fi

step "build"
npx vite build

if [ "${RUN_E2E:-false}" = "true" ]; then
  step "e2e-test"
  npm run test:e2e
fi

step "npm audit (high+)"
if ! npm audit --audit-level=high; then
  warn "npm audit reported high/critical vulnerabilities"
fi

echo -e "${GREEN}ci-local: all checks passed${NC}"
