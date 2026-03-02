#!/bin/sh
cd "$(dirname "$0")" || exit 1
VERSION=$(node -p "require('./package.json').version")
docker build \
  --build-arg APP_VERSION="${VERSION}" \
  --build-arg VITE_API_BASE_URL="" \
  --build-arg VITE_NOTATION_URL="/api/v1/notation" \
  -t "arch/warchi:${VERSION}" \
  .
