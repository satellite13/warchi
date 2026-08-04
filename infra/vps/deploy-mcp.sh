#!/usr/bin/env bash
#
# Production deploy for warchi-mcp on mcp.warchi.ru (separate from the main
# arepos/warchi/site bundle).
#
# Usage:
#   DRY_RUN=1 infra/vps/deploy-mcp.sh
#   infra/vps/deploy-mcp.sh
#   REUSE_EXISTING_IMAGES=1 infra/vps/deploy-mcp.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

MCP_VERSION="${MCP_VERSION:-0.1.1}"
MCP_REPO="${MCP_REPO:-${ROOT_DIR}/../warchi-mcp}"

cleanup() {
  cleanup_known_hosts
}
trap cleanup EXIT

print_dry_run() {
  printf '%s\n' \
    'DRY RUN: no SSH, rsync, image build, or MCP deployment will run' \
    '1. Preflight local tools, exact MCP release tag, versions, and mcp.warchi.ru DNS' \
    '2. Preflight SSH fingerprint and k3d health' \
    '3. Rsync warchi (infra) and warchi-mcp sources' \
    "4. Build/import arch/warchi-mcp:${MCP_VERSION} if needed" \
    '5. Issue Certificate warchi-mcp-ru-tls and Helm upgrade with Ingress on mcp.warchi.ru' \
    '6. Verify https://mcp.warchi.ru/actuator/health and /mcp'
}

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  print_dry_run
  exit 0
fi

validate_version() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    printf 'Invalid semantic version: %s\n' "$1" >&2
    exit 1
  }
}

gradle_version() {
  awk -F'"' '$1 ~ /^version = / { print $2; exit }' "$1"
}

chart_version() {
  awk '$1 == "version:" { gsub(/"/, "", $2); print $2; exit }' "$1"
}

assert_version() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  [[ "${actual}" == "${expected}" ]] || {
    printf '%s version mismatch: expected %s, got %s\n' "${label}" "${expected}" "${actual}" >&2
    exit 1
  }
}

assert_release_checkout() {
  local repo="$1"
  local expected_branch="$2"
  local expected_version="$3"
  local current_branch exact_tag

  [[ -d "${repo}/.git" ]] || {
    printf 'Not a Git repository: %s\n' "${repo}" >&2
    exit 1
  }
  git -C "${repo}" diff --quiet
  git -C "${repo}" diff --cached --quiet
  [[ -z "$(git -C "${repo}" ls-files --others --exclude-standard)" ]] || {
    printf 'Repository has untracked files: %s\n' "${repo}" >&2
    exit 1
  }

  current_branch="$(git -C "${repo}" branch --show-current)"
  [[ "${current_branch}" == "${expected_branch}" ]] || {
    printf 'Repository %s must be on branch %s (current: %s)\n' \
      "${repo}" "${expected_branch}" "${current_branch}" >&2
    exit 1
  }

  exact_tag="$(git -C "${repo}" describe --tags --exact-match HEAD 2>/dev/null || true)"
  [[ "${exact_tag}" == "v${expected_version}" ]] || {
    printf 'Repository %s HEAD must be tagged v%s\n' "${repo}" "${expected_version}" >&2
    exit 1
  }
}

assert_mcp_dns() {
  local target_ip="$1"
  local mcp_cname mcp_answers mcp_aaaa

  mcp_cname="$(dig +short CNAME mcp.warchi.ru)"
  mcp_answers="$(dig +short A mcp.warchi.ru | awk '/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/')"
  mcp_aaaa="$(dig +short AAAA mcp.warchi.ru | awk '/:/')"

  dns_cname_matches "${mcp_cname}" 'warchi.ru' || {
    printf 'mcp.warchi.ru CNAME must be exactly warchi.ru\n' >&2
    return 1
  }
  dns_exact_single_ipv4 "${mcp_answers}" "${target_ip}" || {
    printf 'mcp.warchi.ru must resolve to exactly %s\n' "${target_ip}" >&2
    return 1
  }
  dns_answers_have_no_ipv6 "${mcp_aaaa}" || {
    printf 'mcp.warchi.ru must not resolve to an AAAA record\n' >&2
    return 1
  }
}

validate_version "${MCP_VERSION}"

for tool in git awk tr ssh ssh-keyscan ssh-keygen rsync dig; do
  require_command "${tool}"
