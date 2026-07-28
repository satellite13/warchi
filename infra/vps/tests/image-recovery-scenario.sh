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
expected_target="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
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
  "${expected_target}" ]] ||
  fail "glob-like ctr field changed the target digest"

CTR_FIXTURE_SCENARIO=direct-manifest
actual_pair="$(node_image_digest_pair k3d-warchi-server-0 "${fixture_ref}")" ||
  fail "direct manifest digest-pair inspection failed"
[[ "${actual_pair}" == \
  "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd|${expected_config}" ]] ||
  fail "direct manifest returned the wrong target/config pair"
actual_config="$(node_image_config_digest k3d-warchi-server-0 "${fixture_ref}")" ||
  fail "direct manifest inspection failed"
[[ "${actual_config}" == "${expected_config}" ]] ||
  fail "direct manifest returned the wrong config digest"

CTR_FIXTURE_SCENARIO=index-attestation
actual_pair="$(node_image_digest_pair k3d-warchi-server-0 "${fixture_ref}")" ||
  fail "OCI index digest-pair inspection failed"
[[ "${actual_pair}" == "${expected_target}|${expected_config}" ]] ||
  fail "OCI index returned the wrong target/config pair"
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

target_records=$(
  printf '%s\n' \
    "k3d-warchi-server-0|${expected_target}|${expected_config}" \
    "k3d-warchi-agent-0|${expected_target}|${expected_config}"
)
image_digest_records_match "${expected_target}" "${target_records}" ||
  fail "unanimous index target digest did not match local Docker ID"
image_digest_records_match "${expected_config}" "${target_records}" ||
  fail "unanimous config digest did not match local Docker ID"

different_target="sha256:1111111111111111111111111111111111111111111111111111111111111111"
different_config="sha256:2222222222222222222222222222222222222222222222222222222222222222"
for rejected_records in \
  "k3d-warchi-server-0|${expected_target}|${expected_config}"$'\n'"k3d-warchi-agent-0|${different_target}|${expected_config}" \
  "k3d-warchi-server-0|${expected_target}|${expected_config}"$'\n'"k3d-warchi-agent-0|${expected_target}|${different_config}" \
  "k3d-warchi-server-0|${expected_target}|${expected_config}"$'\n'"k3d-warchi-agent-0|unknown|${expected_config}" \
  "k3d-warchi-server-0|${expected_target}|${expected_config}"$'\n'"ambiguous"; do
  if image_digest_records_match "${expected_target}" "${rejected_records}"; then
    fail "node disagreement or unknown digest record was not fail-closed"
  fi
done
if image_digest_records_match "${different_target}" "${target_records}"; then
  fail "unrelated local Docker ID matched unanimous node digests"
fi

CLUSTER_RECORD_SCENARIO=valid
list_all_k3d_cluster_nodes() {
  printf '%s\n' k3d-warchi-serverlb k3d-warchi-server-0 k3d-warchi-agent-0
}
list_node_images() {
  local node="$1"
  printf '%s\n' "${fixture_ref}"
  if [[ "${CLUSTER_RECORD_SCENARIO}" == "ambiguous" &&
    "${node}" == "k3d-warchi-agent-0" ]]; then
    printf '%s\n' "registry.invalid/${fixture_ref}"
  fi
}
node_image_digest_pair() {
  local node="$1"
  [[ "${CLUSTER_RECORD_SCENARIO}" != "unknown" ||
    "${node}" != "k3d-warchi-agent-0" ]] || return 42
  if [[ "${CLUSTER_RECORD_SCENARIO}" == "disagreement" &&
    "${node}" == "k3d-warchi-agent-0" ]]; then
    printf '%s|%s' "${different_target}" "${expected_config}"
  else
    printf '%s|%s' "${expected_target}" "${expected_config}"
  fi
}

actual_records="$(image_cluster_digest_records "${fixture_ref}" warchi)" ||
  fail "failed to gather unanimous target/config pairs from every workload node"
[[ "${actual_records}" == "${target_records}" ]] ||
  fail "cluster digest records did not include the exact unanimous node pairs"
for rejected_cluster_scenario in ambiguous disagreement unknown; do
  CLUSTER_RECORD_SCENARIO="${rejected_cluster_scenario}"
  if image_cluster_digest_records "${fixture_ref}" warchi >/dev/null 2>&1; then
    fail "cluster digest scenario ${rejected_cluster_scenario} was not fail-closed"
  fi
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
