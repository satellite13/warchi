#!/usr/bin/env bash
set -euo pipefail

umask 077
readonly REMOTE_ROOT="/opt/warchi-deploy"
readonly NAMESPACE="arch"
readonly CLUSTER_NAME="warchi"
readonly BACKUP_LOCK_PATH="/var/lock/warchi-backup.lock"
BACKUP_ROOT="${REMOTE_ROOT}/backups"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
MINIO_HELPER_POD="warchi-minio-backup-$(date -u +%Y%m%dt%H%M%Sz)-$$"
POSTGRES_REMOTE_DUMP="/tmp/warchi-backup-${TIMESTAMP}-$$.dump"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=helpers.sh
source "${SCRIPT_DIR}/helpers.sh"

for tool in awk chmod date flock helm id install k3d kubectl mkdir rm sha256sum sleep tar timeout touch; do
  command -v "${tool}" >/dev/null 2>&1 || {
    printf 'Required backup command unavailable: %s\n' "${tool}" >&2
    exit 1
  }
done

[[ "$(id -u)" == "0" ]] || {
  printf 'Backup must run as root\n' >&2
  exit 1
}

exec 9>"${BACKUP_LOCK_PATH}"
flock -n 9 || {
  printf 'Another backup is already running\n' >&2
  exit 1
}

install -d -m 700 "${BACKUP_ROOT}"
mkdir "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
touch "${BACKUP_DIR}/.failed"
chmod 600 "${BACKUP_DIR}/.failed"

APP_REPLICAS=""
APP_RESTORE_NEEDED=0
MINIO_HELPER_DELETE_NEEDED=0
POSTGRES_POD=""
POSTGRES_REMOTE_CLEANUP_NEEDED=0
BACKUP_SUCCEEDED=0

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
  restore_replicas_if_needed "${APP_RESTORE_NEEDED}" "${APP_REPLICAS}" "${NAMESPACE}"
}

cleanup_backup() {
  local status=$?
  local cleanup_status=0
  set +e

  if [[ "${POSTGRES_REMOTE_CLEANUP_NEEDED}" == "1" ]]; then
    timeout 30s kubectl exec -n "${NAMESPACE}" -c postgresql "${POSTGRES_POD}" -- \
      rm -f "${POSTGRES_REMOTE_DUMP}" >/dev/null 2>&1 || cleanup_status=$?
  fi
  if [[ "${MINIO_HELPER_DELETE_NEEDED}" == "1" ]]; then
    kubectl delete "pod/${MINIO_HELPER_POD}" -n "${NAMESPACE}" \
      --ignore-not-found --wait=false >/dev/null || cleanup_status=$?
  fi
  if [[ "${APP_RESTORE_NEEDED}" == "1" ]]; then
    restore_application_replicas || cleanup_status=$?
  fi

  if [[ "${status}" -eq 0 && "${cleanup_status}" -eq 0 &&
    "${BACKUP_SUCCEEDED}" == "1" ]]; then
    rm -f "${BACKUP_DIR}/.failed" || cleanup_status=$?
    touch "${BACKUP_DIR}/COMPLETE" || cleanup_status=$?
    chmod 600 "${BACKUP_DIR}/COMPLETE" || cleanup_status=$?
  fi

  if [[ "${status}" -ne 0 || "${cleanup_status}" -ne 0 ||
    "${BACKUP_SUCCEEDED}" != "1" ]]; then
    rm -f "${BACKUP_DIR}/COMPLETE"
    touch "${BACKUP_DIR}/.failed"
    chmod 600 "${BACKUP_DIR}/.failed"
  else
    printf 'Backup completed: %s\n' "${BACKUP_DIR}"
  fi

  trap - EXIT
  if [[ "${status}" -ne 0 ]]; then
    exit "${status}"
  fi
  exit "${cleanup_status}"
}
trap cleanup_backup EXIT

KUBECONFIG="$(k3d kubeconfig write "${CLUSTER_NAME}")"
export KUBECONFIG

kubectl delete pods -n "${NAMESPACE}" \
  -l app.kubernetes.io/name=warchi-minio-backup-helper \
  --ignore-not-found --wait=false >/dev/null

