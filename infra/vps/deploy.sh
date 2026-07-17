#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

AREPOS_VERSION="${AREPOS_VERSION:-0.5.3}"
WARCHI_VERSION="${WARCHI_VERSION:-0.8.16}"
SITE_VERSION="${SITE_VERSION:-0.2.4}"
AREPOS_REPO="${AREPOS_REPO:-${ROOT_DIR}/../arepos-server}"
SITE_REPO="${SITE_REPO:-${ROOT_DIR}/../warchi-site}"

cleanup() {
  cleanup_known_hosts
}
trap cleanup EXIT

print_dry_run() {
  printf '%s\n' \
    'DRY RUN: no SSH, rsync, image build, backup, or deployment will run' \
    '1. Preflight local tools, pinned release branches, exact release tags, versions, and DNS' \
    '2. Preflight SSH fingerprint, VPS disk/RAM, k3d, release, and health state' \
    '3. Rsync warchi, arepos-server, and warchi-site sources with secret/build exclusions' \
    '4. Backup PostgreSQL, MinIO, and Helm state' \
    '5. Build immutable images after per-image immutable-tag decisions' \
    "6. Deploy arepos-server ${AREPOS_VERSION}; verify rollout, API version, and migration 042" \
    '7. Pre-issue certificates and preinstall warchi-site with ingress disabled' \
    "8. Deploy warchi ${WARCHI_VERSION} to app.warchi.ru, then Deploy warchi-site ${SITE_VERSION} to warchi.ru" \
    '9. Verify production DNS, TLS, redirects, API, app, site, and WebSocket endpoint'
  if [[ "${REUSE_EXISTING_IMAGES:-0}" == "1" ]]; then
    printf '%s\n' \
      'Recovery mode may reuse verified images and build absent exact-tag release images'
  fi
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

json_version() {
  node -e 'process.stdout.write(require(process.argv[1]).version)' "$1"
}

chart_version() {
  awk '$1 == "version:" { gsub(/"/, "", $2); print $2; exit }' "$1"
}

gradle_version() {
  awk -F'"' '$1 ~ /^version = / { print $2; exit }' "$1"
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
  release_checkout_branch_matches "${repo}" "${expected_branch}" || {
    printf 'Repository %s must be on release branch %s (current: %s)\n' \
      "${repo}" "${expected_branch}" "${current_branch}" >&2
    exit 1
  }

  exact_tag="$(git -C "${repo}" describe --tags --exact-match HEAD 2>/dev/null || true)"
  [[ "${exact_tag}" == "v${expected_version}" ]] || {
    printf 'Repository %s HEAD must be tagged v%s\n' "${repo}" "${expected_version}" >&2
    exit 1
  }
}

for version in "${AREPOS_VERSION}" "${WARCHI_VERSION}" "${SITE_VERSION}"; do
  validate_version "${version}"
done

for tool in git node awk tr ssh ssh-keyscan ssh-keygen rsync dig; do
  require_command "${tool}"
done

assert_release_checkout "${ROOT_DIR}" master "${WARCHI_VERSION}"
assert_release_checkout "${AREPOS_REPO}" master "${AREPOS_VERSION}"
assert_release_checkout "${SITE_REPO}" main "${SITE_VERSION}"

assert_version "warchi package" "$(json_version "${ROOT_DIR}/package.json")" "${WARCHI_VERSION}"
assert_version "warchi chart" "$(chart_version "${ROOT_DIR}/charts/warchi/Chart.yaml")" "${WARCHI_VERSION}"
assert_version "arepos Gradle" "$(gradle_version "${AREPOS_REPO}/build.gradle.kts")" "${AREPOS_VERSION}"
assert_version "arepos chart" "$(chart_version "${AREPOS_REPO}/charts/arepos-server/Chart.yaml")" "${AREPOS_VERSION}"
assert_version "site package" "$(json_version "${SITE_REPO}/package.json")" "${SITE_VERSION}"
assert_version "site chart" "$(chart_version "${SITE_REPO}/charts/warchi-site/Chart.yaml")" "${SITE_VERSION}"

assert_dns_configuration "${VPS_HOST}"

prepare_known_hosts

run_ssh bash -s -- "${REMOTE_ROOT}" "${CLUSTER_NAME}" "${NAMESPACE}" <<'REMOTE_PREFLIGHT'
set -euo pipefail
remote_root="$1"
cluster_name="$2"
namespace="$3"
for tool in awk chmod curl date dig docker grep helm id install jq k3d kubectl mktemp rsync sha256sum shred stat tar timeout tr df mkdir rm sleep; do
  command -v "${tool}" >/dev/null 2>&1 || {
    printf 'Remote command unavailable: %s\n' "${tool}" >&2
    exit 1
  }
done
[[ "$(id -u)" == "0" ]] || {
  printf 'Remote deployment must run as root\n' >&2
  exit 1
}
[[ -f "${remote_root}/secrets.env" ]] || {
  printf 'Missing remote secrets.env\n' >&2
  exit 1
}
[[ "$(stat -c '%a:%U:%G' "${remote_root}/secrets.env")" == "600:root:root" ]] || {
  printf 'secrets.env must be mode 600 and root:root\n' >&2
  exit 1
}
available_kb="$(df -Pk "${remote_root}" | awk 'NR == 2 { print $4 }')"
[[ "${available_kb}" -ge 10485760 ]] || {
  printf 'At least 10 GiB free disk is required\n' >&2
  exit 1
}
available_mem_kb="$(awk '/MemAvailable:/ { print $2 }' /proc/meminfo)"
[[ "${available_mem_kb}" -ge 1048576 ]] || {
  printf 'At least 1 GiB available RAM is required\n' >&2
  exit 1
}
k3d cluster list --no-headers | awk -v name="${cluster_name}" '$1 == name { found = 1 } END { exit !found }'
kubeconfig="$(k3d kubeconfig write "${cluster_name}")"
kubectl --kubeconfig "${kubeconfig}" get namespace "${namespace}" >/dev/null
kubectl --kubeconfig "${kubeconfig}" rollout status deployment/arepos-server -n "${namespace}" --timeout=120s
kubectl --kubeconfig "${kubeconfig}" rollout status deployment/warchi -n "${namespace}" --timeout=120s
REMOTE_PREFLIGHT

run_ssh install -d -m 700 \
  "${REMOTE_ROOT}/src" \
  "${REMOTE_ROOT}/src/warchi" \
  "${REMOTE_ROOT}/src/arepos-server" \
  "${REMOTE_ROOT}/src/warchi-site" \
  "${REMOTE_ROOT}/backups"

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
rsync_repository "${AREPOS_REPO}" arepos-server
rsync_repository "${SITE_REPO}" warchi-site

# A production deployment always starts with a fresh backup. There is intentionally no skip flag.
run_ssh env \
  "REMOTE_ROOT=${REMOTE_ROOT}" \
  "NAMESPACE=${NAMESPACE}" \
  "CLUSTER_NAME=${CLUSTER_NAME}" \
  bash "${REMOTE_ROOT}/src/warchi/infra/vps/backup.sh"

run_ssh env \
  "REMOTE_ROOT=${REMOTE_ROOT}" \
  "NAMESPACE=${NAMESPACE}" \
  "CLUSTER_NAME=${CLUSTER_NAME}" \
  "AREPOS_VERSION=${AREPOS_VERSION}" \
  "WARCHI_VERSION=${WARCHI_VERSION}" \
  "SITE_VERSION=${SITE_VERSION}" \
  "REUSE_EXISTING_IMAGES=${REUSE_EXISTING_IMAGES:-0}" \
  bash "${REMOTE_ROOT}/src/warchi/infra/vps/remote-deploy.sh"
