#!/usr/bin/env bash
set -euo pipefail

APP_NAME=${1:?app name}
NAMESPACE=${2:?namespace}
CURRENT=${3:?current color}
NEXT=${4:?next color}

echo "Rolling back service to $CURRENT and deleting $APP_NAME-$NEXT"
kubectl -n "$NAMESPACE" patch svc "$APP_NAME" -p "{\"spec\":{\"selector\":{\"app\":\"$APP_NAME\",\"version\":\"$CURRENT\"}}}"
kubectl -n "$NAMESPACE" delete deploy "$APP_NAME-$NEXT" --ignore-not-found