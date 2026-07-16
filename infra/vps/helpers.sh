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
  local expected="$1"
  local records="$2"
  local record digest count=0
  while IFS= read -r record; do
    [[ -n "${record}" ]] || continue
    digest="${record#*=}"
    [[ "${digest}" != "${record}" ]] || return 1
    constant_string_equal "${digest}" "${expected}" || return 1
    count=$((count + 1))
  done <<<"${records}"
  [[ "${count}" -gt 0 ]]
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
