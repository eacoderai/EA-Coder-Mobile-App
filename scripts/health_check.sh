#!/usr/bin/env bash
set -euo pipefail

URLS_CSV=${1:-}
if [ -z "$URLS_CSV" ]; then
  echo "No HEALTHCHECK_URLS provided"
  exit 1
fi

IFS=',' read -r -a URLS <<< "$URLS_CSV"
FAILED=0
for URL in "${URLS[@]}"; do
  echo "Checking $URL"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL") || STATUS=000
  echo "Status $STATUS for $URL"
  if [[ "$STATUS" -lt 200 || "$STATUS" -ge 400 ]]; then
    FAILED=1
    echo "Health check failed for $URL"
  fi
done

exit $FAILED