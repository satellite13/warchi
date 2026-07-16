#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VPS_DIR="${ROOT_DIR}/infra/vps"
AREPOS_REPO="${ROOT_DIR}/../arepos-server"
SITE_REPO="${ROOT_DIR}/../warchi-site"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  grep -Fq -- "${pattern}" "${file}" || fail "${file} does not contain: ${pattern}"
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  if grep -Fq -- "${pattern}" "${file}"; then
    fail "${file} unexpectedly contains: ${pattern}"
  fi
}

assert_matches() {
  local file="$1"
  local pattern="$2"
  grep -Eq -- "${pattern}" "${file}" || fail "${file} does not match: ${pattern}"
}

assert_equal() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  [[ "${actual}" == "${expected}" ]] ||
    fail "${label}: expected ${expected}, got ${actual}"
}

line_number() {
  local file="$1"
  local pattern="$2"
  grep -nF -- "${pattern}" "${file}" | awk -F: 'NR == 1 { print $1 }'
}

line_number_last() {
  local file="$1"
  local pattern="$2"
  grep -nF -- "${pattern}" "${file}" | awk -F: 'END { print $1 }'
}

assert_line_order() {
  local file="$1"
  local first="$2"
  local second="$3"
  local first_line second_line
  first_line="$(line_number "${file}" "${first}")"
  second_line="$(line_number "${file}" "${second}")"
  [[ -n "${first_line}" && -n "${second_line}" && "${first_line}" -lt "${second_line}" ]] ||
    fail "${file}: expected '${first}' before '${second}'"
}

line_number_matches() {
  local file="$1"
  local pattern="$2"
  grep -nE -- "${pattern}" "${file}" | awk -F: 'NR == 1 { print $1 }' || true
}

lines_are_in_order() {
  local file="$1"
  local first_pattern="$2"
  local second_pattern="$3"
  local first_line second_line
  first_line="$(line_number_matches "${file}" "${first_pattern}")"
  second_line="$(line_number_matches "${file}" "${second_pattern}")"
  [[ -n "${first_line}" && -n "${second_line}" && "${first_line}" -lt "${second_line}" ]]
}

skill_has_valid_line_count() {
  local file="$1"
  [[ "$(wc -l <"${file}")" -lt 500 ]]
}

oversized_skill_fixture="${TMP_DIR}/oversized-skill.md"
awk 'BEGIN { for (line = 1; line <= 500; line++) print "fixture line" }' \
  >"${oversized_skill_fixture}"
declare -F skill_has_valid_line_count >/dev/null ||
  fail "missing skill line-count validator"
if skill_has_valid_line_count "${oversized_skill_fixture}"; then
  fail "skill line-count validator accepted a 500-line file"
fi

storage_order_fixture="${TMP_DIR}/storage-order.sh"
printf '%s\n' \
  'assert_existing_storage_state() {' \
  '  :' \
  '}' \
  'kubectl create secret generic unsafe-mutation' \
  'assert_existing_storage_state' \
  >"${storage_order_fixture}"
declare -F lines_are_in_order >/dev/null ||
  fail "missing executable-call order validator"
if lines_are_in_order "${storage_order_fixture}" \
  '^assert_existing_storage_state$' '^kubectl create secret generic'; then
  fail "order validator accepted a mutation before the storage preflight call"
fi

HELPERS="${VPS_DIR}/helpers.sh"
[[ -f "${HELPERS}" ]] || fail "missing source-safe helpers: ${HELPERS}"
# shellcheck source=../helpers.sh
source "${HELPERS}"

spa_index_fixture="${TMP_DIR}/spa-index.html"
printf '%s\n' \
  '<!doctype html>' \
  '<html lang="en">' \
  '  <body><div class="site-shell" data-build="current" id='\''app'\''></div>' \
  '  <script defer src="/assets/index.js" type="module"></script></body>' \
  '</html>' \
  >"${spa_index_fixture}"
assert_not_contains "${spa_index_fixture}" 'SELF-HOSTED'
declare -F site_root_is_spa_html >/dev/null ||
  fail "missing SPA root response validator"
site_root_is_spa_html 'TEXT/HTML; charset=utf-8' "${spa_index_fixture}" ||
  fail "SPA root validator rejected HTML with an attributed app mount and module asset"
if site_root_is_spa_html 'text/html; charset=utf-8' /dev/null; then
  fail "SPA root validator accepted HTML without the app mount"
fi
if site_root_is_spa_html 'application/json' "${spa_index_fixture}"; then
  fail "SPA root validator accepted a non-HTML response"
fi
spa_without_script_fixture="${TMP_DIR}/spa-without-script.html"
printf '%s\n' '<div id="app"></div>' >"${spa_without_script_fixture}"
if site_root_is_spa_html 'text/html' "${spa_without_script_fixture}"; then
  fail "SPA root validator accepted HTML without the module asset"
fi
spa_data_id_fixture="${TMP_DIR}/spa-data-id.html"
printf '%s\n' \
  '<div data-id="app"></div><script type="module" src="/assets/index.js"></script>' \
  >"${spa_data_id_fixture}"
if site_root_is_spa_html 'text/html' "${spa_data_id_fixture}"; then
  fail "SPA root validator accepted data-id as the app mount"
fi
spa_data_script_fixture="${TMP_DIR}/spa-data-script.html"
printf '%s\n' \
  '<div id="app"></div><script data-type="module" data-src="/assets/index.js"></script>' \
  >"${spa_data_script_fixture}"
if site_root_is_spa_html 'text/html' "${spa_data_script_fixture}"; then
  fail "SPA root validator accepted data-type or data-src as module attributes"
fi
spa_comment_only_fixture="${TMP_DIR}/spa-comment-only.html"
printf '%s\n' \
  '<!-- <div id="app"></div><script type="module" src="/assets/index.js"></script> -->' \
  >"${spa_comment_only_fixture}"
if site_root_is_spa_html 'text/html' "${spa_comment_only_fixture}"; then
  fail "SPA root validator accepted app and module tags inside an HTML comment"
fi
spa_empty_asset_fixture="${TMP_DIR}/spa-empty-asset.html"
printf '%s\n' \
  '<div id="app"></div><script type="module" src="/assets/"></script>' \
  >"${spa_empty_asset_fixture}"
if site_root_is_spa_html 'text/html' "${spa_empty_asset_fixture}"; then
  fail "SPA root validator accepted an empty /assets/ module path"
fi

site_root_tmpdir="${TMP_DIR}/site-root-temp"
mkdir "${site_root_tmpdir}"
site_root_curl_status=200
site_root_curl_exit=0
site_root_curl_headers='Content-Type: TEXT/HTML; charset=utf-8'
site_root_curl_body="$(<"${spa_index_fixture}")"
curl() {
  local argument header_file="" body_file=""
  while [[ "$#" -gt 0 ]]; do
    argument="$1"
    case "${argument}" in
      --dump-header)
        header_file="$2"
        shift 2
        ;;
      --output)
        body_file="$2"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done
  printf '%s\n' "${site_root_curl_headers}" >"${header_file}"
  printf '%s\n' "${site_root_curl_body}" >"${body_file}"
  printf '%s' "${site_root_curl_status}"
  return "${site_root_curl_exit}"
}
TMPDIR="${site_root_tmpdir}" verify_site_root https://site.example.invalid/ ||
  fail "SPA root smoke rejected HTTP 200 HTML"
