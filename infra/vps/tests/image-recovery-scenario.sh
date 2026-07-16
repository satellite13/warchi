#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# shellcheck source=../helpers.sh
source "${ROOT_DIR}/infra/vps/helpers.sh"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_action() {
  local expected="$1"
  shift
  local actual
  actual="$(release_image_action "$@")" ||
    fail "expected action ${expected}, decision aborted"
  [[ "${actual}" == "${expected}" ]] ||
    fail "expected action ${expected}, got ${actual}"
}

assert_abort() {
  if release_image_action "$@" >/dev/null 2>&1; then
    fail "expected image decision to abort"
  fi
}

# Arguments: reuse, local-present, workload-node-count, nodes-with-image, digests-match.
assert_action reuse 1 1 2 2 1
assert_action build 1 0 2 0 0
assert_abort 1 1 2 2 0
assert_abort 1 0 2 1 0
assert_abort 1 1 2 1 1
assert_abort 1 1 0 0 1

assert_action build 0 0 2 0 0
assert_abort 0 1 2 0 0
assert_abort 0 0 2 1 0

list_all_k3d_cluster_nodes() {
  printf '%s\n' k3d-warchi-server-0 k3d-warchi-agent-0
}

list_node_images() {
  local node="$1"
  [[ "${node}" != "k3d-warchi-agent-0" ]] || return 42
  printf '%s\n' arch/warchi:0.8.6
}

declare -F image_cluster_presence_counts >/dev/null ||
  fail "missing source-safe cluster image inspection"
if image_cluster_presence_counts arch/warchi:0.8.6 warchi >/dev/null; then
  fail "node inspection failure was counted as image absence"
fi

printf 'PASS: image recovery decisions\n'
