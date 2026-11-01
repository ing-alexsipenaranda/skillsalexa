#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f compose.yaml -f compose.hostinger.yaml)
SERVICE="linking"
IMAGE="evoll-alexa-linking:local"
ROLLBACK_IMAGE="evoll-alexa-linking:rollback"

echo "Creating a broker database backup..."
./scripts/backup-vps.sh

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker tag "$IMAGE" "$ROLLBACK_IMAGE"
fi

previous_commit="$(git rev-parse HEAD)"
git fetch origin codex/evoll-alexa
git merge --ff-only origin/codex/evoll-alexa

rollback() {
  echo "Deployment failed; restoring the previous image and checkout." >&2
  git reset --hard "$previous_commit" >/dev/null
  if docker image inspect "$ROLLBACK_IMAGE" >/dev/null 2>&1; then
    docker tag "$ROLLBACK_IMAGE" "$IMAGE"
    "${COMPOSE[@]}" up -d --no-build --force-recreate "$SERVICE"
  fi
}
trap rollback ERR

"${COMPOSE[@]}" build "$SERVICE"
"${COMPOSE[@]}" up -d --no-build --force-recreate "$SERVICE"

for _ in {1..12}; do
  if curl --fail --silent --max-time 5 http://127.0.0.1:3187/health >/dev/null; then
    break
  fi
  sleep 5
done
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3187/health >/dev/null
curl --fail --silent --show-error --max-time 10 https://alexa.evoll.app/health >/dev/null
trap - ERR
echo "Evoll Alexa updated successfully. Other Compose services were not changed."
