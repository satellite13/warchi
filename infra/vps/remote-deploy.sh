#!/usr/bin/env bash
set -euo pipefail

umask 077
readonly REMOTE_ROOT="/opt/warchi-deploy"
readonly NAMESPACE="arch"
readonly CLUSTER_NAME="warchi"
AREPOS_VERSION="${AREPOS_VERSION:-0.5.2}"
WARCHI_VERSION="${WARCHI_VERSION:-0.8.8}"
SITE_VERSION="${SITE_VERSION:-0.2.1}"
REUSE_EXISTING_IMAGES="${REUSE_EXISTING_IMAGES:-0}"
SRC_ROOT="${REMOTE_ROOT}/src"
WARCHI_REPO="${SRC_ROOT}/warchi"
AREPOS_REPO="${SRC_ROOT}/arepos-server"
SITE_REPO="${SRC_ROOT}/warchi-site"
SECRETS_FILE="${REMOTE_ROOT}/secrets.env"
# shellcheck source=helpers.sh
source "${WARCHI_REPO}/infra/vps/helpers.sh"
RUNTIME_VALUES=""
AUTH_ENV_FILE=""
WARCHI_RUNTIME_VALUES=""
SITE_RUNTIME_VALUES=""
EMPTY_CONTEXT=""
WARCHI_PREVIOUS_REVISION=""
SITE_PRESTAGE_REVISION=""
CUTOVER_STARTED=0
SITE_HEALTHY=0
HELM_MUTATION_STARTED=0
TEMP_IMAGES=""
NEW_FINAL_IMAGES=""

secure_remove() {
  local path="$1"
  [[ -e "${path}" ]] || return 0
  if [[ -f "${path}" ]]; then
    shred -u "${path}"
  else
    rm -rf "${path}"
  fi
}

