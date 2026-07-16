#!/usr/bin/env bash

# Pure, source-safe helpers shared by deployment scripts and unit-like bundle tests.

release_checkout_branch_matches() {
  local repo="$1"
  local expected_branch="$2"
  [[ "$(git -C "${repo}" branch --show-current)" == "${expected_branch}" ]]
}

normalize_dns_name() {
  local name
  name="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  printf '%s' "${name%.}"
}

dns_cname_matches() {
  local actual="$1"
  local expected="$2"
  [[ "$(normalize_dns_name "${actual}")" == "$(normalize_dns_name "${expected}")" ]]
}

dns_answers_contain_ip() {
  local answers="$1"
  local expected_ip="$2"
  local answer
  while IFS= read -r answer; do
    [[ "${answer}" == "${expected_ip}" ]] && return 0
  done <<<"${answers}"
  return 1
}

dns_exact_single_ipv4() {
  local answers="$1"
  local expected_ip="$2"
  local count=0 answer=""
  while IFS= read -r answer; do
    [[ -n "${answer}" ]] || continue
    count=$((count + 1))
    [[ "${answer}" == "${expected_ip}" ]] || return 1
  done <<<"${answers}"
  [[ "${count}" == "1" ]]
}

dns_answers_have_no_ipv6() {
  local answers="$1"
  local answer
  while IFS= read -r answer; do
    [[ "${answer}" == *:* ]] && return 1
  done <<<"${answers}"
  return 0
}

bounded_curl() {
  curl --connect-timeout "${CURL_CONNECT_TIMEOUT:-5}" \
    --max-time "${CURL_MAX_TIME:-20}" "$@"
}

wait_http_success() {
  local url="$1"
  local max_attempts="${2:-18}"
  local delay_seconds="${3:-5}"
  local attempt=1 status=""

  [[ "${max_attempts}" =~ ^[1-9][0-9]*$ && "${delay_seconds}" =~ ^[0-9]+$ ]] || {
    printf 'HTTP readiness retry settings must be finite non-negative integers\n' >&2
    return 1
  }

  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    if status="$(
      CURL_CONNECT_TIMEOUT=3 CURL_MAX_TIME=10 \
        bounded_curl --silent --output /dev/null --write-out '%{http_code}' "${url}" \
        2>/dev/null
    )"; then
      :
    else
      status="000"
    fi

    if [[ "${status}" =~ ^2[0-9][0-9]$ ]]; then
      return 0
    fi

    case "${status}" in
      000 | 404 | 408 | 425 | 429 | 500 | 502 | 503 | 504)
        ;;
      *)
        printf 'HTTP readiness failed with status %s\n' "${status:-unknown}" >&2
        return 1
        ;;
    esac

    if [[ "${attempt}" -lt "${max_attempts}" ]]; then
      printf 'HTTP readiness status %s on attempt %d/%d; retrying in %ss\n' \
        "${status}" "${attempt}" "${max_attempts}" "${delay_seconds}" >&2
      sleep "${delay_seconds}"
    fi
    attempt=$((attempt + 1))
  done

  printf 'HTTP readiness failed with status %s after %d attempts\n' \
    "${status}" "${max_attempts}" >&2
  return 1
}

cutover_readiness_required() {
  [[ "${1:-0}" != "1" ]]
}

adopt_explicit_certificate() {
  local certificate="$1"
  local manifest="$2"
  local namespace="$3"
  local existing certificate_json

  existing="$(
    kubectl get certificate "${certificate}" -n "${namespace}" \
      --ignore-not-found -o name
  )" || return 1
  if [[ -n "${existing}" ]]; then
    kubectl patch certificate "${certificate}" -n "${namespace}" \
      --type=merge -p '{"metadata":{"ownerReferences":[]}}' >/dev/null || return 1
  fi

  kubectl apply -f "${manifest}" >/dev/null || return 1
  certificate_json="$(
    kubectl get certificate "${certificate}" -n "${namespace}" -o json
  )" || return 1
  jq -e '((.metadata.ownerReferences // []) | length) == 0' \
    <<<"${certificate_json}" >/dev/null || {
    printf 'Certificate %s still has ownerReferences after adoption\n' \
      "${certificate}" >&2
    return 1
  }
}

