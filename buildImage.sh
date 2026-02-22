#!/bin/sh
docker build \
  --build-arg VITE_API_BASE_URL="" \
  --build-arg VITE_NOTATION_URL="/api/v1/notation" \
  -t arch/warchi:0.0.9 \
  .
