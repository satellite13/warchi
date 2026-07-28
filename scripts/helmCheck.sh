#!/bin/sh
#
# helmCheck.sh — проверка Helm-чарта wArchi перед деплоем.
# Запускает helm lint, dry-run template через kubectl и dry-run install,
# чтобы отловить ошибки в манифестах до реального развёртывания.
#
# Использование:
#   ./scripts/helmCheck.sh
#
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT/charts" || exit 1
helm lint ./warchi && \
  helm template ./warchi --values warchi/values.yaml | kubectl apply --dry-run=client -f - && \
  helm install warchi-0.0.23 ./warchi --dry-run=client -n arch --debug --values warchi/values.yaml
