#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VPS_DIR="${ROOT_DIR}/infra/vps"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

scenario_root="${TMP_DIR}/remote-root"
scenario_lock="${TMP_DIR}/warchi-backup.lock"
scenario_vps="${TMP_DIR}/vps"
stub_bin="${TMP_DIR}/bin"
flock_log="${TMP_DIR}/flock.log"
kubectl_marker="${TMP_DIR}/kubectl-called"
mkdir -p "${scenario_vps}" "${stub_bin}"
cp "${VPS_DIR}/helpers.sh" "${scenario_vps}/helpers.sh"
awk -v root="${scenario_root}" -v lock="${scenario_lock}" '
  /^readonly REMOTE_ROOT=/ {
    printf "readonly REMOTE_ROOT=\"%s\"\n", root
    next
  }
  /^readonly BACKUP_LOCK_PATH=/ {
    printf "readonly BACKUP_LOCK_PATH=\"%s\"\n", lock
    next
  }
  { print }
' "${VPS_DIR}/backup.sh" >"${scenario_vps}/backup.sh"
chmod +x "${scenario_vps}/backup.sh"

cat >"${stub_bin}/id" <<'EOF'
#!/usr/bin/env bash
printf '0\n'
EOF

cat >"${stub_bin}/flock" <<'EOF'
#!/usr/bin/env bash
printf 'flock %s\n' "$*" >"${FLOCK_LOG}"
exit 73
EOF

cat >"${stub_bin}/kubectl" <<'EOF'
#!/usr/bin/env bash
touch "${KUBECTL_MARKER}"
exit 99
EOF

cat >"${stub_bin}/k3d" <<'EOF'
#!/usr/bin/env bash
printf '/tmp/fake-kubeconfig\n'
EOF

cat >"${stub_bin}/helm" <<'EOF'
#!/usr/bin/env bash
exit 99
EOF

chmod +x "${stub_bin}/id" "${stub_bin}/flock" "${stub_bin}/kubectl" \
  "${stub_bin}/k3d" "${stub_bin}/helm"

set +e
PATH="${stub_bin}:${PATH}" FLOCK_LOG="${flock_log}" KUBECTL_MARKER="${kubectl_marker}" \
  "${scenario_vps}/backup.sh" >"${TMP_DIR}/stdout" 2>"${TMP_DIR}/stderr"
scenario_status=$?
set -e

[[ "${scenario_status}" -eq 1 ]] ||
  fail "contending backup must exit 1, got ${scenario_status}"
grep -Fq -- 'flock -n 9' "${flock_log}" ||
  fail "backup did not attempt the expected nonblocking flock"
grep -Fq -- 'Another backup is already running' "${TMP_DIR}/stderr" ||
  fail "backup did not report lock contention"
[[ ! -e "${kubectl_marker}" ]] ||
  fail "contending backup reached a kubectl mutation"
[[ ! -e "${scenario_root}/backups" ]] ||
  fail "contending backup created backup artifacts before acquiring the lock"

printf 'PASS: concurrent backup lock excludes kubectl mutations\n'
