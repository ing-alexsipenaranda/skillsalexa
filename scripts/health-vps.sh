#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${EVOLL_CONTAINER:-evoll-alexa-linking-1}"
failed=0
state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$CONTAINER")" || failed=1
[[ "$state" == 'running healthy' ]] || failed=1
echo "Container: $state"
curl --fail --silent --show-error --max-time 10 https://alexa.evoll.app/health || failed=1
echo
if [[ "$failed" -ne 0 ]]; then
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
    curl --fail --silent --show-error --max-time 10 -H 'Content-Type: application/json' \
      --data '{"text":"Evoll Alexa health check failed"}' "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
  exit 1
fi
