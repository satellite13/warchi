#!/usr/bin/env bash
# Проверка kubectl перед деплоем: не OrbStack + подтверждение целевого кластера.
#
# assert_not_orbstack              — запрет контекста / kubeconfig OrbStack
# confirm_kubectl_deploy_target    — показать context / API / namespace и спросить [y/N]
#
# Переменные окружения:
#   ALLOW_ORBSTACK=1               — не проверять OrbStack (не рекомендуется)
#   SKIP_KUBECTL_DEPLOY_CONFIRM=1  — не спрашивать подтверждение (CI, скрипты)
#   CI=true                        — то же, что SKIP_KUBECTL_DEPLOY_CONFIRM
# После успешного ответа выставляется KUBECTL_DEPLOY_CONFIRMED=1 (дочерние процессы не спрашивают снова)

_guard_orbstack_skip() {
  [ "${ALLOW_ORBSTACK:-}" = "true" ] || [ "${ALLOW_ORBSTACK:-}" = "1" ]
}

assert_not_orbstack() {
  local red='\033[0;31m'
  local nc='\033[0m'

  _guard_orbstack_skip && return 0

  if printf '%s' "${KUBECONFIG:-}" | grep -qi orbstack; then
    echo -e "${red}[ERROR]${nc} KUBECONFIG указывает на путь с OrbStack. Для деплоя в YC переключите kubeconfig на кластер Yandex Cloud или задайте ALLOW_ORBSTACK=1." >&2
    exit 1
  fi

  if command -v kubectl >/dev/null 2>&1; then
    local kctx
    kctx=$(kubectl config current-context 2>/dev/null || echo "")
    if [ -n "$kctx" ] && printf '%s' "$kctx" | grep -qi orbstack; then
      echo -e "${red}[ERROR]${nc} Активен kubectl context OrbStack («${kctx}»). Переключите контекст: kubectl config use-context <yc-context> (или другой не-OrbStack)." >&2
      exit 1
    fi

    local kserver
    kserver=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null || echo "")
    if [ -n "$kserver" ] && printf '%s' "$kserver" | grep -qi orbstack; then
      echo -e "${red}[ERROR]${nc} API-сервер текущего kubectl context похож на OrbStack (${kserver}). Переключите контекст на кластер Yandex Cloud." >&2
      exit 1
    fi
  fi
}

confirm_kubectl_deploy_target() {
  local yellow='\033[1;33m'
  local green='\033[0;32m'
  local red='\033[0;31m'
  local nc='\033[0m'
  local ns="${1:-${NAMESPACE:-arch}}"

  if [ "${KUBECTL_DEPLOY_CONFIRMED:-}" = "1" ]; then
    return 0
  fi

  if [ "${SKIP_KUBECTL_DEPLOY_CONFIRM:-}" = "1" ] || [ "${CI:-}" = "true" ]; then
    echo -e "${green}[INFO]${nc} Подтверждение целевого кластера пропущено (SKIP_KUBECTL_DEPLOY_CONFIRM или CI=true)." >&2
    return 0
  fi

  if ! command -v kubectl >/dev/null 2>&1; then
    echo -e "${red}[ERROR]${nc} kubectl не найден; не удалось показать цель деплоя." >&2
    exit 1
  fi

  local kctx kserver
  kctx=$(kubectl config current-context 2>/dev/null || echo "(нет текущего context)")
  kserver=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null || echo "(не удалось прочитать API URL)")

  echo "" >&2
  echo -e "${yellow}────────────────────────────────────────${nc}" >&2
  echo -e "${yellow}Цель деплоя (текущий kubectl):${nc}" >&2
  echo "  context:    $kctx" >&2
  echo "  API:        $kserver" >&2
  echo "  namespace:  $ns" >&2
  echo -e "${yellow}────────────────────────────────────────${nc}" >&2
  echo -n "Продолжить деплой в этот кластер? [y/N] " >&2

  if [ ! -t 0 ]; then
    echo "" >&2
    echo -e "${red}[ERROR]${nc} Нет интерактивного ввода. Укажите SKIP_KUBECTL_DEPLOY_CONFIRM=1 или запустите из терминала." >&2
    exit 1
  fi

  local reply
  IFS= read -r reply || true
  case "$reply" in
    y | Y | yes | YES | да | ДА)
      export KUBECTL_DEPLOY_CONFIRMED=1
      return 0
      ;;
    *)
      echo "Отменено." >&2
      exit 1
      ;;
  esac
}
