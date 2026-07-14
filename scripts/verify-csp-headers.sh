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
log_info "OK: nginx config keeps CSP on SPA locations"

# Landing is iframe-embedded by the SPA — must allow same-origin framing.
LANDING_HEADERS="$(curl -sS -D - -o /dev/null "$WARCHI_URL/landing.html" || true)"
if [[ -z "$LANDING_HEADERS" ]] || echo "$LANDING_HEADERS" | head -1 | grep -qE '000|Failed'; then
  log_error "No response from $WARCHI_URL/landing.html"
  exit 1
fi
HEADERS="$LANDING_HEADERS"
log_info "Checking landing.html framing headers at $WARCHI_URL/landing.html"
assert_header "Content-Security-Policy" "frame-ancestors 'self'"
assert_header "X-Frame-Options" "SAMEORIGIN"
if ! rg -n "location = /landing.html" -A 20 config/default.conf | rg -q "frame-ancestors 'self'"; then
  log_error "config/default.conf: location = /landing.html must set frame-ancestors 'self'"
  exit 1
fi
log_info "OK: landing.html allows same-origin iframe embed"

log_info "CSP verification passed"