assert_dns_configuration() {
  local target_ip="$1"
  local root_answers root_aaaa app_cname app_answers app_aaaa
  root_answers="$(dig +short A warchi.ru | awk '/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/')"
  root_aaaa="$(dig +short AAAA warchi.ru)"
  app_cname="$(dig +short CNAME app.warchi.ru)"
  app_answers="$(dig +short A app.warchi.ru | awk '/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/')"
  app_aaaa="$(dig +short AAAA app.warchi.ru | awk '/:/')"

  dns_exact_single_ipv4 "${root_answers}" "${target_ip}" || {
    printf 'warchi.ru must have exactly one A record: %s\n' "${target_ip}" >&2
    return 1
  }
  dns_answers_have_no_ipv6 "${root_aaaa}" || {
    printf 'warchi.ru must not have an AAAA record\n' >&2
    return 1
  }
  dns_cname_matches "${app_cname}" 'warchi.ru' || {
    printf 'app.warchi.ru CNAME must be exactly warchi.ru\n' >&2
    return 1
  }
  dns_exact_single_ipv4 "${app_answers}" "${target_ip}" || {
    printf 'app.warchi.ru must resolve to exactly %s\n' "${target_ip}" >&2
    return 1
  }
  dns_answers_have_no_ipv6 "${app_aaaa}" || {
    printf 'app.warchi.ru must not resolve to an AAAA record\n' >&2
    return 1
  }
}

is_k3d_workload_node_name() {
  local node_name="$1"
  local cluster_name="$2"
  [[ "${node_name}" =~ ^k3d-${cluster_name}-(server|agent)-[0-9]+$ ]]
}

backup_release_required() {
  case "$1" in
    arepos-server | warchi) return 0 ;;
    *) return 1 ;;
  esac
}