done

assert_release_checkout "${MCP_REPO}" master "${MCP_VERSION}"
assert_version "mcp Gradle" "$(gradle_version "${MCP_REPO}/build.gradle.kts")" "${MCP_VERSION}"
assert_version "mcp chart" "$(chart_version "${MCP_REPO}/charts/warchi-mcp/Chart.yaml")" "${MCP_VERSION}"

# warchi source is needed for infra/vps helpers and values; allow dirty tree for infra-only
# MCP deploy as long as the new MCP files exist (deploy scripts themselves may be uncommitted).
[[ -f "${ROOT_DIR}/infra/vps/values/warchi-mcp.yaml" ]] || {
  printf 'Missing %s\n' "${ROOT_DIR}/infra/vps/values/warchi-mcp.yaml" >&2
  exit 1
}
[[ -f "${ROOT_DIR}/infra/vps/k8s/mcp-certificate.yaml" ]] || {
  printf 'Missing %s\n' "${ROOT_DIR}/infra/vps/k8s/mcp-certificate.yaml" >&2
  exit 1
}
[[ -f "${ROOT_DIR}/infra/vps/remote-deploy-mcp.sh" ]] || {
  printf 'Missing %s\n' "${ROOT_DIR}/infra/vps/remote-deploy-mcp.sh" >&2
  exit 1
}

assert_dns_configuration "${VPS_HOST}"
assert_mcp_dns "${VPS_HOST}"

prepare_known_hosts

run_ssh bash -s -- "${REMOTE_ROOT}" "${CLUSTER_NAME}" "${NAMESPACE}" <<'REMOTE_PREFLIGHT'
set -euo pipefail
remote_root="$1"
cluster_name="$2"
namespace="$3"
for tool in awk curl dig docker helm id jq k3d kubectl mktemp shred sleep; do
  command -v "${tool}" >/dev/null 2>&1 || {
    printf 'Remote command unavailable: %s\n' "${tool}" >&2
    exit 1
  }
done
[[ "$(id -u)" == "0" ]] || {
  printf 'Remote deployment must run as root\n' >&2
  exit 1
}
k3d cluster list --no-headers | awk -v name="${cluster_name}" '$1 == name { found = 1 } END { exit !found }'
kubeconfig="$(k3d kubeconfig write "${cluster_name}")"
kubectl --kubeconfig "${kubeconfig}" get namespace "${namespace}" >/dev/null
kubectl --kubeconfig "${kubeconfig}" rollout status deployment/arepos-server -n "${namespace}" --timeout=120s
REMOTE_PREFLIGHT

run_ssh install -d -m 700 \
  "${REMOTE_ROOT}/src" \
  "${REMOTE_ROOT}/src/warchi" \
  "${REMOTE_ROOT}/src/warchi-mcp"

rsync_repository() {
  local source_repo="$1"
  local destination_name="$2"
  local rsync_rsh
  rsync_rsh="ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${KNOWN_HOSTS_FILE}"

  RSYNC_RSH="${rsync_rsh}" rsync -a --delete --delete-excluded \
    --exclude='.git/' \
    --exclude='.env*' \
    --exclude='*.env' \
    --exclude='node_modules/' \
    --exclude='dist/' \
    --exclude='build/' \
    --exclude='coverage/' \
    --exclude='secrets.env' \
    --exclude='secrets.*' \
    --exclude='*.pem' \
    --exclude='*.key' \
    "${source_repo}/" "${VPS_USER}@${VPS_HOST}:${REMOTE_ROOT}/src/${destination_name}/"
}

rsync_repository "${ROOT_DIR}" warchi
rsync_repository "${MCP_REPO}" warchi-mcp

run_ssh chmod +x \
  "${REMOTE_ROOT}/src/warchi/infra/vps/remote-deploy-mcp.sh"

run_ssh env \
  "REMOTE_ROOT=${REMOTE_ROOT}" \
  "NAMESPACE=${NAMESPACE}" \
  "CLUSTER_NAME=${CLUSTER_NAME}" \
  "MCP_VERSION=${MCP_VERSION}" \
  "REUSE_EXISTING_IMAGES=${REUSE_EXISTING_IMAGES:-0}" \
  bash "${REMOTE_ROOT}/src/warchi/infra/vps/remote-deploy-mcp.sh"
