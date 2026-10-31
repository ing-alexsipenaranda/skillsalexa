#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${EVOLL_CONTAINER:-evoll-alexa-linking-1}"
docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$CONTAINER"
curl --fail --silent --show-error --max-time 10 https://alexa.evoll.app/health
echo
