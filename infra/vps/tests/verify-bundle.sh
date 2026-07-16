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
assert_equal "create" "$(auth_secret_action 0 '' '' jwt admin)" \
  "absent auth secret action"
assert_equal "match" "$(auth_secret_action 1 jwt admin jwt admin)" \
  "matching auth secret action"
if auth_secret_action 1 wrong admin jwt admin >/dev/null; then
  fail "mismatched auth secret was accepted"
fi
image_digest_records_match 'sha256:abc' $'server-0=sha256:abc\nagent-0=sha256:abc' ||
  fail "matching per-node image digests were rejected"
if image_digest_records_match 'sha256:abc' $'server-0=sha256:abc\nagent-0=sha256:def'; then
  fail "mismatched per-node image digest was accepted"
fi
scenario_log="${TMP_DIR}/scenarios.log"
helm() {
  printf 'helm %s\n' "$*" >>"${scenario_log}"
}
rollback_cutover_if_needed 1 1 0 12 7 arch
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
assert_not_contains "${TMP_DIR}/arepos.yaml" 'kind: Ingress'
assert_contains "${TMP_DIR}/arepos.yaml" 'name: SPRING_PROFILES_ACTIVE'
assert_contains "${TMP_DIR}/arepos.yaml" 'value: prod'
assert_contains "${TMP_DIR}/arepos.yaml" 'name: JWT_SECRET'
assert_contains "${TMP_DIR}/arepos.yaml" 'name: arepos-server-auth-secret'
assert_contains "${TMP_DIR}/arepos.yaml" 'name: ADMIN_SECRET'
assert_contains "${TMP_DIR}/arepos.yaml" 'name: MODEL_SYNC_OUTBOX_ENABLED'
[[ "$(grep -Fc 'storage: 20Gi' "${TMP_DIR}/arepos.yaml")" == "2" ]] ||
  fail "rendered PostgreSQL and MinIO PVC requests must both be 20Gi"
assert_contains "${TMP_DIR}/warchi.yaml" 'image: "arch/warchi:0.8.2"'
assert_contains "${TMP_DIR}/warchi.yaml" 'host: "app.warchi.ru"'
assert_contains "${TMP_DIR}/warchi.yaml" 'secretName: warchi-app-ru-tls'
assert_contains "${TMP_DIR}/warchi.yaml" 'traefik.ingress.kubernetes.io/router.entrypoints: web,websecure'
assert_contains "${TMP_DIR}/warchi.yaml" 'traefik.ingress.kubernetes.io/router.middlewares: arch-redirect-https@kubernetescrd'
assert_contains "${TMP_DIR}/site.yaml" 'image: "arch/warchi-site:0.2.1"'
assert_contains "${TMP_DIR}/site.yaml" 'host: "warchi.ru"'
assert_contains "${TMP_DIR}/site.yaml" 'secretName: "warchi-site-ru-tls"'
assert_contains "${TMP_DIR}/site.yaml" 'traefik.ingress.kubernetes.io/router.entrypoints: web,websecure'
assert_contains "${TMP_DIR}/site.yaml" 'traefik.ingress.kubernetes.io/router.middlewares: arch-redirect-https@kubernetescrd'

assert_contains "${VPS_DIR}/values/arepos-server.yaml" 'size: 20Gi'
[[ "$(grep -Fc 'size: 20Gi' "${VPS_DIR}/values/arepos-server.yaml")" == "2" ]] ||
  fail "PostgreSQL and MinIO persistence must both be 20Gi"

assert_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'apiVersion: traefik.io/v1alpha1'
assert_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'kind: Middleware'
assert_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'name: redirect-https'
assert_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'scheme: https'
assert_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'permanent: true'
assert_not_contains "${VPS_DIR}/k8s/redirect-https.yaml" 'cert-manager'
assert_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'name: warchi-app-tls-prestage'
assert_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'host: app.warchi.ru'
assert_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'name: warchi'
assert_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'secretName: warchi-app-ru-tls'
assert_not_contains "${VPS_DIR}/k8s/prestage-app-ingress.yaml" 'router.middlewares'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'kind: Certificate'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'name: warchi-site-ru-tls'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'dnsNames:'
assert_contains "${VPS_DIR}/k8s/prestage-site-certificate.yaml" 'warchi.ru'

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
assert_contains "${VPS_DIR}/deploy.sh" 'for tool in git node awk tr'
assert_contains "${VPS_DIR}/deploy.sh" "for tool in awk chmod curl date dig docker grep helm id install jq k3d kubectl mktemp rsync sha256sum shred stat tar tr"
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
assert_contains "${VPS_DIR}/remote-deploy.sh" 'image_exists_on_all_cluster_nodes'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'ctr -n k8s.io images info'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'ctr -n k8s.io content get'
assert_contains "${VPS_DIR}/remote-deploy.sh" '.config.digest'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'is_k3d_workload_node_name'
assert_contains "${VPS_DIR}/remote-deploy.sh" "docker ps -a --filter \"label=k3d.cluster=\${CLUSTER_NAME}\""
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
assert_contains "${VPS_DIR}/remote-deploy.sh" 'warchi-site-ru-tls'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'ingress.enabled=false'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'WARCHI_PREVIOUS_REVISION'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'rollback_cutover_if_needed'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'SITE_HEALTHY'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'infra/vps/verify.sh'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'kubectl apply -f "${WARCHI_REPO}/infra/vps/k8s/redirect-https.yaml"'
assert_contains "${VPS_DIR}/remote-deploy.sh" 'kubectl delete ingress warchi-app-tls-prestage'

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
assert_contains "${VPS_DIR}/backup.sh" 'trap restore_application EXIT'
assert_contains "${VPS_DIR}/backup.sh" 'pg_restore --list'
assert_contains "${VPS_DIR}/backup.sh" 'tar -tzf'