APP_REPLICAS="$(
  kubectl get deployment arepos-server -n "${NAMESPACE}" \
    -o jsonpath='{.spec.replicas}'
)"
[[ "${APP_REPLICAS}" =~ ^[0-9]+$ ]] || {
  printf 'Unable to record arepos-server replicas\n' >&2
  exit 1
}
APP_RESTORE_NEEDED=1

kubectl rollout status deployment/arepos-server -n "${NAMESPACE}" --timeout=120s
kubectl rollout status deployment/arepos-server-postgresql -n "${NAMESPACE}" --timeout=120s
kubectl rollout status deployment/arepos-server-minio -n "${NAMESPACE}" --timeout=120s

MINIO_NODE_NAME="$(
  kubectl get pod -n "${NAMESPACE}" \
    -l app.kubernetes.io/instance=arepos-server,app.kubernetes.io/component=minio \
    --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].spec.nodeName}'
)"
[[ -n "${MINIO_NODE_NAME}" ]] || {
  printf 'Unable to determine the running MinIO pod node\n' >&2
  exit 1
}

kubectl scale deployment/arepos-server -n "${NAMESPACE}" --replicas=0 >/dev/null
for _attempt in {1..60}; do
  replica_status="$(
    kubectl get deployment arepos-server -n "${NAMESPACE}" \
      -o jsonpath='{.status.replicas}:{.status.readyReplicas}:{.status.availableReplicas}'
  )"
  [[ "${replica_status}" =~ ^0?:0?:0?$ ]] && break
  sleep 2
done
[[ "${replica_status}" =~ ^0?:0?:0?$ ]] || {
  printf 'Timed out waiting for arepos-server to quiesce\n' >&2
  exit 1
}

kubectl exec -n "${NAMESPACE}" deployment/arepos-server-postgresql \
  -- sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  >"${BACKUP_DIR}/postgresql.dump"

MINIO_HELPER_DELETE_NEEDED=1
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: ${MINIO_HELPER_POD}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: warchi-minio-backup-helper
spec:
  nodeName: ${MINIO_NODE_NAME}
  restartPolicy: Never
  activeDeadlineSeconds: 600
  automountServiceAccountToken: false
  containers:
    - name: backup
      image: busybox:1.36@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662
      imagePullPolicy: IfNotPresent
      command: [sh, -c, "sleep 600"]
      volumeMounts:
        - name: minio-data
          mountPath: /data
          readOnly: true
  volumes:
    - name: minio-data
      persistentVolumeClaim:
        claimName: arepos-server-minio-data
        readOnly: true
EOF
kubectl wait --for=condition=Ready -n "${NAMESPACE}" \
  "pod/${MINIO_HELPER_POD}" --timeout=120s
kubectl exec -n "${NAMESPACE}" "pod/${MINIO_HELPER_POD}" \
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
postgres_pods="$(
  kubectl get pods -n "${NAMESPACE}" \
    -l app.kubernetes.io/instance=arepos-server,app.kubernetes.io/component=postgresql \
    --field-selector=status.phase=Running \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}'
)"
postgres_pod_count="$(printf '%s\n' "${postgres_pods}" | awk 'NF { count++ } END { print count + 0 }')"
[[ "${postgres_pod_count}" == "1" ]] || {
  printf 'Expected exactly one running PostgreSQL pod\n' >&2
  exit 1
}
POSTGRES_POD="$(printf '%s\n' "${postgres_pods}" | awk 'NF { print; exit }')"
POSTGRES_REMOTE_CLEANUP_NEEDED=1
timeout 120s kubectl cp -n "${NAMESPACE}" -c postgresql \
  "${BACKUP_DIR}/postgresql.dump" "${POSTGRES_POD}:${POSTGRES_REMOTE_DUMP}"
timeout 60s kubectl exec -n "${NAMESPACE}" -c postgresql "${POSTGRES_POD}" -- \
  pg_restore --list "${POSTGRES_REMOTE_DUMP}" >/dev/null
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

BACKUP_SUCCEEDED=1
