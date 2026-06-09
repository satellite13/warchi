#!/bin/sh
#
# buildImage.sh — сборка production Docker-образа фронтенда wArchi.
# Читает версию из package.json и собирает образ arch/warchi:<version>
# с нужными build-arg для Vite (API URL, notation endpoint, APP_VERSION).
# Вызывается из deploy.sh или может использоваться отдельно перед ручным push.
#
# Использование:
#   ./scripts/buildImage.sh
#
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT" || exit 1
node scripts/sync-chart-version.mjs
VERSION=$(node -p "require('./package.json').version")
docker build \
  --build-arg APP_VERSION="${VERSION}" \
  --build-arg VITE_API_BASE_URL="" \
  --build-arg VITE_NOTATION_URL="/api/v1/notation" \
  -t "arch/warchi:${VERSION}" \
  .
