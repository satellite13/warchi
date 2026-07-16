#!/usr/bin/env bash
set -euo pipefail

readonly NAMESPACE="arch"
readonly CLUSTER_NAME="warchi"
readonly TARGET_IP="138.124.14.246"
AREPOS_VERSION="${AREPOS_VERSION:-0.5.2}"
WARCHI_VERSION="${WARCHI_VERSION:-0.8.13}"
SITE_VERSION="${SITE_VERSION:-0.2.1}"
CUTOVER_READINESS_CONFIRMED="${CUTOVER_READINESS_CONFIRMED:-0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=helpers.sh
source "${SCRIPT_DIR}/helpers.sh"

for tool in dig curl jq k3d kubectl tr; do
  command -v "${tool}" >/dev/null 2>&1 || {
    printf 'Required verification command unavailable: %s\n' "${tool}" >&2
    exit 1
  }
done

KUBECONFIG="$(k3d kubeconfig write "${CLUSTER_NAME}")"
export KUBECONFIG

assert_image() {
  local deployment="$1"
  local expected="$2"
  local actual
  actual="$(kubectl get deployment "${deployment}" -n "${NAMESPACE}" \
    -o jsonpath='{.spec.template.spec.containers[0].image}')"
  [[ "${actual}" == "${expected}" ]] || {
    printf 'Image mismatch for %s: expected %s, got %s\n' \
      "${deployment}" "${expected}" "${actual}" >&2
    exit 1
  }
}

assert_redirect() {
  local url="$1"
  local expected_location="$2"
  local headers status location
  headers="$(mktemp)"
  trap 'rm -f "${headers:-}"' RETURN
  status="$(bounded_curl --silent --show-error --output /dev/null --dump-header "${headers}" \
    --write-out '%{http_code}' "${url}")"
  location="$(awk 'BEGIN { IGNORECASE = 1 } /^Location:/ { gsub(/\r/, ""); print $2; exit }' "${headers}")"
  [[ ("${status}" == "301" || "${status}" == "308") &&
    "${location}" == "${expected_location}" ]] || {
    printf 'Unexpected redirect for %s: HTTP %s to %s\n' "${url}" "${status}" "${location}" >&2
    exit 1
  }
  rm -f "${headers}"
  trap - RETURN
}

assert_status() {
  local url="$1"
  local expected="$2"
  local actual
  actual="$(bounded_curl --silent --show-error --output /dev/null \
    --write-out '%{http_code}' "${url}")"
  [[ "${actual}" == "${expected}" ]] || {
    printf 'Unexpected status for %s: expected %s, got %s\n' \
      "${url}" "${expected}" "${actual}" >&2
    exit 1
  }
}

assert_dns_configuration "${TARGET_IP}"

for deployment in arepos-server warchi warchi-site; do
  kubectl rollout status "deployment/${deployment}" -n "${NAMESPACE}" --timeout=3m
done

assert_image arepos-server "arch/arepos-server:${AREPOS_VERSION}"
assert_image warchi "arch/warchi:${WARCHI_VERSION}"
assert_image warchi-site "arch/warchi-site:${SITE_VERSION}"

kubectl wait --for=condition=Ready certificate/warchi-app-ru-tls \
  -n "${NAMESPACE}" --timeout=3m
kubectl wait --for=condition=Ready certificate/warchi-site-ru-tls \
  -n "${NAMESPACE}" --timeout=3m

if cutover_readiness_required "${CUTOVER_READINESS_CONFIRMED}"; then
  wait_http_success https://app.warchi.ru/health
  wait_http_success https://warchi.ru/health
fi

api_payload="$(bounded_curl --fail --silent --show-error \
  https://app.warchi.ru/api/v1/system/version)"
[[ "$(jq -r '.version' <<<"${api_payload}")" == "${AREPOS_VERSION}" ]] || {
  printf 'Public API version mismatch\n' >&2
  exit 1
}

app_payload="$(bounded_curl --fail --silent --show-error https://app.warchi.ru/version.json)"
[[ "$(jq -r '.version' <<<"${app_payload}")" == "${WARCHI_VERSION}" ]] || {
  printf 'Application version mismatch\n' >&2
  exit 1
}

