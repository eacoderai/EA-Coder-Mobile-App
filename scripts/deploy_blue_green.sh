#!/usr/bin/env bash
set -euo pipefail

APP_NAME=${1:?app name}
NAMESPACE=${2:?namespace}
COLOR=${3:?color}
IMAGE=${4:?image}

export APP_NAME COLOR IMAGE

echo "Applying deployment for ${APP_NAME}-${COLOR} with image ${IMAGE}"

MANIFEST_DIR="deploy/k8s/templates"

# Render and apply Deployment
envsubst < "$MANIFEST_DIR/deployment.yaml" | kubectl -n "$NAMESPACE" apply -f -

# Ensure Service exists (selector will be patched during cutover)
if ! kubectl -n "$NAMESPACE" get svc "$APP_NAME" >/dev/null 2>&1; then
  echo "Service $APP_NAME not found, creating"
  envsubst < "$MANIFEST_DIR/service.yaml" | kubectl -n "$NAMESPACE" apply -f -
fi