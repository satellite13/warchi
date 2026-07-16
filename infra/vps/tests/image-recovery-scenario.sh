#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CTR_FIXTURE="${ROOT_DIR}/infra/vps/tests/fixtures/ctr"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
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

[[ -x "${CTR_FIXTURE}" ]] || fail "ctr fixture must be executable"

docker() {
  [[ "${1:-}" == "exec" && -n "${2:-}" && "${3:-}" == "ctr" ]] || return 64
  shift 3
  "${CTR_FIXTURE}" "$@"
}

fixture_ref="docker.io/arch/warchi:0.8.6"
expected_config="sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

glob_dir="${TMP_DIR}/glob"
mkdir "${glob_dir}"
touch "${glob_dir}/sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
CTR_FIXTURE_SCENARIO=glob-field
export CTR_FIXTURE_SCENARIO
actual_target="$(
  cd "${glob_dir}"
  node_image_target_digest k3d-warchi-server-0 "${fixture_ref}"
)" || fail "glob-like ctr field was expanded as a filename"
[[ "${actual_target}" == \
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ]] ||
  fail "glob-like ctr field changed the target digest"

CTR_FIXTURE_SCENARIO=direct-manifest
actual_config="$(node_image_config_digest k3d-warchi-server-0 "${fixture_ref}")" ||
  fail "direct manifest inspection failed"
[[ "${actual_config}" == "${expected_config}" ]] ||
  fail "direct manifest returned the wrong config digest"

CTR_FIXTURE_SCENARIO=index-attestation
actual_config="$(node_image_config_digest k3d-warchi-server-0 "${fixture_ref}")" ||
  fail "OCI index inspection failed"
[[ "${actual_config}" == "${expected_config}" ]] ||
  fail "OCI index selected the wrong manifest"

for docker_scenario in docker-direct-manifest docker-index; do
  CTR_FIXTURE_SCENARIO="${docker_scenario}"
  actual_config="$(node_image_config_digest k3d-warchi-server-0 "${fixture_ref}")" ||
    fail "Docker media type scenario ${docker_scenario} failed"
  [[ "${actual_config}" == "${expected_config}" ]] ||
    fail "Docker media type scenario ${docker_scenario} returned the wrong config digest"
done

for rejected_scenario in \
  missing-amd64 duplicate-amd64 command-error malformed-json wrong-field-types \
  wrong-config-type config-missing; do
  CTR_FIXTURE_SCENARIO="${rejected_scenario}"
  if node_image_config_digest k3d-warchi-server-0 "${fixture_ref}" >/dev/null 2>&1; then
    fail "ctr scenario ${rejected_scenario} was not fail-closed"
  fi
done

printf 'PASS: image recovery decisions\n'
