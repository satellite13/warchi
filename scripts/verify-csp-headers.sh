#!/bin/bash
#
# verify-csp-headers.sh — проверка CSP и security headers на задеплоенном warchi.
#
# Использование:
#   WARCHI_URL=http://127.0.0.1:18080 ./scripts/verify-csp-headers.sh
#   npm run verify:csp
#
# По умолчанию: http://127.0.0.1:18080 (ожидается port-forward svc/warchi).
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

WARCHI_URL="${WARCHI_URL:-http://warchi.arch.svc.cluster.local}"

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

HEADERS="$(curl -sS -D - -o /dev/null "$WARCHI_URL/" || true)"
if [[ -z "$HEADERS" ]] || echo "$HEADERS" | head -1 | grep -qE '000|Failed'; then
  log_error "No response from $WARCHI_URL/ — set WARCHI_URL or ensure cluster DNS / port-forward is up"
  exit 1
fi
# Reject backend JSON 401 (wrong target, e.g. stale port-forward to arepos).
if echo "$HEADERS" | grep -qi '^Content-Type:.*application/json'; then
  log_error "$WARCHI_URL/ returned JSON (expected nginx HTML). Wrong service?"
  echo "$HEADERS" | sed -n '1,20p'
  exit 1
fi

assert_header() {
  local name="$1"
  local expected_substr="$2"
  if ! echo "$HEADERS" | grep -qi "^${name}:.*${expected_substr}"; then
    log_error "Missing/weak header ${name} (expected substring: ${expected_substr})"
    echo "$HEADERS" | sed -n '1,30p'
    exit 1
  fi
  log_info "OK: ${name}"
}

log_info "Checking security headers at $WARCHI_URL/"
assert_header "Content-Security-Policy" "default-src 'self'"
assert_header "Content-Security-Policy" "script-src 'self'"
assert_header "Content-Security-Policy" "object-src 'none'"
assert_header "X-Frame-Options" "DENY"
assert_header "X-Content-Type-Options" "nosniff"
assert_header "Referrer-Policy" "strict-origin-when-cross-origin"

if echo "$HEADERS" | grep -qi "unsafe-eval"; then
  log_error "Main SPA CSP must not allow unsafe-eval (use /script-sandbox.html instead)"
  echo "$HEADERS" | sed -n '1,30p'
  exit 1
fi
log_info "OK: main SPA CSP has no unsafe-eval"

SANDBOX_HEADERS="$(curl -sS -D - -o /dev/null "$WARCHI_URL/script-sandbox.html" || true)"
if [[ -z "$SANDBOX_HEADERS" ]] || echo "$SANDBOX_HEADERS" | head -1 | grep -qE '000|Failed'; then
  log_error "No response from $WARCHI_URL/script-sandbox.html"
  exit 1
fi
if ! echo "$SANDBOX_HEADERS" | grep -qi "^Content-Security-Policy:.*unsafe-eval"; then
  log_error "script-sandbox.html CSP must allow unsafe-eval for user scripts"
  echo "$SANDBOX_HEADERS" | sed -n '1,30p'
  exit 1
fi
if ! echo "$SANDBOX_HEADERS" | grep -qi "^Content-Security-Policy:.*unsafe-inline"; then
  log_error "script-sandbox.html CSP must allow unsafe-inline (opaque sandbox cannot load host scripts via 'self')"
  echo "$SANDBOX_HEADERS" | sed -n '1,30p'
  exit 1
fi
if ! echo "$SANDBOX_HEADERS" | grep -qi "^Content-Security-Policy:.*frame-ancestors 'self'"; then
  log_error "script-sandbox.html CSP must set frame-ancestors 'self'"
  echo "$SANDBOX_HEADERS" | sed -n '1,30p'
  exit 1
fi
if ! echo "$SANDBOX_HEADERS" | grep -qi "^X-Frame-Options:.*SAMEORIGIN"; then
  log_error "script-sandbox.html must allow same-origin framing (X-Frame-Options: SAMEORIGIN)"
  echo "$SANDBOX_HEADERS" | sed -n '1,30p'
  exit 1
fi
log_info "OK: script-sandbox.html CSP allows inline+eval and same-origin framing"

# Config-source check: locations that set Cache-Control must also set CSP
# (nginx replaces inherited add_header when a location defines any add_header).
if ! rg -n "location = /index.html" -A 20 config/default.conf | rg -q "Content-Security-Policy"; then
  log_error "config/default.conf: location = /index.html must set Content-Security-Policy"
  exit 1
fi
if ! rg -n "location / \\{" -A 20 config/default.conf | rg -q "Content-Security-Policy"; then
  log_error "config/default.conf: location / must set Content-Security-Policy"
  exit 1
fi
if ! rg -n "location = /script-sandbox.html" -A 20 config/default.conf | rg -q "unsafe-eval"; then
  log_error "config/default.conf: location = /script-sandbox.html must allow unsafe-eval"
  exit 1
fi
log_info "OK: nginx config keeps CSP on SPA locations"

log_info "CSP verification passed"