remove_image_from_cluster_nodes() {
  local image="$1"
  local node candidate
  while IFS= read -r node; do
    is_k3d_workload_node_name "${node}" "${CLUSTER_NAME}" || continue
    while IFS= read -r candidate; do
      [[ "${candidate}" =~ (^|/)${image//./\\.}$ ]] || continue
      docker exec "${node}" ctr -n k8s.io images rm "${candidate}" >/dev/null 2>&1 || true
    done < <(docker exec "${node}" ctr -n k8s.io images list -q 2>/dev/null)
  done < <(docker ps -a --filter "label=k3d.cluster=${CLUSTER_NAME}" --format '{{.Names}}')
}

cleanup_new_image_tags() {
  command -v docker >/dev/null 2>&1 || return 0
  cleanup_image_tag_lists "${HELM_MUTATION_STARTED}" \
    "${TEMP_IMAGES}" "${NEW_FINAL_IMAGES}"
}

remove_local_image_tag() {
  docker image rm -f "$1" >/dev/null 2>&1 || true
}

remove_cluster_image_tag() {
  remove_image_from_cluster_nodes "$1"
}

cleanup() {
  local status=$?
  set +e
  if [[ "${status}" -ne 0 && "${CUTOVER_STARTED}" == "1" && "${SITE_HEALTHY}" != "1" ]]; then
    printf 'Cutover failed; automatically restoring the previous warchi revision\n' >&2
    rollback_cutover_if_needed "${status}" "${CUTOVER_STARTED}" "${SITE_HEALTHY}" \
      "${WARCHI_PREVIOUS_REVISION}" "${SITE_PRESTAGE_REVISION}" "${NAMESPACE}" >&2
  fi
  kubectl delete ingress warchi-app-tls-prestage -n "${NAMESPACE}" \
    --ignore-not-found >/dev/null 2>&1
  [[ -n "${AUTH_ENV_FILE}" ]] && secure_remove "${AUTH_ENV_FILE}"
  [[ -n "${RUNTIME_VALUES}" ]] && secure_remove "${RUNTIME_VALUES}"
  [[ -n "${WARCHI_RUNTIME_VALUES}" ]] && secure_remove "${WARCHI_RUNTIME_VALUES}"
  [[ -n "${SITE_RUNTIME_VALUES}" ]] && secure_remove "${SITE_RUNTIME_VALUES}"
  [[ -n "${EMPTY_CONTEXT}" ]] && secure_remove "${EMPTY_CONTEXT}"
  cleanup_new_image_tags
  return "${status}"
}
trap cleanup EXIT

[[ "$(id -u)" == "0" ]] || {
  printf 'Remote deployment must run as root\n' >&2
  exit 1
}
[[ "$(stat -c '%a:%U:%G' "${SECRETS_FILE}")" == "600:root:root" ]] || {
  printf 'secrets.env must be mode 600 and root:root\n' >&2
  exit 1
}
[[ "${NAMESPACE}" == "arch" ]] || {
  printf 'This production bundle requires namespace arch\n' >&2
  exit 1
}
[[ "${REUSE_EXISTING_IMAGES}" == "0" || "${REUSE_EXISTING_IMAGES}" == "1" ]] || {
  printf 'REUSE_EXISTING_IMAGES must be 0 or 1\n' >&2
  exit 1
}

for tool in base64 date docker k3d kubectl helm curl jq shred; do
  command -v "${tool}" >/dev/null 2>&1 || {
    printf 'Required deployment command unavailable: %s\n' "${tool}" >&2
    exit 1
  }
done

# shellcheck disable=SC1090
source "${SECRETS_FILE}"

required_secrets=(
  JWT_SECRET
  ADMIN_SECRET
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
  POSTGRES_PASSWORD
  POSTGRES_SUPER_PASSWORD
)
for secret_name in "${required_secrets[@]}"; do
  [[ -n "${!secret_name:-}" ]] || {
    printf 'Required secret variable is missing: %s\n' "${secret_name}" >&2
    exit 1
  }
done

KUBECONFIG="$(k3d kubeconfig write "${CLUSTER_NAME}")"
export KUBECONFIG
kubectl get namespace "${NAMESPACE}" >/dev/null

secret_value_matches() {
  local secret_name="$1"
  local key="$2"
  local expected="$3"
  local encoded actual
  encoded="$(
    kubectl get secret "${secret_name}" -n "${NAMESPACE}" \
      -o "jsonpath={.data['${key}']}"
  )"
  [[ -n "${encoded}" ]] || return 1
  actual="$(printf '%s' "${encoded}" | base64 -d)"
  [[ "${actual}" == "${expected}" ]]
}

secret_value() {
  local secret_name="$1" key="$2"
  local encoded
  encoded="$(
    kubectl get secret "${secret_name}" -n "${NAMESPACE}" \
      -o "jsonpath={.data['${key}']}"
  )"
  [[ -n "${encoded}" ]] || return 1
  printf '%s' "${encoded}" | base64 -d
}

assert_pvc_20gi_bound() {
  local pvc="$1"
  local phase requested capacity storage_class
  phase="$(kubectl get pvc "${pvc}" -n "${NAMESPACE}" -o jsonpath='{.status.phase}')"
  requested="$(kubectl get pvc "${pvc}" -n "${NAMESPACE}" \
    -o jsonpath='{.spec.resources.requests.storage}')"
  capacity="$(kubectl get pvc "${pvc}" -n "${NAMESPACE}" \
    -o jsonpath='{.status.capacity.storage}')"
  storage_class="$(kubectl get pvc "${pvc}" -n "${NAMESPACE}" \
    -o jsonpath='{.spec.storageClassName}')"
  [[ "${phase}" == "Bound" && "${requested}" == "20Gi" && "${capacity}" == "20Gi" &&
    -n "${storage_class}" ]] || {
    printf 'PVC %s must be Bound with exact 20Gi request and capacity\n' "${pvc}" >&2
    return 1
  }
  kubectl get storageclass "${storage_class}" >/dev/null
}

assert_existing_storage_state() {
  secret_value_matches arepos-server-postgresql password "${POSTGRES_PASSWORD}" &&
    secret_value_matches arepos-server-postgresql postgres-password \
      "${POSTGRES_SUPER_PASSWORD}" || {
    printf 'Existing PostgreSQL credentials do not match secrets.env\n' >&2
    return 1
  }
  secret_value_matches arepos-server-minio access-key "${MINIO_ACCESS_KEY}" &&
    secret_value_matches arepos-server-minio secret-key "${MINIO_SECRET_KEY}" || {
    printf 'Existing MinIO credentials do not match secrets.env\n' >&2
    return 1
  }
  assert_pvc_20gi_bound arepos-server-postgresql-data
  assert_pvc_20gi_bound arepos-server-minio-data
}

assert_existing_storage_state

auth_secret_exists=0
actual_jwt=""
actual_admin=""
if kubectl get secret arepos-server-auth-secret -n "${NAMESPACE}" >/dev/null 2>&1; then
  auth_secret_exists=1
  actual_jwt="$(secret_value arepos-server-auth-secret JWT_SECRET)"
  actual_admin="$(secret_value arepos-server-auth-secret ADMIN_SECRET)"
fi
auth_action="$(
  auth_secret_action "${auth_secret_exists}" "${actual_jwt}" "${actual_admin}" \
    "${JWT_SECRET}" "${ADMIN_SECRET}"
)" || {
  printf 'Existing auth Secret does not match secrets.env; refusing overwrite\n' >&2
  exit 1
}
if [[ "${auth_action}" == "create" ]]; then
  AUTH_ENV_FILE="$(mktemp)"
  chmod 600 "${AUTH_ENV_FILE}"
  {
    printf 'JWT_SECRET=%s\n' "${JWT_SECRET}"
    printf 'ADMIN_SECRET=%s\n' "${ADMIN_SECRET}"
  } >"${AUTH_ENV_FILE}"
  kubectl create secret generic arepos-server-auth-secret \
    -n "${NAMESPACE}" \
    --from-env-file="${AUTH_ENV_FILE}" \
    --dry-run=client -o yaml |
    kubectl apply -f - >/dev/null
  secure_remove "${AUTH_ENV_FILE}"
  AUTH_ENV_FILE=""
