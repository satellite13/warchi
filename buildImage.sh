#!/bin/bash

set -e
cd "$(dirname "$0")" || exit 1

BASE_VERSION=$(node -p "require('./package.json').version")
REGISTRY="${REGISTRY:-art.lmru.tech}"
REPO="${REGISTRY}/arch/warchi"

# ENV_TYPE: prod | preprod | auto (по умолчанию prod)
# prod:     чистая версия (0.6.3)
# preprod:  версия с суффиксом (0.6.3-deploy-20260622170236)
ENV_TYPE="${ENV_TYPE:-auto}"
DEPLOY_SUFFIX="${DEPLOY_SUFFIX:-}"

if [ -n "${IMAGE_TAG:-}" ]; then
    # IMAGE_TAG already set — use as is
    :
elif [ "$ENV_TYPE" = "prod" ]; then
    IMAGE_TAG="$BASE_VERSION"
elif [ "$ENV_TYPE" = "preprod" ]; then
    if [ -z "$DEPLOY_SUFFIX" ]; then
        DEPLOY_SUFFIX="deploy-$(date +%Y%m%d%H%M%S)"
    fi
    IMAGE_TAG="${BASE_VERSION}-${DEPLOY_SUFFIX}"
else
    # auto — default prod
    IMAGE_TAG="$BASE_VERSION"
fi

echo "[build] Registry: ${REPO}"
echo "[build] Tag:      ${IMAGE_TAG}"
echo ""

docker build \
  --build-arg APP_VERSION="${IMAGE_TAG}" \
  --build-arg VITE_API_BASE_URL="" \
  --build-arg VITE_NOTATION_URL="/api/v1/notation" \
  --build-arg VITE_MODEL_LIVE_SYNC_MODE="hybrid" \
  --build-arg VITE_MODEL_LIVE_POLL_MS="15000" \
  -t "${REPO}:${IMAGE_TAG}" \
  .

echo ""
echo "[build] Image built: ${REPO}:${IMAGE_TAG}"
# Print tag on last line for parsing by deploy.sh
echo "${IMAGE_TAG}"