constant_string_equal() {
  local left="$1"
  local right="$2"
  local mismatch=0 index max_length
  max_length=${#left}
  [[ ${#right} -gt ${max_length} ]] && max_length=${#right}
  [[ ${#left} -eq ${#right} ]] || mismatch=1
  index=0
  while [[ ${index} -lt ${max_length} ]]; do
    [[ "${left:${index}:1}" == "${right:${index}:1}" ]] || mismatch=1
    index=$((index + 1))
  done
  [[ "${mismatch}" == "0" ]]
}

auth_secret_action() {
  local exists="$1"
  local actual_jwt="$2"
  local actual_admin="$3"
  local expected_jwt="$4"
  local expected_admin="$5"
  if [[ "${exists}" == "0" ]]; then
    printf 'create'
    return 0
  fi
  constant_string_equal "${actual_jwt}" "${expected_jwt}" &&
    constant_string_equal "${actual_admin}" "${expected_admin}" || return 1
  printf 'match'
}

image_digest_records_match() {
  local local_digest="$1"
  local records="$2"
  local record node target_digest config_digest extra
  local unanimous_target="" unanimous_config="" seen_nodes=""
  local count=0
  is_sha256_digest "${local_digest}" || return 1
  while IFS= read -r record; do
    [[ -n "${record}" ]] || continue
    IFS='|' read -r node target_digest config_digest extra <<<"${record}"
    [[ -n "${node}" && -n "${target_digest}" && -n "${config_digest}" &&
      -z "${extra}" ]] || return 1
    is_sha256_digest "${target_digest}" && is_sha256_digest "${config_digest}" ||
      return 1
    grep -Fqx -- "${node}" <<<"${seen_nodes}" && return 1
    seen_nodes="${seen_nodes}${seen_nodes:+$'\n'}${node}"
    if [[ "${count}" == "0" ]]; then
      unanimous_target="${target_digest}"
      unanimous_config="${config_digest}"
    else
      constant_string_equal "${target_digest}" "${unanimous_target}" &&
        constant_string_equal "${config_digest}" "${unanimous_config}" || return 1
    fi
    count=$((count + 1))
  done <<<"${records}"
  [[ "${count}" -gt 0 ]] || return 1
  constant_string_equal "${local_digest}" "${unanimous_target}" ||
    constant_string_equal "${local_digest}" "${unanimous_config}"
}

is_sha256_digest() {
  [[ "$1" =~ ^sha256:[[:xdigit:]]{64}$ ]]
}

node_image_target_digest() {
  local node="$1"
  local image_ref="$2"
  local listing line listed_ref field target_digest=""
  local row_count=0 digest_count
  local -a fields=()

  listing="$(docker exec "${node}" ctr -n k8s.io images list)" || return 1
  while IFS= read -r line; do
    read -r listed_ref _ <<<"${line}"
    [[ "${listed_ref}" == "${image_ref}" ]] || continue
    row_count=$((row_count + 1))
    digest_count=0
    read -ra fields <<<"${line}"
    for field in "${fields[@]}"; do
      is_sha256_digest "${field}" || continue
      target_digest="${field}"
      digest_count=$((digest_count + 1))
    done
    [[ "${digest_count}" == "1" ]] || return 1
  done <<<"${listing}"

  [[ "${row_count}" == "1" ]] || return 1
  is_sha256_digest "${target_digest}" || return 1
  printf '%s' "${target_digest}"
}

node_image_config_digest_for_target() {
  local node="$1"
  local target_digest="$2"
  local target_json media_type manifest_digest manifest_json config_digest

  is_sha256_digest "${target_digest}" || return 1
  target_json="$(
    docker exec "${node}" ctr -n k8s.io content get "${target_digest}"
  )" || return 1
  media_type="$(jq -er '.mediaType | select(type == "string")' <<<"${target_json}")" ||
    return 1

  case "${media_type}" in
    application/vnd.oci.image.index.v1+json | \
      application/vnd.docker.distribution.manifest.list.v2+json)
      manifest_digest="$(
        jq -er '
          [.manifests[]
            | select(
                (.mediaType == "application/vnd.oci.image.manifest.v1+json"
                  or .mediaType == "application/vnd.docker.distribution.manifest.v2+json")
                and .platform.os == "linux"
                and .platform.architecture == "amd64"
                and ((.annotations // {})["vnd.docker.reference.type"] // "")
                  != "attestation-manifest"
                and (.artifactType // "") == ""
              )
            | .digest
            | select(type == "string")]
          | if length == 1 then .[0] else error("expected exactly one linux/amd64 manifest") end
        ' <<<"${target_json}"
      )" || return 1
      ;;
    application/vnd.oci.image.manifest.v1+json | \
      application/vnd.docker.distribution.manifest.v2+json)
      manifest_digest="${target_digest}"
      ;;
    *)
      return 1
      ;;
  esac
  is_sha256_digest "${manifest_digest}" || return 1

  manifest_json="$(
    docker exec "${node}" ctr -n k8s.io content get "${manifest_digest}"
  )" || return 1
  config_digest="$(jq -er '.config.digest | select(type == "string")' <<<"${manifest_json}")" ||
    return 1
  is_sha256_digest "${config_digest}" || return 1
  printf '%s' "${config_digest}"
}

node_image_config_digest() {
  local node="$1"
  local image_ref="$2"
  local target_digest
  target_digest="$(node_image_target_digest "${node}" "${image_ref}")" || return 1
  node_image_config_digest_for_target "${node}" "${target_digest}"
}

node_image_digest_pair() {
  local node="$1"
  local image_ref="$2"
  local target_digest config_digest
  target_digest="$(node_image_target_digest "${node}" "${image_ref}")" || return 1
  config_digest="$(node_image_config_digest_for_target "${node}" "${target_digest}")" ||
    return 1
  printf '%s|%s' "${target_digest}" "${config_digest}"
}

image_cluster_digest_records() {
  local image="$1"
  local cluster_name="$2"
  local nodes node images listed_image candidate pair target_digest config_digest
  local unanimous_target="" unanimous_config=""
  local seen_nodes="" records="" node_count=0 candidate_count

  nodes="$(list_all_k3d_cluster_nodes "${cluster_name}")" || return 1
  while IFS= read -r node; do
    [[ -n "${node}" ]] || continue
    is_k3d_workload_node_name "${node}" "${cluster_name}" || continue
    grep -Fqx -- "${node}" <<<"${seen_nodes}" && return 1
    seen_nodes="${seen_nodes}${seen_nodes:+$'\n'}${node}"
    node_count=$((node_count + 1))
    images="$(list_node_images "${node}")" || return 1
    candidate=""
    candidate_count=0
    while IFS= read -r listed_image; do
      if [[ "${listed_image}" == "${image}" || "${listed_image}" == */"${image}" ]]; then
        candidate="${listed_image}"
        candidate_count=$((candidate_count + 1))
      fi
    done <<<"${images}"
    [[ "${candidate_count}" == "1" ]] || return 1
    pair="$(node_image_digest_pair "${node}" "${candidate}")" || return 1
    IFS='|' read -r target_digest config_digest <<<"${pair}"
    is_sha256_digest "${target_digest}" && is_sha256_digest "${config_digest}" ||
      return 1
    if [[ "${node_count}" == "1" ]]; then
      unanimous_target="${target_digest}"
      unanimous_config="${config_digest}"
    else
      constant_string_equal "${target_digest}" "${unanimous_target}" &&
        constant_string_equal "${config_digest}" "${unanimous_config}" || return 1
    fi
    records="${records}${records:+$'\n'}${node}|${pair}"
  done <<<"${nodes}"

  [[ "${node_count}" -gt 0 ]] || return 1
  printf '%s' "${records}"
}

release_image_action() {
  local reuse="$1"
  local local_present="$2"
  local node_count="$3"
  local nodes_with_image="$4"
  local digests_match="$5"

  if [[ "${reuse}" == "0" ]]; then
    [[ "${local_present}" == "0" && "${nodes_with_image}" == "0" ]] || return 1
    printf 'build'
    return 0
  fi

  if [[ "${local_present}" == "0" && "${nodes_with_image}" == "0" ]]; then
    printf 'build'
    return 0
  fi

  [[ "${local_present}" == "1" &&
    "${node_count}" -gt 0 &&
    "${nodes_with_image}" == "${node_count}" &&
    "${digests_match}" == "1" ]] || return 1
  printf 'reuse'
}

image_cluster_presence_counts() {
  local image="$1"
  local cluster_name="$2"
  local nodes node images candidate
  local node_count=0 nodes_with_image=0 node_has_image

  nodes="$(list_all_k3d_cluster_nodes "${cluster_name}")" || return 1
  while IFS= read -r node; do
    [[ -n "${node}" ]] || continue
    is_k3d_workload_node_name "${node}" "${cluster_name}" || continue
    node_count=$((node_count + 1))
    images="$(list_node_images "${node}")" || return 1
    node_has_image=0
    while IFS= read -r candidate; do
      if [[ "${candidate}" == "${image}" || "${candidate}" == */"${image}" ]]; then
        node_has_image=1
        break
      fi
    done <<<"${images}"
    nodes_with_image=$((nodes_with_image + node_has_image))
  done <<<"${nodes}"

  printf '%s %s' "${node_count}" "${nodes_with_image}"
}

orchestrate_release_image_plan() {
  local plan="$1"
  local resolved_plan=""
  local component temporary_image final_image action record
  local -a new_final_image_args=()
  IMAGE_PLAN_SUMMARY=""

  while IFS= read -r record; do
    [[ -n "${record}" ]] || continue
    IFS='|' read -r component temporary_image final_image <<<"${record}"
    action="$(decide_release_image_action "${final_image}")" || return 1
    [[ "${action}" == "reuse" || "${action}" == "build" ]] || return 1
    IMAGE_PLAN_SUMMARY="${IMAGE_PLAN_SUMMARY}${IMAGE_PLAN_SUMMARY:+ }${component}=${action}"
    resolved_plan="${resolved_plan}${resolved_plan:+$'\n'}${component}|${action}|${temporary_image}|${final_image}"
  done <<<"${plan}"

  while IFS='|' read -r component action temporary_image final_image; do
    [[ -n "${component}" && "${action}" == "build" ]] || continue
    TEMP_IMAGES="${TEMP_IMAGES}${TEMP_IMAGES:+$'\n'}${temporary_image}"
    build_release_image "${component}" "${temporary_image}" || return 1
  done <<<"${resolved_plan}"

  while IFS='|' read -r component action temporary_image final_image; do
    [[ -n "${component}" && "${action}" == "build" ]] || continue
    tag_release_image "${temporary_image}" "${final_image}" || return 1
    NEW_FINAL_IMAGES="${NEW_FINAL_IMAGES}${NEW_FINAL_IMAGES:+$'\n'}${final_image}"
    new_final_image_args+=("${final_image}")
  done <<<"${resolved_plan}"

  if [[ "${#new_final_image_args[@]}" -gt 0 ]]; then
    import_release_images "${new_final_image_args[@]}" || return 1
  fi
}

rollback_cutover_if_needed() {
  local status="$1" cutover="$2" site_healthy="$3"
  local warchi_revision="$4" site_revision="$5" namespace="$6"
  [[ "${status}" -ne 0 && "${cutover}" == "1" && "${site_healthy}" != "1" ]] ||
    return 0
  if [[ -n "${site_revision}" ]]; then
    helm rollback warchi-site "${site_revision}" -n "${namespace}" --wait --timeout 10m
  fi
  if [[ -n "${warchi_revision}" ]]; then
    helm rollback warchi "${warchi_revision}" -n "${namespace}" --wait --timeout 10m
  fi
}

cleanup_image_tag_lists() {
  local helm_started="$1" temporary_images="$2" final_images="$3"
  local image
  while IFS= read -r image; do
    [[ -n "${image}" ]] && remove_local_image_tag "${image}"
  done <<<"${temporary_images}"
  [[ "${helm_started}" == "0" ]] || return 0
  while IFS= read -r image; do
    [[ -n "${image}" ]] || continue
    remove_cluster_image_tag "${image}"
    remove_local_image_tag "${image}"
  done <<<"${final_images}"
}

restore_replicas_if_needed() {
  local needed="$1" replicas="$2" namespace="$3"
  [[ "${needed}" == "1" ]] || return 0
  scale_deployment arepos-server "${replicas}" "${namespace}"
  wait_deployment_rollout arepos-server "${namespace}"
}

extract_nginx_location_block() {
  local config="$1"
  printf '%s\n' "${config}" | awk '
    function open_braces(line, copy) {
      copy = line
      return gsub(/\{/, "", copy)
    }
    function close_braces(line, copy) {
      copy = line
      return gsub(/\}/, "", copy)
    }
    /^[[:space:]]*location[[:space:]]+\^~[[:space:]]+\/ws[[:space:]]*\{/ {
      if (!active) {
        active = 1
        found = 1
      }
    }
    active {
      print
      depth += open_braces($0) - close_braces($0)
      if (depth == 0) {
        complete = 1
        exit
      }
    }
    END {
      if (!found || !complete) {
        exit 1
      }
    }
  '
}

nginx_ws_block_is_valid() {
  local block
  block="$(extract_nginx_location_block "$1")" || return 1
  grep -Eq '^[[:space:]]*location[[:space:]]+\^~[[:space:]]+/ws[[:space:]]*\{' \
    <<<"${block}" &&
    grep -Eq '^[[:space:]]*proxy_pass[[:space:]]+http://arepos-server\.arch\.svc\.cluster\.local:8080;[[:space:]]*$' \
      <<<"${block}"
}
