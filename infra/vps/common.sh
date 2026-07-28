#!/usr/bin/env bash

COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=helpers.sh
source "${COMMON_DIR}/helpers.sh"

readonly VPS_HOST="138.124.14.246"
readonly VPS_USER="root"
readonly VPS_FINGERPRINT="SHA256:5Cd7rCnHE8YjAIc7SuILJy6IfZNygAUmzw5Xkpn8VAA"
readonly REMOTE_ROOT="/opt/warchi-deploy"
readonly NAMESPACE="arch"
readonly CLUSTER_NAME="warchi"
KNOWN_HOSTS_FILE=""
SSH_OPTIONS=()

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "$1" >&2
    return 1
  }
}

prepare_known_hosts() {
  local scanned_fingerprint

  KNOWN_HOSTS_FILE="$(mktemp)"
  chmod 600 "${KNOWN_HOSTS_FILE}"
  if ! ssh-keyscan -T 10 -t ed25519 "${VPS_HOST}" >"${KNOWN_HOSTS_FILE}" 2>/dev/null; then
    printf 'Unable to scan the VPS SSH host key\n' >&2
    return 1
  fi

  scanned_fingerprint="$(ssh-keygen -lf "${KNOWN_HOSTS_FILE}" -E sha256 | awk 'NR == 1 { print $2 }')"
  if [[ "${scanned_fingerprint}" != "${VPS_FINGERPRINT}" ]]; then
    printf 'VPS SSH fingerprint mismatch: expected %s, received %s\n' \
      "${VPS_FINGERPRINT}" "${scanned_fingerprint:-none}" >&2
    return 1
  fi

  SSH_OPTIONS=(
    -o BatchMode=yes
    -o ConnectTimeout=15
    -o StrictHostKeyChecking=yes
    -o "UserKnownHostsFile=${KNOWN_HOSTS_FILE}"
  )
}

cleanup_known_hosts() {
  if [[ -n "${KNOWN_HOSTS_FILE}" && -f "${KNOWN_HOSTS_FILE}" ]]; then
    rm -f "${KNOWN_HOSTS_FILE}"
  fi
}

run_ssh() {
  local argument quoted
  local remote_command=""
  for argument in "$@"; do
    printf -v quoted '%q' "${argument}"
    remote_command="${remote_command}${remote_command:+ }${quoted}"
  done
  ssh "${SSH_OPTIONS[@]}" "${VPS_USER}@${VPS_HOST}" "${remote_command}"
}