assert_contains "${VPS_DIR}/verify.sh" '400 | 401 | 403'
assert_contains "${VPS_DIR}/helpers.sh" '--max-time'
assert_contains "${VPS_DIR}/verify.sh" 'bounded_curl'
assert_contains "${VPS_DIR}/verify.sh" 'https://app.warchi.ru/api/v1/auth/me'
assert_contains "${VPS_DIR}/verify.sh" 'https://warchi.ru/api/v1/auth/me'
assert_contains "${VPS_DIR}/verify.sh" "grep -F 'SELF-HOSTED' >/dev/null"
assert_matches "${VPS_DIR}/verify.sh" '30(1|8)'
assert_contains "${VPS_DIR}/verify.sh" 'assert_dns_configuration'
assert_contains "${VPS_DIR}/verify.sh" 'for tool in dig curl jq k3d kubectl tr'
assert_contains "${VPS_DIR}/verify.sh" 'direct_websocket_status'
assert_contains "${VPS_DIR}/verify.sh" 'direct_websocket_content_type'
assert_contains "${VPS_DIR}/verify.sh" 'public_websocket_status'
assert_contains "${VPS_DIR}/verify.sh" 'content-type'
assert_contains "${VPS_DIR}/verify.sh" 'text/html'
assert_contains "${VPS_DIR}/verify.sh" 'deployment/warchi'
assert_contains "${VPS_DIR}/verify.sh" 'nginx -T'
assert_contains "${VPS_DIR}/verify.sh" 'extract_nginx_location_block'
assert_contains "${VPS_DIR}/verify.sh" 'nginx_websocket_block'
assert_contains "${VPS_DIR}/verify.sh" 'proxy_pass[[:space:]]+http://arepos-server\.arch\.svc\.cluster\.local:8080;'
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
assert_line_order "${VPS_DIR}/remote-deploy.sh" \
  'docker build --pull -t "${AREPOS_TEMP_IMAGE}"' 'docker tag "${AREPOS_TEMP_IMAGE}"'
assert_line_order "${VPS_DIR}/remote-deploy.sh" \
  'docker tag "${SITE_TEMP_IMAGE}"' 'HELM_MUTATION_STARTED=1'

assert_line_order "${VPS_DIR}/remote-deploy.sh" \
  'CUTOVER_STARTED=1' 'infra/vps/verify.sh'
assert_line_order "${VPS_DIR}/remote-deploy.sh" \
  'infra/vps/verify.sh' 'SITE_HEALTHY=1'
[[ "$(grep -Fc 'bash "${WARCHI_REPO}/infra/vps/verify.sh"' \
  "${VPS_DIR}/remote-deploy.sh")" == "1" ]] ||
  fail "remote-deploy.sh must invoke the authoritative verify exactly once"

assert_contains "${VPS_DIR}/README.md" 'REUSE_EXISTING_IMAGES=1'
assert_contains "${VPS_DIR}/README.md" 'automatic'
assert_contains "${VPS_DIR}/README.md" 'CNAME'
assert_contains "${VPS_DIR}/README.md" 'CSRF'
assert_contains "${VPS_DIR}/README.md" 'rotation'

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
assert_contains "${TMP_DIR}/dry-run.out" 'Deploy warchi 0.8.2'
assert_contains "${TMP_DIR}/dry-run.out" 'Deploy warchi-site 0.2.1'
assert_contains "${TMP_DIR}/dry-run.out" 'Verify production'
assert_not_contains "${TMP_DIR}/dry-run.out" 'dry-jwt-secret-value'
assert_not_contains "${TMP_DIR}/dry-run.out" 'dry-admin-secret-value'
assert_not_contains "${TMP_DIR}/dry-run.out" 'dry-minio-secret-value'

printf 'PASS: VPS bundle verification completed\n'