fi

# The pre-bundle file contained inline credentials. The backup has already completed
# before this script starts, so remove the obsolete copy without rotating credentials.
secure_remove "${REMOTE_ROOT}/values/arepos-server-vps.yaml"
chmod 600 "${WARCHI_REPO}/infra/vps/values/"*.yaml

list_all_k3d_cluster_nodes() {
  local cluster_name="$1"
  docker ps -a --filter "label=k3d.cluster=${cluster_name}" --format '{{.Names}}'
}

list_node_images() {
  local node="$1"
  docker exec "${node}" ctr -n k8s.io images list -q
}

image_digest_matches_all_nodes() {
  local image="$1"
  local local_digest records
  local_digest="$(docker image inspect --format '{{.Id}}' "${image}")" || return 2
  is_sha256_digest "${local_digest}" || return 2
  records="$(image_cluster_digest_records "${image}" "${CLUSTER_NAME}")" || return 2
  image_digest_records_match "${local_digest}" "${records}"
}

decide_release_image_action() {
  local image="$1"
  local local_present=0 presence node_count nodes_with_image
  local digests_match=0 digest_status=0 action
  docker image inspect "${image}" >/dev/null 2>&1 && local_present=1
  presence="$(image_cluster_presence_counts "${image}" "${CLUSTER_NAME}")" || {
    printf 'Image state is UNKNOWN; unable to inspect every k3d workload node: %s\n' \
      "${image}" >&2
    return 1
  }
  read -r node_count nodes_with_image <<<"${presence}"

  if [[ "${local_present}" == "1" &&
    "${node_count}" -gt 0 &&
    "${nodes_with_image}" == "${node_count}" ]]; then
    if image_digest_matches_all_nodes "${image}"; then
      digests_match=1
    else
      digest_status=$?
      if [[ "${digest_status}" == "2" ]]; then
        printf 'Image state is UNKNOWN; target/config digest inspection failed: %s\n' \
          "${image}" >&2
        return 1
      fi
    fi
  fi

  action="$(
    release_image_action "${REUSE_EXISTING_IMAGES}" "${local_present}" \
      "${node_count}" "${nodes_with_image}" "${digests_match}"
  )" || {
    if [[ "${REUSE_EXISTING_IMAGES}" == "0" ]]; then
      printf 'Refusing to overwrite immutable image tag %s\n' "${image}" >&2
    else
      printf 'Recovery image is partial or has a target/config digest mismatch: %s\n' \
        "${image}" >&2
    fi
    return 1
  }
  printf '%s' "${action}"
}

AREPOS_IMAGE="arch/arepos-server:${AREPOS_VERSION}"
WARCHI_IMAGE="arch/warchi:${WARCHI_VERSION}"
SITE_IMAGE="arch/warchi-site:${SITE_VERSION}"
BUILD_ID="vps-build-$(date -u +%Y%m%dT%H%M%SZ)-$$"
AREPOS_TEMP_IMAGE="arch/arepos-server:${AREPOS_VERSION}-${BUILD_ID}"
WARCHI_TEMP_IMAGE="arch/warchi:${WARCHI_VERSION}-${BUILD_ID}"
SITE_TEMP_IMAGE="arch/warchi-site:${SITE_VERSION}-${BUILD_ID}"

