#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# shellcheck source=../helpers.sh
source "${ROOT_DIR}/infra/vps/helpers.sh"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
LOG="${TMP_DIR}/scenario.log"
FAIL_MODE=""

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  grep -Fq -- "$1" "${LOG}" || fail "missing log entry: $1"
}

assert_not_contains() {
  if grep -Fq -- "$1" "${LOG}"; then
    fail "unexpected log entry: $1"
  fi
}

decide_release_image_action() {
  local image="$1"
  case "${image}" in
    arch/arepos-server:* | arch/warchi-site:*)
      printf 'digest %s\n' "${image}" >>"${LOG}"
      printf 'reuse'
      ;;
    arch/warchi:*) printf 'build' ;;
    *) return 1 ;;
  esac
}

build_release_image() {
  local component="$1" temporary_image="$2"
  printf 'build %s %s\n' "${component}" "${temporary_image}" >>"${LOG}"
  [[ "${FAIL_MODE}" != "build" ]]
}

tag_release_image() {
  printf 'tag %s %s\n' "$1" "$2" >>"${LOG}"
}

import_release_images() {
  printf 'import %s\n' "$*" >>"${LOG}"
  [[ "${FAIL_MODE}" != "import" ]]
}

remove_local_image_tag() {
  printf 'delete-local %s\n' "$1" >>"${LOG}"
}

remove_cluster_image_tag() {
  printf 'delete-cluster %s\n' "$1" >>"${LOG}"
}

PLAN=$'arepos-server|temp/arepos|arch/arepos-server:0.5.2\n'
PLAN+=$'warchi|temp/warchi|arch/warchi:0.8.6\n'
PLAN+=$'warchi-site|temp/site|arch/warchi-site:0.2.1'

reset_scenario() {
  : >"${LOG}"
  TEMP_IMAGES=""
  NEW_FINAL_IMAGES=""
}

assert_reused_images_untouched() {
  assert_not_contains 'tag temp/arepos'
  assert_not_contains 'tag temp/site'
  assert_not_contains 'import arch/arepos-server:0.5.2'
  assert_not_contains 'import arch/warchi-site:0.2.1'
  assert_not_contains 'delete-local arch/arepos-server:0.5.2'
  assert_not_contains 'delete-cluster arch/arepos-server:0.5.2'
  assert_not_contains 'delete-local arch/warchi-site:0.2.1'
  assert_not_contains 'delete-cluster arch/warchi-site:0.2.1'
}

declare -F orchestrate_release_image_plan >/dev/null ||
  fail "missing source-safe image orchestration"

reset_scenario
orchestrate_release_image_plan "${PLAN}"
assert_contains 'digest arch/arepos-server:0.5.2'
assert_contains 'digest arch/warchi-site:0.2.1'
assert_contains 'build warchi temp/warchi'
assert_contains 'tag temp/warchi arch/warchi:0.8.6'
assert_contains 'import arch/warchi:0.8.6'
assert_reused_images_untouched

reset_scenario
FAIL_MODE="build"
if orchestrate_release_image_plan "${PLAN}"; then
  fail "simulated build failure succeeded"
fi
cleanup_image_tag_lists 0 "${TEMP_IMAGES}" "${NEW_FINAL_IMAGES}"
assert_contains 'delete-local temp/warchi'
assert_reused_images_untouched

reset_scenario
FAIL_MODE="import"
if orchestrate_release_image_plan "${PLAN}"; then
  fail "simulated import failure succeeded"
fi
cleanup_image_tag_lists 0 "${TEMP_IMAGES}" "${NEW_FINAL_IMAGES}"
assert_contains 'delete-local temp/warchi'
assert_contains 'delete-local arch/warchi:0.8.6'
assert_contains 'delete-cluster arch/warchi:0.8.6'
assert_reused_images_untouched

printf 'PASS: mixed image recovery orchestration\n'
