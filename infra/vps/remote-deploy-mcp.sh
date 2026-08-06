#!/usr/bin/env bash
#
# Remote side of MCP-only production deploy (run on VPS).
#
set -euo pipefail

umask 077
readonly REMOTE_ROOT="/opt/warchi-deploy"
readonly NAMESPACE="arch"
readonly CLUSTER_NAME="warchi"
MCP_VERSION="${MCP_VERSION:-0.1.1}"
REUSE_EXISTING_IMAGES="${REUSE_EXISTING_IMAGES:-0}"
SRC_ROOT="${REMOTE_ROOT}/src"
WARCHI_REPO="${SRC_ROOT}/warchi"
MCP_REPO="${SRC_ROOT}/warchi-mcp"
# shellcheck source=helpers.sh
source "${WARCHI_REPO}/infra/vps/helpers.sh"

TEMP_IMAGES=""
NEW_FINAL_IMAGES=""
IMAGE_PLAN_SUMMARY=""

secure_remove() {
  local path="$1"
  [[ -e "${path}" ]] || return 0
  if [[ -f "${path}" ]]; then
    shred -u "${path}"
  else
    rm -rf "${path}"
  fi
}

cleanup() {
  local image
  while IFS= read -r image; do
    [[ -n "${image}" ]] || continue
    docker image rm -f "${image}" >/dev/null 2>&1 || true
  done <<<"${TEMP_IMAGES}"
}
trap cleanup EXIT

export KUBECONFIG
KUBECONFIG="$(k3d kubeconfig write "${CLUSTER_NAME}")"

MCP_IMAGE="arch/warchi-mcp:${MCP_VERSION}"
BUILD_ID="vps-build-$(date -u +%Y%m%dT%H%M%SZ)-$$"
MCP_TEMP_IMAGE="arch/warchi-mcp:${MCP_VERSION}-${BUILD_ID}"

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

build_release_image() {
  local component="$1" temporary_image="$2"
  case "${component}" in
    warchi-mcp)
      docker build --pull -t "${temporary_image}" "${MCP_REPO}"
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
  printf '%s\n' "warchi-mcp|${MCP_TEMP_IMAGE}|${MCP_IMAGE}"
)
orchestrate_release_image_plan "${IMAGE_RELEASE_PLAN}"
printf 'Image plan: %s\n' "${IMAGE_PLAN_SUMMARY}"
if [[ -z "${NEW_FINAL_IMAGES}" ]]; then
  printf 'MCP release image verified for reuse; build and import skipped\n'
fi

kubectl apply -f "${WARCHI_REPO}/infra/vps/k8s/redirect-https.yaml" >/dev/null

adopt_explicit_certificate warchi-mcp-ru-tls \
  "${WARCHI_REPO}/infra/vps/k8s/mcp-certificate.yaml" "${NAMESPACE}"
for _attempt in {1..60}; do
  kubectl get certificate warchi-mcp-ru-tls -n "${NAMESPACE}" >/dev/null 2>&1 && break
  sleep 2
done
kubectl wait --for=condition=Ready certificate/warchi-mcp-ru-tls \
  -n "${NAMESPACE}" --timeout=5m

RUNTIME_VALUES="$(mktemp)"
chmod 600 "${RUNTIME_VALUES}"
printf 'image:\n  tag: "%s"\n' "${MCP_VERSION}" >"${RUNTIME_VALUES}"

helm upgrade --install warchi-mcp "${MCP_REPO}/charts/warchi-mcp" \
  --namespace "${NAMESPACE}" \
  -f "${WARCHI_REPO}/infra/vps/values/warchi-mcp.yaml" \
  -f "${RUNTIME_VALUES}" \
  --wait --atomic --timeout 10m
secure_remove "${RUNTIME_VALUES}"

kubectl rollout status deployment/warchi-mcp -n "${NAMESPACE}" --timeout=5m

image="$(
  kubectl get deployment warchi-mcp -n "${NAMESPACE}" \
    -o jsonpath='{.spec.template.spec.containers[0].image}'
)"
[[ "${image}" == "${MCP_IMAGE}" ]] || {
  printf 'Unexpected MCP image: %s (expected %s)\n' "${image}" "${MCP_IMAGE}" >&2
  exit 1
}

wait_http_success https://mcp.warchi.ru/actuator/health

# /mcp without a proper Streamable HTTP session should not be SPA HTML.
mcp_status="$(
  CURL_CONNECT_TIMEOUT=3 CURL_MAX_TIME=10 \
    bounded_curl --silent --output /dev/null --write-out '%{http_code}' \
    https://mcp.warchi.ru/mcp || true
)"
[[ "${mcp_status}" =~ ^[45][0-9][0-9]$ ]] || {
  printf 'Unexpected /mcp status: %s (expected 4xx/5xx from MCP server)\n' \
    "${mcp_status:-unknown}" >&2
  exit 1
}

printf 'MCP production deploy OK: https://mcp.warchi.ru/mcp (image %s)\n' "${MCP_IMAGE}"
