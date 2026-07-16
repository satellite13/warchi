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

assert_contains() {
  local file="$1" pattern="$2"
  grep -Fq -- "${pattern}" "${file}" || fail "${file} does not contain: ${pattern}"
}

assert_matches() {
  local file="$1" pattern="$2"
  grep -Eq -- "${pattern}" "${file}" || fail "${file} does not match: ${pattern}"
}

line_number() {
  local file="$1" pattern="$2"
  grep -nF -- "${pattern}" "${file}" | awk -F: 'NR == 1 { print $1 }'
}

assert_line_order() {
  local file="$1" first="$2" second="$3"
  local first_line second_line
  first_line="$(line_number "${file}" "${first}")"
  second_line="$(line_number "${file}" "${second}")"
  [[ -n "${first_line}" && -n "${second_line}" && "${first_line}" -lt "${second_line}" ]] ||
    fail "${file}: expected '${first}' before '${second}'"
}

scenario_root="${TMP_DIR}/remote-root"
scenario_lock="${TMP_DIR}/warchi-backup.lock"
scenario_vps="${TMP_DIR}/vps"
stub_bin="${TMP_DIR}/bin"
scenario_log="${TMP_DIR}/scenario.log"
applied_yaml="${TMP_DIR}/applied.yaml"
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
exit 0
EOF

cat >"${stub_bin}/k3d" <<'EOF'
#!/usr/bin/env bash
printf '/tmp/fake-kubeconfig\n'
EOF

cat >"${stub_bin}/helm" <<'EOF'
#!/usr/bin/env bash
printf 'helm must not run after helper tar failure\n' >&2
exit 90
EOF

cat >"${stub_bin}/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat >"${stub_bin}/kubectl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'kubectl %s\n' "$*" >>"${SCENARIO_LOG}"

if [[ "${1:-}" == "get" && "${2:-}" == "deployment" &&
  "${3:-}" == "arepos-server" ]]; then
  if [[ "$*" == *".spec.replicas"* ]]; then
    printf '2'
  else
    printf '0:0:0'
  fi
  exit 0
fi

if [[ "${1:-}" == "get" && "${2:-}" == "pod" && "$*" == *"component=minio"* ]]; then
  printf 'k3d-warchi-server-0'
  exit 0
fi

case "$*" in
  *"exec "*"deployment/arepos-server-postgresql "*"pg_dump"*)
    printf 'stub-postgresql-dump'
    ;;
  *"exec -i "*"deployment/arepos-server-postgresql "*"pg_restore --list"*)
    while IFS= read -r _line; do :; done
    ;;
  *"apply -f -"*)
    awk '{ print }' >"${APPLIED_YAML}"
    ;;
  *"wait --for=condition=Ready pod/"*)
    ;;
  *"exec "*"pod/"*" -- tar -C /data -czf - ."*)
    exit 42
    ;;
  *"exec "*"deployment/arepos-server-minio "*"tar"*)
    exit 43
    ;;
  *)
    ;;
esac
EOF

chmod +x "${stub_bin}/id" "${stub_bin}/flock" "${stub_bin}/k3d" "${stub_bin}/helm" \
  "${stub_bin}/sleep" "${stub_bin}/kubectl"

set +e
PATH="${stub_bin}:${PATH}" SCENARIO_LOG="${scenario_log}" APPLIED_YAML="${applied_yaml}" \
  "${scenario_vps}/backup.sh" >"${TMP_DIR}/stdout" 2>"${TMP_DIR}/stderr"
scenario_status=$?
set -e

if [[ "${scenario_status}" -ne 42 ]]; then
  printf '%s\n' '--- backup stderr ---' >&2
  awk '{ print }' "${TMP_DIR}/stderr" >&2
  printf '%s\n' '--- kubectl log ---' >&2
  awk '{ print }' "${scenario_log}" >&2
  fail "backup must return helper tar failure status 42, got ${scenario_status}"
fi
assert_contains "${scenario_log}" 'apply -f -'
assert_contains "${scenario_log}" 'wait --for=condition=Ready'
assert_contains "${scenario_log}" 'pod/warchi-minio-backup-'
assert_contains "${scenario_log}" 'exec -n arch pod/'
assert_contains "${scenario_log}" \
  'delete pods -n arch -l app.kubernetes.io/name=warchi-minio-backup-helper --ignore-not-found --wait=false'
assert_matches "${scenario_log}" \
  'delete pod/warchi-minio-backup-[a-z0-9-]+ -n arch --ignore-not-found --wait=false'
assert_contains "${scenario_log}" 'scale deployment/arepos-server -n arch --replicas=2'
assert_line_order "${scenario_log}" 'delete pod/warchi-minio-backup-' \
  'scale deployment/arepos-server -n arch --replicas=2'

assert_contains "${applied_yaml}" 'name: warchi-minio-backup-'
assert_contains "${applied_yaml}" 'app.kubernetes.io/name: warchi-minio-backup-helper'
assert_contains "${applied_yaml}" 'nodeName: k3d-warchi-server-0'
assert_contains "${applied_yaml}" 'activeDeadlineSeconds: 600'
assert_contains "${applied_yaml}" 'automountServiceAccountToken: false'
assert_contains "${applied_yaml}" \
  'image: busybox:1.36@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662'
assert_contains "${applied_yaml}" 'command: [sh, -c, "sleep 600"]'
assert_contains "${applied_yaml}" 'mountPath: /data'
assert_contains "${applied_yaml}" 'readOnly: true'
assert_contains "${applied_yaml}" 'claimName: arepos-server-minio-data'

if grep -Fq -- 'exec -n arch deployment/arepos-server-minio' "${scenario_log}"; then
  fail "backup attempted to execute a command inside the MinIO container"
fi
complete_markers=("${scenario_root}"/backups/*/COMPLETE)
if [[ -e "${complete_markers[0]}" ]]; then
  fail "failed backup unexpectedly received a COMPLETE marker"
fi
failed_markers=("${scenario_root}"/backups/*/.failed)
[[ -e "${failed_markers[0]}" ]] ||
  fail "failed backup is missing the .failed marker"

printf 'PASS: helper pod tar failure cleaned up safely\n'