bounded_curl --fail --silent --show-error https://app.warchi.ru/health >/dev/null
bounded_curl --fail --silent --show-error https://warchi.ru/health >/dev/null
verify_site_root https://warchi.ru/

assert_status https://app.warchi.ru/api/v1/auth/me 401
assert_status https://warchi.ru/api/v1/auth/me 401

migration_count="$(
  kubectl exec -n "${NAMESPACE}" deployment/arepos-server-postgresql -- \
    sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM databasechangelog WHERE id = '\''042-site-feedback-moderation'\''"' |
    tr -d '[:space:]'
)"
[[ "${migration_count}" == "1" ]] || {
  printf 'Required migration 042 is not applied\n' >&2
  exit 1
}

assert_redirect http://app.warchi.ru/ https://app.warchi.ru/
assert_redirect http://warchi.ru/ https://warchi.ru/

nginx_runtime_config="$(
  kubectl exec -n "${NAMESPACE}" deployment/warchi -- nginx -T 2>&1
)"
nginx_websocket_block="$(
  extract_nginx_location_block "${nginx_runtime_config}"
)" || {
  printf 'Unable to extract the active warchi WebSocket location block\n' >&2
  exit 1
}
grep -Eq '^[[:space:]]*location[[:space:]]+\^~[[:space:]]+/ws[[:space:]]*\{' \
  <<<"${nginx_websocket_block}" &&
  grep -Eq '^[[:space:]]*proxy_pass[[:space:]]+http://arepos-server\.arch\.svc\.cluster\.local:8080;[[:space:]]*$' \
    <<<"${nginx_websocket_block}" &&
  grep -Eq '^[[:space:]]*proxy_http_version[[:space:]]+1\.1;[[:space:]]*$' \
    <<<"${nginx_websocket_block}" &&
  grep -Eq '^[[:space:]]*proxy_set_header[[:space:]]+Upgrade[[:space:]]+\$http_upgrade;[[:space:]]*$' \
    <<<"${nginx_websocket_block}" &&
  grep -Eq '^[[:space:]]*proxy_set_header[[:space:]]+Connection[[:space:]]+\$connection_upgrade;[[:space:]]*$' \
    <<<"${nginx_websocket_block}" || {
  printf 'Active warchi nginx config lacks the required WebSocket proxy route\n' >&2
  exit 1
}

# A WebSocket-capable client decides whether the unauthenticated handshake is valid.
# This probe verifies only that the public route is not served by the SPA fallback.
public_websocket_headers="$(mktemp)"
public_websocket_body="$(mktemp)"
trap 'rm -f "${public_websocket_headers:-}" "${public_websocket_body:-}"' EXIT
public_websocket_status="$(
  CURL_MAX_TIME=10 bounded_curl --silent --show-error \
    --dump-header "${public_websocket_headers}" \
    --output "${public_websocket_body}" --write-out '%{http_code}' \
    --http1.1 \
    -H 'Connection: Upgrade' \
    -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
    -H 'Origin: https://app.warchi.ru' \
    https://app.warchi.ru/ws || true
)"
public_websocket_content_type="$(
  awk 'BEGIN { IGNORECASE = 1 } /^content-type:/ {
    gsub(/\r/, ""); sub(/^[^:]+:[[:space:]]*/, ""); print; exit
  }' "${public_websocket_headers}"
)"
public_websocket_media_type="$(
  printf '%s' "${public_websocket_content_type%%;*}" |
    tr '[:upper:]' '[:lower:]' | tr -d '[:space:]'
)"

case "${public_websocket_status}" in
  [1-5][0-9][0-9]) ;;
  *)
    printf 'Unexpected public WebSocket HTTP status: %s\n' \
      "${public_websocket_status:-none}" >&2
    exit 1
    ;;
esac
[[ "${public_websocket_media_type}" != text/html ]] || {
  printf 'Public WebSocket response unexpectedly has HTML content-type\n' >&2
  exit 1
}
if grep -Eiq '<!doctype|<html' "${public_websocket_body}"; then
  printf 'Public WebSocket response contains SPA HTML\n' >&2
  exit 1
fi

printf 'Production verification passed for arepos %s, app %s, site %s\n' \
  "${AREPOS_VERSION}" "${WARCHI_VERSION}" "${SITE_VERSION}"