build_release_image() {
  local component="$1" temporary_image="$2"
  case "${component}" in
    arepos-server)
      docker build --pull -t "${temporary_image}" "${AREPOS_REPO}"
      ;;
    warchi)
      EMPTY_CONTEXT="$(mktemp -d)"
      : >"${EMPTY_CONTEXT}/.placeholder"
      docker build --pull \
        --build-context "papirus=${EMPTY_CONTEXT}" \
        --build-arg 'VITE_API_BASE_URL=' \
        --build-arg 'VITE_NOTATION_URL=/api/v1/notation' \
        --build-arg 'VITE_SITE_URL=https://warchi.ru' \
        --build-arg 'VITE_SITE_RETURN_ORIGINS=https://warchi.ru' \
        --build-arg "APP_VERSION=${WARCHI_VERSION}" \
        -t "${temporary_image}" \
        "${WARCHI_REPO}"
      ;;
    warchi-site)
      docker build --pull \
        --build-arg 'VITE_API_BASE_URL=' \
        --build-arg 'VITE_APP_URL=https://app.warchi.ru' \
        --build-arg 'VITE_SITE_URL=https://warchi.ru' \
        -t "${temporary_image}" \
        "${SITE_REPO}"
      ;;
    *) return 1 ;;
  esac
}

tag_release_image() {
  docker tag "$1" "$2"
}

import_release_images() {
  k3d image import -c "${CLUSTER_NAME}" "$@"
}

IMAGE_RELEASE_PLAN=$(
  printf '%s\n' \
    "arepos-server|${AREPOS_TEMP_IMAGE}|${AREPOS_IMAGE}" \
    "warchi|${WARCHI_TEMP_IMAGE}|${WARCHI_IMAGE}" \
    "warchi-site|${SITE_TEMP_IMAGE}|${SITE_IMAGE}"
)
orchestrate_release_image_plan "${IMAGE_RELEASE_PLAN}"
printf 'Image plan: %s\n' "${IMAGE_PLAN_SUMMARY}"
if [[ -z "${NEW_FINAL_IMAGES}" ]]; then
  printf 'All release images verified for reuse; build and import skipped\n'
fi

yaml_quote() {
  local escaped="${1//\'/\'\'}"
  printf "'%s'" "${escaped}"
}

RUNTIME_VALUES="$(mktemp)"
chmod 600 "${RUNTIME_VALUES}"
{
  printf 'image:\n  tag: %s\n' "$(yaml_quote "${AREPOS_VERSION}")"
  printf 'postgresql:\n  auth:\n'
  printf '    password: %s\n' "$(yaml_quote "${POSTGRES_PASSWORD}")"
  printf '    postgresPassword: %s\n' "$(yaml_quote "${POSTGRES_SUPER_PASSWORD}")"
  printf 'minio:\n  auth:\n'
  printf '    accessKey: %s\n' "$(yaml_quote "${MINIO_ACCESS_KEY}")"
  printf '    secretKey: %s\n' "$(yaml_quote "${MINIO_SECRET_KEY}")"
} >"${RUNTIME_VALUES}"

HELM_MUTATION_STARTED=1
helm upgrade --install arepos-server "${AREPOS_REPO}/charts/arepos-server" \
  --namespace "${NAMESPACE}" \
  -f "${WARCHI_REPO}/infra/vps/values/arepos-server.yaml" \
  -f "${RUNTIME_VALUES}" \
  --wait --atomic --timeout 10m
kubectl rollout status deployment/arepos-server -n "${NAMESPACE}" --timeout=5m

api_version="$(
  kubectl exec -n "${NAMESPACE}" deployment/warchi -- \
    wget -qO- http://arepos-server:8080/api/v1/system/version |
    jq -r '.version'
)"
[[ "${api_version}" == "${AREPOS_VERSION}" ]] || {
  printf 'Backend version mismatch after rollout\n' >&2
  exit 1
}

printf 'Checking database migration 042\n'
migration_count="$(
  kubectl exec -n "${NAMESPACE}" deployment/arepos-server-postgresql -- \
    sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM databasechangelog WHERE id = '\''042-site-feedback-moderation'\''"' |
    tr -d '[:space:]'
)"
[[ "${migration_count}" == "1" ]] || {
  printf 'Required migration 042 is not applied\n' >&2
  exit 1
}

