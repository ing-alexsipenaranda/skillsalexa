#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f compose.yaml -f compose.hostinger.yaml)
IMAGE="evoll-alexa-linking:local"
ROLLBACK_IMAGE="evoll-alexa-linking:rollback"

# Lock the checkout before inspecting state or touching backups/images.
exec 9>"$(git rev-parse --git-path evoll-deploy.lock)"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
[[ "$(git branch --show-current)" == 'codex/evoll-alexa' ]] || { echo 'Expected branch codex/evoll-alexa.' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Save local changes before deployment.' >&2; exit 1; }
previous_commit="$(git rev-parse HEAD)"
# An upgrade must have a recoverable image. Initial installation is separate.
docker image inspect "$IMAGE" >/dev/null
./scripts/backup-vps.sh
docker tag "$IMAGE" "$ROLLBACK_IMAGE"
git fetch origin codex/evoll-alexa
git merge-base --is-ancestor HEAD origin/codex/evoll-alexa
cutover=0
rollback() {
  local result=$?
  trap - ERR INT TERM
  echo 'Deployment failed; restoring previous checkout and image.' >&2
  # --keep refuses to overwrite edits made while deployment was running.
  if ! git reset --keep "$previous_commit"; then
    echo 'Checkout recovery blocked by concurrent edits; manual recovery required.' >&2
    exit 1
  fi
  if ! docker tag "$ROLLBACK_IMAGE" "$IMAGE"; then
    echo 'Image recovery failed; manual recovery required.' >&2
    exit 1
  fi
  if [[ "$cutover" == 1 ]]; then
    if ! "${COMPOSE[@]}" up -d --no-build --force-recreate linking; then
      echo 'Previous container could not restart; manual recovery required.' >&2
      exit 1
    fi
    if ! wait_healthy; then
      echo 'Previous version failed health checks; manual recovery required.' >&2
      exit 1
    fi
  fi
  exit "${result:-1}"
}
wait_healthy() {
  local attempt
  for attempt in {1..12}; do
    if curl --fail --silent --max-time 5 "http://127.0.0.1:${EVOLL_LOCAL_PORT:-3187}/health" >/dev/null; then
      curl --fail --silent --show-error --max-time 10 https://alexa.evoll.app/health >/dev/null && return 0
    fi
    sleep 5
  done
  return 1
}
trap rollback ERR
trap 'false' INT TERM
git merge --ff-only origin/codex/evoll-alexa
"${COMPOSE[@]}" build linking
cutover=1
"${COMPOSE[@]}" up -d --no-build --force-recreate linking
wait_healthy
trap - ERR INT TERM
echo 'Evoll Alexa updated and health verified.'
