#!/usr/bin/env bash
set -euo pipefail

umask 077
readonly REMOTE_ROOT="/opt/warchi-deploy"
readonly NAMESPACE="arch"
readonly CLUSTER_NAME="warchi"
BACKUP_ROOT="${REMOTE_ROOT}/backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=helpers.sh
source "${SCRIPT_DIR}/helpers.sh"

[[ "$(id -u)" == "0" ]] || {
  printf 'Backup must run as root\n' >&2
  exit 1
}

for tool in k3d kubectl helm tar sha256sum sleep; do
  command -v "${tool}" >/dev/null 2>&1 || {
    printf 'Required backup command unavailable: %s\n' "${tool}" >&2
    exit 1
  }
done

install -d -m 700 "${BACKUP_ROOT}"
mkdir "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

KUBECONFIG="$(k3d kubeconfig write "${CLUSTER_NAME}")"
export KUBECONFIG

APP_REPLICAS="$(
  kubectl get deployment arepos-server -n "${NAMESPACE}" \
    -o jsonpath='{.spec.replicas}'
)"
[[ "${APP_REPLICAS}" =~ ^[0-9]+$ ]] || {
  printf 'Unable to record arepos-server replicas\n' >&2
  exit 1
}
APP_RESTORE_NEEDED=1

scale_deployment() {
  local deployment="$1" replicas="$2" namespace="$3"
  kubectl scale "deployment/${deployment}" -n "${namespace}" \
    --replicas="${replicas}" >/dev/null
}

wait_deployment_rollout() {
  local deployment="$1" namespace="$2"
  kubectl rollout status "deployment/${deployment}" -n "${namespace}" --timeout=5m
}

restore_application_replicas() {
  restore_replicas_if_needed 1 "${APP_REPLICAS}" "${NAMESPACE}"
}

restore_application() {
  local status=$?
  local restore_status=0
  set +e
  if [[ "${APP_RESTORE_NEEDED}" == "1" ]]; then
    restore_application_replicas || restore_status=$?
  fi
  trap - EXIT
  if [[ "${status}" -ne 0 ]]; then
    exit "${status}"
  fi
  exit "${restore_status}"
}
trap restore_application EXIT

kubectl rollout status deployment/arepos-server -n "${NAMESPACE}" --timeout=120s
kubectl rollout status deployment/arepos-server-postgresql -n "${NAMESPACE}" --timeout=120s
kubectl rollout status deployment/arepos-server-minio -n "${NAMESPACE}" --timeout=120s

kubectl scale deployment/arepos-server -n "${NAMESPACE}" --replicas=0 >/dev/null
for _attempt in {1..60}; do
  replica_status="$(
    kubectl get deployment arepos-server -n "${NAMESPACE}" \
      -o jsonpath='{.status.replicas}:{.status.readyReplicas}:{.status.availableReplicas}'
  )"
  [[ "${replica_status}" =~ ^(0|):(0|):(0|)$ ]] && break
  sleep 2
done
[[ "${replica_status}" =~ ^(0|):(0|):(0|)$ ]] || {
  printf 'Timed out waiting for arepos-server to quiesce\n' >&2
  exit 1
}

kubectl exec -n "${NAMESPACE}" deployment/arepos-server-postgresql \
  -- sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  >"${BACKUP_DIR}/postgresql.dump"

kubectl exec -n "${NAMESPACE}" deployment/arepos-server-minio \
  -- tar -C /data -czf - . \
  >"${BACKUP_DIR}/minio-data.tar.gz"

[[ -s "${BACKUP_DIR}/postgresql.dump" ]] || {
  printf 'PostgreSQL backup is empty\n' >&2
  exit 1
}
[[ -s "${BACKUP_DIR}/minio-data.tar.gz" ]] || {
  printf 'MinIO backup is empty\n' >&2
  exit 1
}
kubectl exec -i -n "${NAMESPACE}" deployment/arepos-server-postgresql \
  -- pg_restore --list >/dev/null <"${BACKUP_DIR}/postgresql.dump"
tar -tzf "${BACKUP_DIR}/minio-data.tar.gz" >/dev/null

backup_helm_release() {
  local release="$1"
  local values_file="${BACKUP_DIR}/${release}-values.yaml"
  local manifest_file="${BACKUP_DIR}/${release}-manifest.yaml"

  helm get values "${release}" -n "${NAMESPACE}" --all >"${values_file}"
  helm get manifest "${release}" -n "${NAMESPACE}" >"${manifest_file}"
  chmod 600 "${values_file}" "${manifest_file}"
  [[ -s "${values_file}" ]] || {
    printf 'Helm values backup is empty for required release %s\n' "${release}" >&2
    return 1
  }
  [[ -s "${manifest_file}" ]] || {
    printf 'Helm manifest backup is empty for required release %s\n' "${release}" >&2
    return 1
  }
}

for release in arepos-server warchi; do
  backup_release_required "${release}"
  helm status "${release}" -n "${NAMESPACE}" >/dev/null
  backup_helm_release "${release}"
done

site_release="$(
  helm list -n "${NAMESPACE}" --all --short --filter '^warchi-site$'
)"
if [[ "${site_release}" == "warchi-site" ]]; then
  helm status warchi-site -n "${NAMESPACE}" >/dev/null
  backup_helm_release warchi-site
elif [[ -n "${site_release}" ]]; then
  printf 'Unexpected Helm release match while checking warchi-site\n' >&2
  exit 1
fi

sha256sum \
  "${BACKUP_DIR}/postgresql.dump" \
  "${BACKUP_DIR}/minio-data.tar.gz" \
  >"${BACKUP_DIR}/SHA256SUMS"
chmod 600 "${BACKUP_DIR}/postgresql.dump" "${BACKUP_DIR}/minio-data.tar.gz" \
  "${BACKUP_DIR}/SHA256SUMS"

restore_application_replicas
APP_RESTORE_NEEDED=0
trap - EXIT
printf 'Backup completed: %s\n' "${BACKUP_DIR}"