kubectl apply -f "${WARCHI_REPO}/infra/vps/k8s/redirect-https.yaml" >/dev/null

WARCHI_PREVIOUS_REVISION="$(
  helm history warchi -n "${NAMESPACE}" -o json |
    jq -er 'map(select(.status == "deployed")) | last | .revision'
)"
[[ "${WARCHI_PREVIOUS_REVISION}" =~ ^[0-9]+$ ]] || {
  printf 'Unable to capture current warchi Helm revision\n' >&2
  exit 1
}

kubectl apply -f "${WARCHI_REPO}/infra/vps/k8s/prestage-app-ingress.yaml" >/dev/null
kubectl apply -f "${WARCHI_REPO}/infra/vps/k8s/prestage-site-certificate.yaml" >/dev/null
for certificate in warchi-app-ru-tls warchi-site-ru-tls; do
  for _attempt in {1..60}; do
    kubectl get certificate "${certificate}" -n "${NAMESPACE}" >/dev/null 2>&1 && break
    sleep 2
  done
  kubectl wait --for=condition=Ready "certificate/${certificate}" \
    -n "${NAMESPACE}" --timeout=5m
done

WARCHI_RUNTIME_VALUES="$(mktemp)"
chmod 600 "${WARCHI_RUNTIME_VALUES}"
printf 'image:\n  tag: %s\n' "$(yaml_quote "${WARCHI_VERSION}")" >"${WARCHI_RUNTIME_VALUES}"

SITE_RUNTIME_VALUES="$(mktemp)"
chmod 600 "${SITE_RUNTIME_VALUES}"
printf 'image:\n  tag: %s\n' "$(yaml_quote "${SITE_VERSION}")" >"${SITE_RUNTIME_VALUES}"

# Start the site workload without taking ownership of warchi.ru.
helm upgrade --install warchi-site "${SITE_REPO}/charts/warchi-site" \
  --namespace "${NAMESPACE}" \
  -f "${WARCHI_REPO}/infra/vps/values/warchi-site.yaml" \
  -f "${SITE_RUNTIME_VALUES}" \
  --set ingress.enabled=false \
  --wait --atomic --timeout 10m
kubectl rollout status deployment/warchi-site -n "${NAMESPACE}" --timeout=5m
SITE_PRESTAGE_REVISION="$(
  helm history warchi-site -n "${NAMESPACE}" -o json |
    jq -er 'map(select(.status == "deployed")) | last | .revision'
)"

CUTOVER_STARTED=1
helm upgrade --install warchi "${WARCHI_REPO}/charts/warchi" \
  --namespace "${NAMESPACE}" \
  -f "${WARCHI_REPO}/infra/vps/values/warchi.yaml" \
  -f "${WARCHI_RUNTIME_VALUES}" \
  --wait --atomic --timeout 10m
kubectl rollout status deployment/warchi -n "${NAMESPACE}" --timeout=5m
kubectl wait --for=condition=Ready certificate/warchi-app-ru-tls \
  -n "${NAMESPACE}" --timeout=5m
bounded_curl --fail --silent --show-error https://app.warchi.ru/health >/dev/null
kubectl delete ingress warchi-app-tls-prestage -n "${NAMESPACE}" \
  --ignore-not-found >/dev/null

helm upgrade --install warchi-site "${SITE_REPO}/charts/warchi-site" \
  --namespace "${NAMESPACE}" \
  -f "${WARCHI_REPO}/infra/vps/values/warchi-site.yaml" \
  -f "${SITE_RUNTIME_VALUES}" \
  --wait --atomic --timeout 10m
kubectl rollout status deployment/warchi-site -n "${NAMESPACE}" --timeout=5m
kubectl wait --for=condition=Ready certificate/warchi-site-ru-tls \
  -n "${NAMESPACE}" --timeout=5m
bounded_curl --fail --silent --show-error https://warchi.ru/health >/dev/null
env \
  "NAMESPACE=${NAMESPACE}" \
  "CLUSTER_NAME=${CLUSTER_NAME}" \
  "AREPOS_VERSION=${AREPOS_VERSION}" \
  "WARCHI_VERSION=${WARCHI_VERSION}" \
  "SITE_VERSION=${SITE_VERSION}" \
  bash "${WARCHI_REPO}/infra/vps/verify.sh"
SITE_HEALTHY=1
