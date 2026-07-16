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
# VITE_SITE_URL redirects an unauthenticated visit to `/` to the marketing site.
# Keep it empty in the cluster: only VITE_SITE_RETURN_ORIGINS is needed to accept a
# safe return URL from warchi-site after sign-in.
VITE_SITE_URL="${VITE_SITE_URL:-}"
VITE_SITE_RETURN_ORIGINS="${VITE_SITE_RETURN_ORIGINS:-http://warchi-site.arch.svc.cluster.local,https://warchi-site.arch.svc.cluster.local,http://warchi.arch.svc.cluster.local,https://warchi.arch.svc.cluster.local}"

PAPIRUS_DEP=$(node -p "require('./package.json').dependencies['@ngroznykh/papirus'] || ''")
PAPIRUS_CONTEXT=""
case "$PAPIRUS_DEP" in
  file:*)
    PAPIRUS_REL=${PAPIRUS_DEP#file:}
    PAPIRUS_CONTEXT=$(CDPATH= cd -- "$REPO_ROOT/$PAPIRUS_REL" && pwd) || {
      echo "Local papirus not found at $REPO_ROOT/$PAPIRUS_REL" >&2
      exit 1
    }
    ;;
  *)
    if [ -d "$REPO_ROOT/../papirus" ]; then
      PAPIRUS_CONTEXT=$(CDPATH= cd -- "$REPO_ROOT/../papirus" && pwd)
    else
      PAPIRUS_CONTEXT=$(mktemp -d)
    fi
    ;;
esac

docker build \
  --build-context "papirus=${PAPIRUS_CONTEXT}" \
  --build-arg APP_VERSION="${VERSION}" \
  --build-arg VITE_API_BASE_URL="" \
  --build-arg VITE_NOTATION_URL="/api/v1/notation" \
  --build-arg "VITE_SITE_URL=${VITE_SITE_URL}" \
  --build-arg "VITE_SITE_RETURN_ORIGINS=${VITE_SITE_RETURN_ORIGINS}" \
  -t "arch/warchi:${VERSION}" \
  .
