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

stub_bin="${TMP_DIR}/bin"
state_dir="${TMP_DIR}/state"
scenario_log="${TMP_DIR}/kubectl.log"
failure_log="${TMP_DIR}/expected-failures.log"
mkdir -p "${stub_bin}" "${state_dir}"
printf '%s\n' 'warchi-app-ru-tls' >"${state_dir}/certificates"
printf '%s\n' 'Ingress/warchi-app-tls-prestage' \
  >"${state_dir}/owner-warchi-app-ru-tls"
printf '%s\n' 'original-tls-secret' >"${state_dir}/secret-warchi-app-ru-tls"

cat >"${stub_bin}/kubectl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

printf 'kubectl %s\n' "$*" >>"${SCENARIO_LOG}"
command="${1:-}"
resource="${2:-}"
name="${3:-}"

certificate_exists() {
  grep -Fqx -- "$1" "${STATE_DIR}/certificates"
}

case "${command} ${resource}" in
  "get certificate")
    if ! certificate_exists "${name}"; then
      [[ "$*" == *"--ignore-not-found"* ]] && exit 0
      exit 1
    fi
    if [[ "$*" == *"-o json"* ]]; then
      owner_file="${STATE_DIR}/owner-${name}"
      if [[ "${FAIL_KUBECTL_ACTION:-}" == "verify" || -s "${owner_file}" ]]; then
        printf '{"metadata":{"ownerReferences":[{"kind":"Ingress","name":"warchi-app-tls-prestage"}]}}\n'
      else
        printf '{"metadata":{"ownerReferences":[]}}\n'
      fi
    elif [[ "$*" == *"-o name"* ]]; then
      printf 'certificate.cert-manager.io/%s\n' "${name}"
    fi
    ;;
  "patch certificate")
    [[ "${FAIL_KUBECTL_ACTION:-}" != "patch" ]] || exit 21
    certificate_exists "${name}" || exit 1
    [[ "$*" == *"--type=merge"* ]] || exit 2
    [[ "$*" == *'{"metadata":{"ownerReferences":[]}}'* ]] || exit 3
    : >"${STATE_DIR}/owner-${name}"
    ;;
  "apply -f")
    [[ "${FAIL_KUBECTL_ACTION:-}" != "apply" ]] || exit 22
    manifest="${3}"
    case "$(basename "${manifest}")" in
      prestage-app-certificate.yaml)
        certificate_name='warchi-app-ru-tls'
        ;;
      prestage-site-certificate.yaml)
        certificate_name='warchi-site-ru-tls'
        ;;
      prestage-app-ingress.yaml)
        exit 0
        ;;
      *)
        exit 4
        ;;
    esac
    if ! certificate_exists "${certificate_name}"; then
      printf '%s\n' "${certificate_name}" >>"${STATE_DIR}/certificates"
      : >"${STATE_DIR}/owner-${certificate_name}"
    fi
    ;;
  "wait --for=condition=Ready")
    certificate_name="${3#certificate/}"
    certificate_exists "${certificate_name}" || exit 5
    [[ ! -s "${STATE_DIR}/owner-${certificate_name}" ]] || exit 6
    ;;
  "delete ingress")
    ;;
  "delete certificate" | "delete secret")
    exit 7
    ;;
  *)
    exit 8
    ;;
esac
EOF
chmod +x "${stub_bin}/kubectl"

# shellcheck source=../helpers.sh
source "${VPS_DIR}/helpers.sh"

run_certificate_lifecycle() {
  adopt_explicit_certificate warchi-app-ru-tls \
    "${VPS_DIR}/k8s/prestage-app-certificate.yaml" arch
  adopt_explicit_certificate warchi-site-ru-tls \
    "${VPS_DIR}/k8s/prestage-site-certificate.yaml" arch
  kubectl wait --for=condition=Ready certificate/warchi-app-ru-tls -n arch --timeout=5m
  kubectl wait --for=condition=Ready certificate/warchi-site-ru-tls -n arch --timeout=5m
  kubectl apply -f "${VPS_DIR}/k8s/prestage-app-ingress.yaml"
  kubectl delete ingress warchi-app-tls-prestage -n arch --ignore-not-found
}

PATH="${stub_bin}:${PATH}" STATE_DIR="${state_dir}" SCENARIO_LOG="${scenario_log}" \
  run_certificate_lifecycle
PATH="${stub_bin}:${PATH}" STATE_DIR="${state_dir}" SCENARIO_LOG="${scenario_log}" \
  run_certificate_lifecycle

for failed_action in patch apply verify; do
  set +e
  export FAIL_KUBECTL_ACTION="${failed_action}"
  PATH="${stub_bin}:${PATH}" STATE_DIR="${state_dir}" SCENARIO_LOG="${scenario_log}" \
    adopt_explicit_certificate warchi-app-ru-tls \
    "${VPS_DIR}/k8s/prestage-app-certificate.yaml" arch 2>>"${failure_log}"
  adoption_status=$?
  unset FAIL_KUBECTL_ACTION
  set -e
  [[ "${adoption_status}" -ne 0 ]] ||
    fail "Certificate adoption did not fail closed on ${failed_action} failure"
done

[[ ! -s "${state_dir}/owner-warchi-app-ru-tls" ]] ||
  fail "app Certificate retained its ingress ownerReference"
[[ ! -s "${state_dir}/owner-warchi-site-ru-tls" ]] ||
  fail "site Certificate retained an ownerReference"
[[ "$(wc -l <"${state_dir}/certificates" | tr -d '[:space:]')" == "2" &&
  "$(sort -u "${state_dir}/certificates" | wc -l | tr -d '[:space:]')" == "2" ]] ||
  fail "idempotent adoption created duplicate Certificates"
[[ "$(cat "${state_dir}/secret-warchi-app-ru-tls")" == "original-tls-secret" ]] ||
  fail "Certificate adoption modified the existing TLS Secret"
if grep -Eq 'kubectl delete (certificate|secret)' "${scenario_log}"; then
  fail "Certificate adoption deleted a Certificate or TLS Secret"
fi

assert_line_order "${scenario_log}" \
  'kubectl patch certificate warchi-app-ru-tls' \
  'kubectl apply -f '"${VPS_DIR}"'/k8s/prestage-app-certificate.yaml'
assert_line_order "${scenario_log}" \
  'kubectl apply -f '"${VPS_DIR}"'/k8s/prestage-app-certificate.yaml' \
  'kubectl get certificate warchi-app-ru-tls -n arch -o json'
assert_line_order "${scenario_log}" \
  'kubectl get certificate warchi-app-ru-tls -n arch -o json' \
  'kubectl wait --for=condition=Ready certificate/warchi-app-ru-tls'
assert_line_order "${scenario_log}" \
  'kubectl wait --for=condition=Ready certificate/warchi-app-ru-tls' \
  'kubectl delete ingress warchi-app-tls-prestage'

printf 'PASS: explicit Certificate adoption lifecycle\n'