site_root_curl_status=302
if TMPDIR="${site_root_tmpdir}" verify_site_root https://site.example.invalid/ \
  2>"${TMP_DIR}/site-root-302.log"; then
  fail "SPA root smoke accepted HTTP 302"
fi
assert_contains "${TMP_DIR}/site-root-302.log" 'expected 200, got 302'
site_root_curl_status=200
site_root_curl_exit=28
if TMPDIR="${site_root_tmpdir}" verify_site_root https://site.example.invalid/ \
  2>"${TMP_DIR}/site-root-curl-failure.log"; then
  fail "SPA root smoke accepted a curl failure"
fi
assert_contains "${TMP_DIR}/site-root-curl-failure.log" 'Root page request failed'
site_root_curl_exit=0
shopt -s nullglob
site_root_temp_files=("${site_root_tmpdir}"/*)
shopt -u nullglob
[[ "${#site_root_temp_files[@]}" == "0" ]] ||
  fail "SPA root smoke did not clean temporary response files"
unset -f curl

release_repo="${TMP_DIR}/release-repo"
git init --quiet --initial-branch=main "${release_repo}"
git -C "${release_repo}" -c user.name='Bundle Test' -c user.email='bundle@example.invalid' \
  commit --quiet --allow-empty -m 'fixture'
git -C "${release_repo}" branch feature/misleading-default
git -C "${release_repo}" update-ref refs/remotes/origin/feature/misleading-default HEAD
git -C "${release_repo}" symbolic-ref \
  refs/remotes/origin/HEAD refs/remotes/origin/feature/misleading-default
declare -F release_checkout_branch_matches >/dev/null ||
  fail "missing explicit release-branch validator"
release_checkout_branch_matches "${release_repo}" main ||
  fail "misleading origin/HEAD overrode the explicitly allowed release branch"
assert_equal "refs/remotes/origin/feature/misleading-default" \
  "$(git -C "${release_repo}" symbolic-ref refs/remotes/origin/HEAD)" \
  "release branch validation must not mutate origin/HEAD"

assert_equal "warchi.ru" "$(normalize_dns_name 'WARCHI.RU.')" \
  "DNS normalization"
dns_cname_matches 'warchi.ru.' 'warchi.ru' ||
  fail "CNAME helper must accept an optional trailing dot"
if dns_cname_matches 'other.warchi.ru.' 'warchi.ru'; then
  fail "CNAME helper accepted the wrong target"
fi
dns_answers_contain_ip $'warchi.ru.\n138.124.14.246' '138.124.14.246' ||
  fail "A-record helper did not find the target IP"
if dns_answers_contain_ip '138.124.14.247' '138.124.14.246'; then
  fail "A-record helper accepted the wrong target IP"
fi
dns_exact_single_ipv4 '138.124.14.246' '138.124.14.246' ||
  fail "exact IPv4 helper rejected the expected single address"
if dns_exact_single_ipv4 $'138.124.14.246\n138.124.14.247' '138.124.14.246'; then
  fail "exact IPv4 helper accepted multiple addresses"
fi
dns_answers_have_no_ipv6 '' || fail "empty AAAA answer must pass"
if dns_answers_have_no_ipv6 '2a00::1'; then
  fail "AAAA helper accepted an IPv6 address"
fi
curl() {
  printf '%s\n' "$*"
}
bounded_args="$(bounded_curl https://example.invalid)"
[[ "${bounded_args}" == *"--connect-timeout 5"* && "${bounded_args}" == *"--max-time 20"* ]] ||
  fail "bounded_curl did not supply both timeouts"
unset -f curl
http_statuses_file="${TMP_DIR}/http-statuses"
http_args_file="${TMP_DIR}/http-args"
http_attempts_file="${TMP_DIR}/http-attempts"
set_http_statuses() {
  printf '%s\n' "$@" >"${http_statuses_file}"
  printf '0' >"${http_attempts_file}"
}
sleep() {
  :
}
curl() {
  local attempts record status curl_exit remaining
  attempts="$(<"${http_attempts_file}")"
  attempts=$((attempts + 1))
  printf '%s' "${attempts}" >"${http_attempts_file}"
  printf '%s\n' "$*" >>"${http_args_file}"
  record="$(awk 'NR == 1 { print; exit }' "${http_statuses_file}")"
  remaining="$(awk 'NR > 1' "${http_statuses_file}")"
  printf '%s\n' "${remaining}" >"${http_statuses_file}"
  status="${record%%:*}"
  if [[ "${record}" == *:* ]]; then
    curl_exit="${record#*:}"
  elif [[ "${status}" == "000" ]]; then
    curl_exit=28
  else
    curl_exit=0
  fi
  printf '%s' "${status}"
  return "${curl_exit}"
}
set_http_statuses 000 404 503 200
wait_http_success https://example.invalid/health 5 0 \
  >/dev/null 2>"${TMP_DIR}/transient-http.log" ||
  fail "HTTP readiness did not recover from transient convergence statuses"
assert_equal "4" "$(<"${http_attempts_file}")" "transient HTTP readiness attempts"
assert_contains "${http_args_file}" '--connect-timeout 3'
assert_contains "${http_args_file}" '--max-time 10'
assert_contains "${http_args_file}" '--output /dev/null'
assert_not_contains "${http_args_file}" ' -k '
assert_contains "${TMP_DIR}/transient-http.log" 'status 000'
assert_contains "${TMP_DIR}/transient-http.log" 'status 404'
assert_contains "${TMP_DIR}/transient-http.log" 'status 503'
set_http_statuses '200:28' 200
wait_http_success https://example.invalid/health 3 0 \
  >/dev/null 2>"${TMP_DIR}/exit-200-http.log" ||
  fail "curl exit failure with HTTP 200 was not retried to success"
assert_equal "2" "$(<"${http_attempts_file}")" \
  "curl exit failure with HTTP 200 attempts"
assert_contains "${TMP_DIR}/exit-200-http.log" 'status 000'
set_http_statuses '503:28' '503:28' '503:28' '503:28' 200
if wait_http_success https://example.invalid/health 4 0 \
  >/dev/null 2>"${TMP_DIR}/exit-503-http.log"; then
  fail "curl exit failures with HTTP 503 exceeded the finite retry bound"
fi
assert_equal "4" "$(<"${http_attempts_file}")" \
  "curl exit failures with HTTP 503 attempts"
assert_contains "${TMP_DIR}/exit-503-http.log" \
  'HTTP readiness failed with status 000 after 4 attempts'
for fatal_status in 401 403 301 2xx; do
  set_http_statuses "${fatal_status}" 200
  if wait_http_success 'https://example.invalid/health?token=secret' 4 0 \
    >/dev/null 2>"${TMP_DIR}/fatal-http-${fatal_status}.log"; then
    fail "HTTP readiness accepted fatal status ${fatal_status}"
  fi
  assert_equal "1" "$(<"${http_attempts_file}")" \
    "fatal HTTP ${fatal_status} readiness attempts"
  assert_contains "${TMP_DIR}/fatal-http-${fatal_status}.log" \
    "HTTP readiness failed with status ${fatal_status}"
  assert_not_contains "${TMP_DIR}/fatal-http-${fatal_status}.log" 'example.invalid'
  assert_not_contains "${TMP_DIR}/fatal-http-${fatal_status}.log" 'secret'
done
set_http_statuses 503 503 503 503 200
if wait_http_success 'https://example.invalid/health?token=secret' 4 0 \
  >/dev/null 2>"${TMP_DIR}/permanent-http.log"; then
  fail "HTTP readiness accepted a permanent failure"
fi
assert_equal "4" "$(<"${http_attempts_file}")" "permanent HTTP readiness attempts"
assert_contains "${TMP_DIR}/permanent-http.log" \
  'HTTP readiness failed with status 503 after 4 attempts'
assert_not_contains "${TMP_DIR}/permanent-http.log" 'example.invalid'
assert_not_contains "${TMP_DIR}/permanent-http.log" 'secret'
unset -f curl sleep set_http_statuses
cutover_readiness_required 0 ||
  fail "standalone verification must perform readiness waits"
if cutover_readiness_required 1; then
  fail "integrated verification repeated confirmed readiness waits"
fi
assert_equal "create" "$(auth_secret_action 0 '' '' jwt admin)" \
  "absent auth secret action"
assert_equal "match" "$(auth_secret_action 1 jwt admin jwt admin)" \
  "matching auth secret action"
if auth_secret_action 1 wrong admin jwt admin >/dev/null; then
  fail "mismatched auth secret was accepted"
fi
bundle_target_digest="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
bundle_config_digest="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
bundle_digest_records=$(
  printf '%s\n' \
    "server-0|${bundle_target_digest}|${bundle_config_digest}" \
    "agent-0|${bundle_target_digest}|${bundle_config_digest}"
)
image_digest_records_match "${bundle_target_digest}" "${bundle_digest_records}" ||
  fail "matching per-node target digests were rejected"
image_digest_records_match "${bundle_config_digest}" "${bundle_digest_records}" ||
  fail "matching per-node config digests were rejected"
if image_digest_records_match \
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" \
  "${bundle_digest_records}"; then
  fail "unrelated local image digest was accepted"
fi
scenario_log="${TMP_DIR}/scenarios.log"
helm() {
  printf 'helm %s\n' "$*" >>"${scenario_log}"
}
rollback_cutover_if_needed 1 1 0 12 7 arch
assert_contains "${scenario_log}" 'helm rollback warchi 12 -n arch'
unset -f helm
run_cutover_scenario() {
  local statuses="$1"
  local verify_status="$2"
  local scenario_statuses_file="${TMP_DIR}/rollback-health-statuses"
  local CUTOVER_STARTED=1 SITE_HEALTHY=0 status=0
  printf '%s\n' ${statuses} >"${scenario_statuses_file}"
  curl() {
    local http_status remaining
    http_status="$(awk 'NR == 1 { print; exit }' "${scenario_statuses_file}")"
    remaining="$(awk 'NR > 1' "${scenario_statuses_file}")"
    printf '%s\n' "${remaining}" >"${scenario_statuses_file}"
    printf '%s' "${http_status}"
    [[ "${http_status}" != "000" ]]
  }
  sleep() {
    :
  }
  full_verify() {
    [[ "${CUTOVER_READINESS_CONFIRMED:-0}" == "1" ]] ||
      fail "integrated verify did not receive readiness confirmation"
    printf 'verify\n' >>"${scenario_log}"
    return "${verify_status}"
  }
  if wait_http_success https://app.example.invalid/health 4 0 &&
    wait_http_success https://site.example.invalid/health 4 0 &&
    CUTOVER_READINESS_CONFIRMED=1 full_verify; then
    SITE_HEALTHY=1
  else
    status=$?
  fi
  rollback_cutover_if_needed "${status}" "${CUTOVER_STARTED}" "${SITE_HEALTHY}" \
    12 7 arch
  unset -f curl sleep full_verify
}
: >"${scenario_log}"
helm() {
  printf 'helm %s\n' "$*" >>"${scenario_log}"
}
run_cutover_scenario '503 200 200' 1 2>"${TMP_DIR}/rollback-verify-failure.log"
assert_contains "${scenario_log}" 'verify'
assert_contains "${scenario_log}" 'helm rollback warchi 12 -n arch'
: >"${scenario_log}"
run_cutover_scenario '503 200 200' 0 2>"${TMP_DIR}/rollback-success.log"
assert_equal "verify" "$(<"${scenario_log}")" \
  "complete verification must disable rollback"
: >"${scenario_log}"
run_cutover_scenario '503 503 503 503' 0 2>"${TMP_DIR}/rollback-wait-failure.log"
assert_not_contains "${scenario_log}" 'verify'
assert_contains "${scenario_log}" 'helm rollback warchi 12 -n arch'
unset -f helm
remove_local_image_tag() {
  printf 'local %s\n' "$1" >>"${scenario_log}"
}
remove_cluster_image_tag() {
  printf 'cluster %s\n' "$1" >>"${scenario_log}"
}
cleanup_image_tag_lists 0 $'temp:a\ntemp:b' 'final:a'
assert_contains "${scenario_log}" 'local temp:a'
assert_contains "${scenario_log}" 'local final:a'
assert_contains "${scenario_log}" 'cluster final:a'
unset -f remove_local_image_tag remove_cluster_image_tag
scale_deployment() {
  printf 'scale %s %s %s\n' "$1" "$2" "$3" >>"${scenario_log}"
}
wait_deployment_rollout() {
  printf 'rollout %s %s\n' "$1" "$2" >>"${scenario_log}"
}
(false) || restore_replicas_if_needed 1 3 arch
assert_contains "${scenario_log}" 'scale arepos-server 3 arch'
assert_contains "${scenario_log}" 'rollout arepos-server arch'
unset -f scale_deployment wait_deployment_rollout
valid_nginx_config='server {
  location ^~ /ws {
    if ($request_method = OPTIONS) {
      add_header X-Test nested;
    }
    proxy_pass http://arepos-server.arch.svc.cluster.local:8080;
  }
}'
nginx_ws_block_is_valid "${valid_nginx_config}" ||
  fail "brace-aware WebSocket block validator rejected nested directives"
wrong_nginx_config='server {
  location /api/ {
    proxy_pass http://arepos-server.arch.svc.cluster.local:8080;
  }
  location ^~ /ws {
    return 403;
  }
}'
if nginx_ws_block_is_valid "${wrong_nginx_config}"; then
  fail "WebSocket validator accepted proxy_pass from a different location"
fi
is_k3d_workload_node_name 'k3d-warchi-server-0' 'warchi' ||
  fail "k3d server node was not selected"
is_k3d_workload_node_name 'k3d-warchi-agent-1' 'warchi' ||
  fail "k3d agent node was not selected"
if is_k3d_workload_node_name 'k3d-warchi-serverlb' 'warchi'; then
  fail "k3d load balancer must not be selected as an image node"
fi
backup_release_required arepos-server || fail "arepos-server backup must be required"
backup_release_required warchi || fail "warchi backup must be required"
if backup_release_required warchi-site; then
  fail "warchi-site backup must remain optional when the release is absent"
fi

scripts=(
  "${VPS_DIR}/common.sh"
  "${VPS_DIR}/deploy.sh"
  "${VPS_DIR}/remote-deploy.sh"
  "${VPS_DIR}/backup.sh"
  "${VPS_DIR}/verify.sh"
  "${VPS_DIR}/tests/image-recovery-scenario.sh"
  "${VPS_DIR}/tests/mixed-image-recovery-scenario.sh"
  "${VPS_DIR}/tests/fixtures/ctr"
  "${VPS_DIR}/tests/certificate-adoption-scenario.sh"
  "${VPS_DIR}/tests/backup-helper-failure.sh"
  "${VPS_DIR}/tests/backup-lock-exclusion.sh"
  "${VPS_DIR}/tests/backup-postgres-validation-failure.sh"
  "${VPS_DIR}/tests/verify-bundle.sh"
)

bash -n "${HELPERS}"
for script in "${scripts[@]}"; do
  [[ -f "${script}" ]] || fail "missing script: ${script}"
  [[ -x "${script}" ]] || fail "script is not executable: ${script}"
  bash -n "${script}"
done

values=(
  "${VPS_DIR}/values/arepos-server.yaml"
  "${VPS_DIR}/values/warchi.yaml"
  "${VPS_DIR}/values/warchi-site.yaml"
)
for value_file in "${values[@]}"; do
  [[ -f "${value_file}" ]] || fail "missing values file: ${value_file}"
done
[[ -f "${VPS_DIR}/README.md" ]] || fail "missing README.md"
DEPLOY_SKILL="${ROOT_DIR}/.cursor/skills/deploy-warchi-ru/SKILL.md"
[[ -f "${DEPLOY_SKILL}" ]] || fail "missing deploy skill: ${DEPLOY_SKILL}"
skill_has_valid_line_count "${DEPLOY_SKILL}" ||
  fail "${DEPLOY_SKILL} must stay below 500 lines"
assert_matches "${DEPLOY_SKILL}" '^name: deploy-warchi-ru$'
assert_matches "${DEPLOY_SKILL}" '^description: .*wArchi'
assert_matches "${DEPLOY_SKILL}" '^description: .*«production deploy wArchi»'
assert_matches "${DEPLOY_SKILL}" '^description: .*«обновить prod wArchi»'
assert_not_contains "${DEPLOY_SKILL}" 'disable-model-invocation: true'
assert_contains "${DEPLOY_SKILL}" 'infra/vps/deploy.sh'
assert_contains "${DEPLOY_SKILL}" 'SHA256:5Cd7rCnHE8YjAIc7SuILJy6IfZNygAUmzw5Xkpn8VAA'
manifests=(
  "${VPS_DIR}/k8s/redirect-https.yaml"
  "${VPS_DIR}/k8s/prestage-app-certificate.yaml"
  "${VPS_DIR}/k8s/prestage-app-ingress.yaml"
  "${VPS_DIR}/k8s/prestage-site-certificate.yaml"
)
for manifest in "${manifests[@]}"; do
  [[ -f "${manifest}" ]] || fail "missing Kubernetes manifest: ${manifest}"
done

command -v helm >/dev/null 2>&1 || fail "helm is required"
helm lint "${AREPOS_REPO}/charts/arepos-server" -f "${VPS_DIR}/values/arepos-server.yaml"
helm lint "${ROOT_DIR}/charts/warchi" -f "${VPS_DIR}/values/warchi.yaml"
helm lint "${SITE_REPO}/charts/warchi-site" -f "${VPS_DIR}/values/warchi-site.yaml"

helm template arepos-server "${AREPOS_REPO}/charts/arepos-server" \
  --namespace arch -f "${VPS_DIR}/values/arepos-server.yaml" \
  >"${TMP_DIR}/arepos.yaml"
helm template warchi "${ROOT_DIR}/charts/warchi" \
  --namespace arch -f "${VPS_DIR}/values/warchi.yaml" \
  >"${TMP_DIR}/warchi.yaml"
helm template warchi-site "${SITE_REPO}/charts/warchi-site" \
  --namespace arch -f "${VPS_DIR}/values/warchi-site.yaml" \
  >"${TMP_DIR}/site.yaml"

assert_contains "${TMP_DIR}/arepos.yaml" 'image: "arch/arepos-server:0.5.2"'
arepos_resources="$(
  awk '
    $0 == "kind: Deployment" { in_deployment = 1; next }
    in_deployment && $0 == "---" { in_deployment = 0 }
    in_deployment && $0 == "        - name: arepos-server" { in_container = 1; next }
    in_container && $0 == "          resources:" {
      print
      for (line = 1; line <= 6; line++) {
        getline
        print
      }
      exit
    }
  ' "${TMP_DIR}/arepos.yaml"
)"
assert_equal \
  $'          resources:\n            limits:\n              cpu: 1000m\n              memory: 1Gi\n            requests:\n              cpu: 300m\n              memory: 512Mi' \
  "${arepos_resources}" \
  "rendered arepos-server production resources"
assert_not_contains "${TMP_DIR}/arepos.yaml" 'kind: Ingress'
assert_contains "${TMP_DIR}/arepos.yaml" 'name: SPRING_PROFILES_ACTIVE'
assert_contains "${TMP_DIR}/arepos.yaml" 'value: prod'
assert_contains "${TMP_DIR}/arepos.yaml" 'name: JWT_SECRET'
assert_contains "${TMP_DIR}/arepos.yaml" 'name: arepos-server-auth-secret'
assert_contains "${TMP_DIR}/arepos.yaml" 'name: ADMIN_SECRET'
assert_contains "${TMP_DIR}/arepos.yaml" 'name: MODEL_SYNC_OUTBOX_ENABLED'
[[ "$(grep -Fc 'storage: 20Gi' "${TMP_DIR}/arepos.yaml")" == "2" ]] ||
  fail "rendered PostgreSQL and MinIO PVC requests must both be 20Gi"
assert_contains "${TMP_DIR}/warchi.yaml" 'image: "arch/warchi:0.8.12"'
assert_contains "${TMP_DIR}/warchi.yaml" 'host: "app.warchi.ru"'
assert_contains "${TMP_DIR}/warchi.yaml" 'secretName: warchi-app-ru-tls'
assert_contains "${TMP_DIR}/warchi.yaml" 'traefik.ingress.kubernetes.io/router.entrypoints: web,websecure'
assert_contains "${TMP_DIR}/warchi.yaml" 'traefik.ingress.kubernetes.io/router.middlewares: arch-redirect-https@kubernetescrd'
assert_not_contains "${TMP_DIR}/warchi.yaml" 'cert-manager.io/'
assert_contains "${TMP_DIR}/site.yaml" 'image: "arch/warchi-site:0.2.1"'
assert_contains "${TMP_DIR}/site.yaml" 'host: "warchi.ru"'
assert_contains "${TMP_DIR}/site.yaml" 'secretName: "warchi-site-ru-tls"'
assert_contains "${TMP_DIR}/site.yaml" 'traefik.ingress.kubernetes.io/router.entrypoints: web,websecure'
assert_contains "${TMP_DIR}/site.yaml" 'traefik.ingress.kubernetes.io/router.middlewares: arch-redirect-https@kubernetescrd'
assert_not_contains "${TMP_DIR}/site.yaml" 'cert-manager.io/'

assert_contains "${VPS_DIR}/values/arepos-server.yaml" 'size: 20Gi'
[[ "$(grep -Fc 'size: 20Gi' "${VPS_DIR}/values/arepos-server.yaml")" == "2" ]] ||
  fail "PostgreSQL and MinIO persistence must both be 20Gi"

assert_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'apiVersion: traefik.io/v1alpha1'
assert_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'kind: Middleware'
assert_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'name: redirect-https'
assert_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'scheme: https'
assert_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'permanent: true'
assert_not_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'cert-manager'
assert_contains "${VPS_DIR}/k8s/prestage-app-certificate.yaml" 'kind: Certificate'
assert_contains "${VPS_DIR}/k8s/prestage-app-certificate.yaml" 'name: warchi-app-ru-tls'
assert_contains "${VPS_DIR}/k8s/prestage-app-certificate.yaml" 'secretName: warchi-app-ru-tls'
assert_contains "${VPS_DIR}/k8s/prestage-app-certificate.yaml" 'name: letsencrypt-prod'
assert_contains "${VPS_DIR}/k8s/prestage-app-certificate.yaml" 'kind: ClusterIssuer'
assert_contains "${VPS_DIR}/k8s/prestage-app-certificate.yaml" 'dnsNames:'
assert_contains "${VPS_DIR}/k8s/prestage-app-certificate.yaml" 'app.warchi.ru'
assert_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'name: warchi-app-tls-prestage'
assert_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'host: app.warchi.ru'
assert_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'name: warchi'
assert_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'secretName: warchi-app-ru-tls'
assert_not_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'router.middlewares'
assert_not_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'cert-manager.io/'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'kind: Certificate'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'name: warchi-site-ru-tls'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'secretName: warchi-site-ru-tls'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'name: letsencrypt-prod'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'kind: ClusterIssuer'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'dnsNames:'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'warchi.ru'
[[ "$(grep -hEc '^kind: Certificate$' \
  "${VPS_DIR}"/k8s/prestage-*-certificate.yaml | awk '{ total += $1 } END { print total + 0 }')" == "2" ]] ||
  fail "exactly two explicit prestage Certificates must exist"
[[ "$(grep -hEc '^  name: warchi-app-ru-tls$' \
  "${VPS_DIR}"/k8s/prestage-*-certificate.yaml | awk '{ total += $1 } END { print total + 0 }')" == "1" ]] ||
  fail "exactly one explicit app Certificate must exist"
[[ "$(grep -hEc '^  name: warchi-site-ru-tls$' \
  "${VPS_DIR}"/k8s/prestage-*-certificate.yaml | awk '{ total += $1 } END { print total + 0 }')" == "1" ]] ||
  fail "exactly one explicit site Certificate must exist"

assert_contains "${VPS_DIR}/common.sh" 'SHA256:5Cd7rCnHE8YjAIc7SuILJy6IfZNygAUmzw5Xkpn8VAA'
assert_contains "${VPS_DIR}/common.sh" 'StrictHostKeyChecking=yes'
assert_contains "${VPS_DIR}/common.sh" 'readonly VPS_HOST="138.124.14.246"'
assert_contains "${VPS_DIR}/common.sh" 'readonly VPS_USER="root"'
assert_contains "${VPS_DIR}/common.sh" 'readonly VPS_FINGERPRINT="SHA256:5Cd7rCnHE8YjAIc7SuILJy6IfZNygAUmzw5Xkpn8VAA"'
assert_contains "${VPS_DIR}/common.sh" 'readonly REMOTE_ROOT="/opt/warchi-deploy"'
assert_contains "${VPS_DIR}/common.sh" 'readonly NAMESPACE="arch"'
assert_contains "${VPS_DIR}/common.sh" 'readonly CLUSTER_NAME="warchi"'
assert_not_contains "${VPS_DIR}/common.sh" '${VPS_HOST:-'
assert_not_contains "${VPS_DIR}/common.sh" '${VPS_USER:-'
assert_not_contains "${VPS_DIR}/common.sh" '${VPS_FINGERPRINT:-'
assert_not_contains "${VPS_DIR}/common.sh" '${REMOTE_ROOT:-'
assert_not_contains "${VPS_DIR}/common.sh" '${NAMESPACE:-'
assert_not_contains "${VPS_DIR}/common.sh" '${CLUSTER_NAME:-'
assert_contains "${VPS_DIR}/common.sh" "printf -v quoted '%q'"
for pinned_script in backup.sh remote-deploy.sh; do
  assert_contains "${VPS_DIR}/${pinned_script}" 'readonly REMOTE_ROOT="/opt/warchi-deploy"'
  assert_contains "${VPS_DIR}/${pinned_script}" 'readonly NAMESPACE="arch"'
  assert_contains "${VPS_DIR}/${pinned_script}" 'readonly CLUSTER_NAME="warchi"'
done
assert_contains "${VPS_DIR}/verify.sh" 'readonly NAMESPACE="arch"'
assert_contains "${VPS_DIR}/verify.sh" 'readonly CLUSTER_NAME="warchi"'
(
  VPS_HOST=attacker.invalid
  VPS_USER=nobody
  VPS_FINGERPRINT=SHA256:wrong
  # shellcheck source=../common.sh
  source "${VPS_DIR}/common.sh"
  assert_equal "138.124.14.246" "${VPS_HOST}" "pinned VPS host"
  assert_equal "root" "${VPS_USER}" "pinned VPS user"
  assert_equal "SHA256:5Cd7rCnHE8YjAIc7SuILJy6IfZNygAUmzw5Xkpn8VAA" \
    "${VPS_FINGERPRINT}" "pinned VPS fingerprint"
)
quoted_remote_command="$(
  (
    # shellcheck source=../common.sh
    source "${VPS_DIR}/common.sh"
    ssh() {
      local argument last_argument=""
      for argument in "$@"; do
        last_argument="${argument}"
      done
      printf '%s' "${last_argument}"
    }
    SSH_OPTIONS=(-o BatchMode=yes)
    run_ssh printf '%s' 'safe value; false'
  )
)"
[[ "${quoted_remote_command}" == *'safe\ value\;\ false'* ]] ||
  fail "run_ssh did not shell-quote each remote argument"
forbidden_host_key_option='StrictHostKeyChecking='"no"
if grep -R -Fq -- "${forbidden_host_key_option}" "${VPS_DIR}"; then
  fail "disabled strict host-key checking is forbidden"
fi

for value_file in "${values[@]}"; do
  if grep -Eq '(JWT_SECRET|ADMIN_SECRET|MINIO_ACCESS_KEY|MINIO_SECRET_KEY|POSTGRES_PASSWORD|POSTGRES_SUPER_PASSWORD):[[:space:]]*[^[:space:]#]+' "${value_file}"; then
    fail "inline secret value found in ${value_file}"
  fi
done
assert_not_contains "${VPS_DIR}/values/arepos-server.yaml" 'minioadmin'
assert_not_contains "${VPS_DIR}/values/arepos-server.yaml" 'password: arepos'

assert_contains "${VPS_DIR}/deploy.sh" 'backup.sh'
assert_contains "${VPS_DIR}/deploy.sh" '--delete --delete-excluded'
assert_contains "${VPS_DIR}/deploy.sh" 'assert_dns_configuration'
assert_contains "${VPS_DIR}/deploy.sh" \
  'assert_release_checkout "${ROOT_DIR}" master "${WARCHI_VERSION}"'
assert_contains "${VPS_DIR}/deploy.sh" \
  'assert_release_checkout "${AREPOS_REPO}" master "${AREPOS_VERSION}"'
assert_contains "${VPS_DIR}/deploy.sh" \
  'assert_release_checkout "${SITE_REPO}" main "${SITE_VERSION}"'
assert_not_contains "${VPS_DIR}/deploy.sh" 'refs/remotes/origin/HEAD'
assert_contains "${VPS_DIR}/deploy.sh" 'for tool in git node awk tr'
assert_contains "${VPS_DIR}/deploy.sh" "for tool in awk chmod curl date dig docker grep helm id install jq k3d kubectl mktemp rsync sha256sum shred stat tar timeout tr"
assert_not_contains "${VPS_DIR}/deploy.sh" 'infra/vps/verify.sh'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'helm upgrade --install'
assert_contains "${VPS_DIR}/remote-deploy.sh" '--wait'
assert_contains "${VPS_DIR}/remote-deploy.sh" '--atomic'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'k3d kubeconfig write'
assert_contains "${VPS_DIR}/remote-deploy.sh" '--build-context'
assert_contains "${VPS_DIR}/remote-deploy.sh" '.placeholder'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'migration 042'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'deployment/warchi --'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'wget -qO- http://arepos-server:8080/api/v1/system/version'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'arepos-server-auth-secret'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'auth_secret_action'
assert_contains "${VPS_DIR}/remote-deploy.sh" '--from-env-file='
assert_contains "${VPS_DIR}/remote-deploy.sh" 'kubectl apply -f -'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'JWT_SECRET='
assert_contains "${VPS_DIR}/remote-deploy.sh" 'ADMIN_SECRET='
assert_contains "${VPS_DIR}/remote-deploy.sh" 'arepos-server-vps.yaml'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'shred -u'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'chmod 600'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'REUSE_EXISTING_IMAGES'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'TEMP_IMAGES'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'NEW_FINAL_IMAGES'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'HELM_MUTATION_STARTED'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'cleanup_new_image_tags'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'docker tag'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'decide_release_image_action'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'image_cluster_presence_counts'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'orchestrate_release_image_plan'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'build_release_image'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'tag_release_image'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'import_release_images'
assert_contains "${VPS_DIR}/helpers.sh" 'list_all_k3d_cluster_nodes'
assert_contains "${VPS_DIR}/helpers.sh" 'list_node_images'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'Image state is UNKNOWN'
assert_not_contains "${VPS_DIR}/remote-deploy.sh" 'ctr -n k8s.io images info'
assert_contains "${VPS_DIR}/helpers.sh" 'ctr -n k8s.io images list'
assert_contains "${VPS_DIR}/helpers.sh" 'ctr -n k8s.io content get'
assert_contains "${VPS_DIR}/helpers.sh" '.config.digest'
assert_contains "${VPS_DIR}/helpers.sh" 'node_image_config_digest'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'is_k3d_workload_node_name'
assert_contains "${VPS_DIR}/remote-deploy.sh" \
  "docker ps -a --filter \"label=k3d.cluster=\${cluster_name}\""
assert_not_contains "${VPS_DIR}/remote-deploy.sh" 'set -a'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'assert_existing_storage_state'
[[ "$(grep -Ec '^assert_existing_storage_state$' \
  "${VPS_DIR}/remote-deploy.sh")" == "1" ]] ||
  fail "storage preflight function must be invoked exactly once"
assert_contains "${VPS_DIR}/remote-deploy.sh" 'password'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'postgres-password'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'access-key'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'secret-key'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'Bound'
assert_contains "${VPS_DIR}/remote-deploy.sh" '20Gi'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'warchi-app-tls-prestage'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'prestage-app-certificate.yaml'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'warchi-site-ru-tls'
assert_contains "${VPS_DIR}/helpers.sh" 'adopt_explicit_certificate()'
assert_contains "${VPS_DIR}/helpers.sh" \
  "-p '{\"metadata\":{\"ownerReferences\":[]}}'"
assert_contains "${VPS_DIR}/helpers.sh" \
  '((.metadata.ownerReferences // []) | length) == 0'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'ingress.enabled=false'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'WARCHI_PREVIOUS_REVISION'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'rollback_cutover_if_needed'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'SITE_HEALTHY'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'infra/vps/verify.sh'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'kubectl apply -f "${WARCHI_REPO}/infra/vps/k8s/redirect-https.yaml"'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'kubectl delete ingress warchi-app-tls-prestage'
assert_not_contains "${VPS_DIR}/remote-deploy.sh" 'kubectl delete certificate'
assert_contains "${VPS_DIR}/remote-deploy.sh" \
  'wait_http_success https://app.warchi.ru/health'
assert_contains "${VPS_DIR}/remote-deploy.sh" \
  'wait_http_success https://warchi.ru/health'
assert_contains "${VPS_DIR}/remote-deploy.sh" \
  '"CUTOVER_READINESS_CONFIRMED=1"'
assert_line_order "${VPS_DIR}/remote-deploy.sh" \
  'adopt_explicit_certificate warchi-app-ru-tls' \
  'kubectl apply -f "${WARCHI_REPO}/infra/vps/k8s/prestage-app-ingress.yaml"'
assert_line_order "${VPS_DIR}/remote-deploy.sh" \
  'adopt_explicit_certificate warchi-site-ru-tls' \
  'kubectl apply -f "${WARCHI_REPO}/infra/vps/k8s/prestage-app-ingress.yaml"'
certificate_wait_line="$(
  line_number "${VPS_DIR}/remote-deploy.sh" \
    'kubectl wait --for=condition=Ready "certificate/${certificate}"'
)"
prestage_apply_line="$(
  line_number "${VPS_DIR}/remote-deploy.sh" \
    'kubectl apply -f "${WARCHI_REPO}/infra/vps/k8s/prestage-app-ingress.yaml"'
)"
[[ -n "${certificate_wait_line}" && -n "${prestage_apply_line}" &&
  "${certificate_wait_line}" -lt "${prestage_apply_line}" ]] ||
  fail "both explicit Certificates must be waited Ready before prestage ingress apply"
assert_line_order "${VPS_DIR}/remote-deploy.sh" \
  'kubectl wait --for=condition=Ready certificate/warchi-app-ru-tls' \
  'wait_http_success https://app.warchi.ru/health'
app_health_line="$(
  line_number "${VPS_DIR}/remote-deploy.sh" \
    'wait_http_success https://app.warchi.ru/health'
)"
prestage_delete_line="$(
  line_number_last "${VPS_DIR}/remote-deploy.sh" \
    'kubectl delete ingress warchi-app-tls-prestage'
)"
[[ "${app_health_line}" -lt "${prestage_delete_line}" ]] ||
  fail "app health readiness must precede operational prestage ingress deletion"
full_verify_line="$(
  line_number "${VPS_DIR}/remote-deploy.sh" \
    'bash "${WARCHI_REPO}/infra/vps/verify.sh"'
)"
[[ -n "${full_verify_line}" && "${prestage_delete_line}" -lt "${full_verify_line}" ]] ||
  fail "full verification must inspect Certificates after prestage ingress deletion"
assert_line_order "${VPS_DIR}/remote-deploy.sh" \
  'wait_http_success https://warchi.ru/health' \
  'bash "${WARCHI_REPO}/infra/vps/verify.sh"'

assert_contains "${VPS_DIR}/backup.sh" 'sha256sum'
assert_contains "${VPS_DIR}/backup.sh" 'PGPASSWORD="$POSTGRES_PASSWORD"'
assert_contains "${VPS_DIR}/backup.sh" '[[ -s "${BACKUP_DIR}/postgresql.dump" ]]'
assert_contains "${VPS_DIR}/backup.sh" '[[ -s "${BACKUP_DIR}/minio-data.tar.gz" ]]'
assert_contains "${VPS_DIR}/backup.sh" 'for release in arepos-server warchi'
assert_contains "${VPS_DIR}/backup.sh" 'helm status "${release}"'
assert_contains "${VPS_DIR}/backup.sh" 'helm list -n "${NAMESPACE}" --all --short'
assert_contains "${VPS_DIR}/backup.sh" '[[ -s "${values_file}" ]]'
assert_contains "${VPS_DIR}/backup.sh" '[[ -s "${manifest_file}" ]]'
assert_contains "${VPS_DIR}/backup.sh" 'APP_REPLICAS'
assert_contains "${VPS_DIR}/backup.sh" 'kubectl scale deployment/arepos-server'
assert_contains "${VPS_DIR}/backup.sh" '[[ "${replica_status}" =~ ^0?:0?:0?$ ]]'
assert_contains "${VPS_DIR}/backup.sh" 'trap cleanup_backup EXIT'
assert_contains "${VPS_DIR}/backup.sh" 'readonly BACKUP_LOCK_PATH="/var/lock/warchi-backup.lock"'
assert_contains "${VPS_DIR}/backup.sh" 'flock -n'
assert_matches "${VPS_DIR}/backup.sh" 'for tool in .*timeout'
assert_matches "${VPS_DIR}/backup.sh" 'for tool in .*flock'
assert_line_order "${VPS_DIR}/backup.sh" 'flock -n' \
  'kubectl delete pods -n "${NAMESPACE}"'
assert_contains "${VPS_DIR}/backup.sh" 'pg_restore --list'
assert_not_contains "${VPS_DIR}/backup.sh" 'kubectl exec -i'
assert_contains "${VPS_DIR}/backup.sh" 'timeout 120s kubectl cp'
assert_contains "${VPS_DIR}/backup.sh" 'timeout 60s kubectl exec'
assert_contains "${VPS_DIR}/backup.sh" 'kubectl cp -n "${NAMESPACE}" -c postgresql'
assert_contains "${VPS_DIR}/backup.sh" 'kubectl exec -n "${NAMESPACE}" -c postgresql'
assert_contains "${VPS_DIR}/backup.sh" 'tar -tzf'
assert_contains "${VPS_DIR}/backup.sh" \
  'busybox:1.36@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662'
assert_contains "${VPS_DIR}/backup.sh" 'claimName: arepos-server-minio-data'
assert_contains "${VPS_DIR}/backup.sh" 'mountPath: /data'
assert_contains "${VPS_DIR}/backup.sh" 'readOnly: true'
assert_contains "${VPS_DIR}/backup.sh" 'restartPolicy: Never'
assert_contains "${VPS_DIR}/backup.sh" 'automountServiceAccountToken: false'
assert_contains "${VPS_DIR}/backup.sh" 'activeDeadlineSeconds: 600'
assert_contains "${VPS_DIR}/backup.sh" 'command: [sh, -c, "sleep 600"]'
assert_contains "${VPS_DIR}/backup.sh" 'nodeName: ${MINIO_NODE_NAME}'
assert_contains "${VPS_DIR}/backup.sh" '[[ -n "${MINIO_NODE_NAME}" ]]'
assert_contains "${VPS_DIR}/backup.sh" 'app.kubernetes.io/name: warchi-minio-backup-helper'
assert_contains "${VPS_DIR}/backup.sh" '--ignore-not-found --wait=false'
assert_not_contains "${VPS_DIR}/backup.sh" '--ignore-not-found --wait=true'
assert_contains "${VPS_DIR}/backup.sh" '--for=condition=Ready'
assert_contains "${VPS_DIR}/backup.sh" 'pod/${MINIO_HELPER_POD}'
assert_contains "${VPS_DIR}/backup.sh" '-- tar -C /data -czf - .'
assert_contains "${VPS_DIR}/backup.sh" 'COMPLETE'
assert_contains "${VPS_DIR}/backup.sh" '.failed'
assert_not_contains "${VPS_DIR}/backup.sh" \
  'kubectl exec -n "${NAMESPACE}" deployment/arepos-server-minio'

"${VPS_DIR}/tests/backup-helper-failure.sh"
"${VPS_DIR}/tests/backup-lock-exclusion.sh"
"${VPS_DIR}/tests/backup-postgres-validation-failure.sh"
"${VPS_DIR}/tests/certificate-adoption-scenario.sh"
"${VPS_DIR}/tests/image-recovery-scenario.sh"
"${VPS_DIR}/tests/mixed-image-recovery-scenario.sh"

assert_contains "${VPS_DIR}/helpers.sh" '--max-time'
assert_contains "${VPS_DIR}/helpers.sh" 'local max_attempts="${2:-18}"'
assert_contains "${VPS_DIR}/helpers.sh" 'local delay_seconds="${3:-5}"'
assert_contains "${VPS_DIR}/verify.sh" 'bounded_curl'
assert_contains "${VPS_DIR}/verify.sh" 'wait_http_success https://app.warchi.ru/health'
assert_contains "${VPS_DIR}/verify.sh" 'wait_http_success https://warchi.ru/health'
assert_contains "${VPS_DIR}/verify.sh" \
  'if cutover_readiness_required "${CUTOVER_READINESS_CONFIRMED}"; then'
assert_line_order "${VPS_DIR}/verify.sh" \
  'wait_http_success https://warchi.ru/health' \
  'api_payload="$(bounded_curl'
assert_contains "${VPS_DIR}/verify.sh" 'https://app.warchi.ru/api/v1/auth/me'
assert_contains "${VPS_DIR}/verify.sh" 'https://warchi.ru/api/v1/auth/me'
assert_contains "${VPS_DIR}/verify.sh" 'verify_site_root https://warchi.ru/'
assert_not_contains "${VPS_DIR}/verify.sh" 'SELF-HOSTED'
assert_contains "${VPS_DIR}/helpers.sh" "--write-out '%{http_code}'"
assert_contains "${VPS_DIR}/helpers.sh" 'tolower($1) == "content-type:"'
assert_matches "${VPS_DIR}/verify.sh" '30(1|8)'
assert_contains "${VPS_DIR}/verify.sh" 'assert_dns_configuration'
assert_contains "${VPS_DIR}/verify.sh" 'for tool in dig curl jq k3d kubectl tr'
assert_contains "${VPS_DIR}/verify.sh" 'public_websocket_status'
assert_contains "${VPS_DIR}/verify.sh" 'CURL_MAX_TIME=10 bounded_curl'
assert_contains "${VPS_DIR}/verify.sh" "Connection: Upgrade"
assert_contains "${VPS_DIR}/verify.sh" "Upgrade: websocket"
assert_contains "${VPS_DIR}/verify.sh" "Sec-WebSocket-Version: 13"
assert_contains "${VPS_DIR}/verify.sh" "Sec-WebSocket-Key:"
assert_matches "${VPS_DIR}/verify.sh" 'case "\$\{public_websocket_status\}" in'
assert_matches "${VPS_DIR}/verify.sh" '\[1-5\]\[0-9\]\[0-9\]'
assert_contains "${VPS_DIR}/verify.sh" 'text/html'
assert_not_contains "${VPS_DIR}/verify.sh" 'http://arepos-server:8080/ws'
assert_not_contains "${VPS_DIR}/verify.sh" 'direct_websocket_'
assert_not_contains "${VPS_DIR}/verify.sh" 'Public/direct WebSocket'
assert_contains "${VPS_DIR}/verify.sh" 'deployment/warchi'
assert_contains "${VPS_DIR}/verify.sh" 'nginx -T'
assert_contains "${VPS_DIR}/verify.sh" 'extract_nginx_location_block'
assert_contains "${VPS_DIR}/verify.sh" 'nginx_websocket_block'
assert_contains "${VPS_DIR}/verify.sh" 'proxy_pass[[:space:]]+http://arepos-server\.arch\.svc\.cluster\.local:8080;'
assert_contains "${VPS_DIR}/verify.sh" 'proxy_http_version[[:space:]]+1\.1;'
assert_contains "${VPS_DIR}/verify.sh" 'proxy_set_header[[:space:]]+Upgrade[[:space:]]+\$http_upgrade;'
assert_contains "${VPS_DIR}/verify.sh" 'proxy_set_header[[:space:]]+Connection[[:space:]]+\$connection_upgrade;'
if grep -Eq '^[[:space:]]*curl[[:space:]]' \
  "${VPS_DIR}/remote-deploy.sh" "${VPS_DIR}/verify.sh"; then
  fail "production network calls must use bounded_curl"
fi

lines_are_in_order "${VPS_DIR}/remote-deploy.sh" \
  '^assert_existing_storage_state$' '^[[:space:]]*kubectl create secret generic' ||
  fail "storage preflight call must precede auth Secret mutation"
lines_are_in_order "${VPS_DIR}/remote-deploy.sh" \
  '^assert_existing_storage_state$' '^helm upgrade --install arepos-server' ||
  fail "storage preflight call must precede arepos-server Helm mutation"
assert_line_order "${HELPERS}" \
  'build_release_image "${component}" "${temporary_image}"' \
  'tag_release_image "${temporary_image}" "${final_image}"'
assert_line_order "${HELPERS}" \
  'tag_release_image "${temporary_image}" "${final_image}"' \
  'import_release_images "${new_final_image_args[@]}"'

assert_line_order "${VPS_DIR}/remote-deploy.sh" \
  'CUTOVER_STARTED=1' 'infra/vps/verify.sh'
assert_line_order "${VPS_DIR}/remote-deploy.sh" \
  'infra/vps/verify.sh' 'SITE_HEALTHY=1'
[[ "$(grep -Fc 'bash "${WARCHI_REPO}/infra/vps/verify.sh"' \
  "${VPS_DIR}/remote-deploy.sh")" == "1" ]] ||
  fail "remote-deploy.sh must invoke the authoritative verify exactly once"

assert_contains "${VPS_DIR}/README.md" 'REUSE_EXISTING_IMAGES=1'
assert_contains "${VPS_DIR}/README.md" 'absent'
assert_contains "${DEPLOY_SKILL}" 'absent'
assert_contains "${VPS_DIR}/README.md" 'automatic'
assert_contains "${VPS_DIR}/README.md" 'CNAME'
assert_contains "${VPS_DIR}/README.md" 'CSRF'
assert_contains "${VPS_DIR}/README.md" 'rotation'
assert_contains "${VPS_DIR}/README.md" 'COMPLETE'
assert_contains "${VPS_DIR}/README.md" '.failed'
assert_contains "${VPS_DIR}/README.md" 'ingress convergence'
assert_contains "${VPS_DIR}/README.md" '18 attempts'
assert_contains "${VPS_DIR}/README.md" 'two endpoint readiness windows'

if grep -R -Eq '(^|[[:space:]])set[[:space:]]+-x' "${VPS_DIR}"; then
  fail "shell xtrace is forbidden"
fi
for script in "${VPS_DIR}/common.sh" "${VPS_DIR}/deploy.sh" \
  "${VPS_DIR}/remote-deploy.sh" "${VPS_DIR}/backup.sh" "${VPS_DIR}/verify.sh"; do
  if grep -Eq '^[[:space:]]*(JWT_SECRET|ADMIN_SECRET)=.+' "${script}"; then
    fail "literal JWT/admin secret assignment is forbidden in ${script}"
  fi
done

DRY_RUN=1 \
  JWT_SECRET='dry-jwt-secret-value' \
  ADMIN_SECRET='dry-admin-secret-value' \
  MINIO_SECRET_KEY='dry-minio-secret-value' \
  "${VPS_DIR}/deploy.sh" >"${TMP_DIR}/dry-run.out"
assert_contains "${TMP_DIR}/dry-run.out" 'DRY RUN'
assert_contains "${TMP_DIR}/dry-run.out" 'Preflight'
assert_contains "${TMP_DIR}/dry-run.out" 'Backup'
assert_contains "${TMP_DIR}/dry-run.out" 'Build immutable images'
assert_contains "${TMP_DIR}/dry-run.out" 'Deploy arepos-server 0.5.2'
assert_contains "${TMP_DIR}/dry-run.out" 'Deploy warchi 0.8.12'
assert_contains "${TMP_DIR}/dry-run.out" 'Deploy warchi-site 0.2.1'
assert_contains "${TMP_DIR}/dry-run.out" 'Verify production'
assert_not_contains "${TMP_DIR}/dry-run.out" 'dry-jwt-secret-value'
assert_not_contains "${TMP_DIR}/dry-run.out" 'dry-admin-secret-value'
assert_not_contains "${TMP_DIR}/dry-run.out" 'dry-minio-secret-value'

REUSE_EXISTING_IMAGES=1 \
  DRY_RUN=1 \
  JWT_SECRET='reuse-dry-jwt-secret-value' \
  ADMIN_SECRET='reuse-dry-admin-secret-value' \
  MINIO_SECRET_KEY='reuse-dry-minio-secret-value' \
  "${VPS_DIR}/deploy.sh" >"${TMP_DIR}/reuse-dry-run.out"
assert_contains "${TMP_DIR}/reuse-dry-run.out" 'DRY RUN'
assert_contains "${TMP_DIR}/reuse-dry-run.out" \
  'Recovery mode may reuse verified images and build absent exact-tag release images'
assert_not_contains "${TMP_DIR}/reuse-dry-run.out" 'reuse-dry-jwt-secret-value'
assert_not_contains "${TMP_DIR}/reuse-dry-run.out" 'reuse-dry-admin-secret-value'
assert_not_contains "${TMP_DIR}/reuse-dry-run.out" 'reuse-dry-minio-secret-value'

printf 'PASS: VPS bundle verification completed\n'
