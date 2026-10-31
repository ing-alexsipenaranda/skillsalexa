#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${EVOLL_CONTAINER:-evoll-alexa-linking-1}"
DESTINATION="${EVOLL_BACKUP_DIR:-/opt/evoll-alexa-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
IN_CONTAINER="/data/backups/evoll-alexa-${STAMP}.sqlite"

mkdir -p "$DESTINATION"
chmod 700 "$DESTINATION"
docker exec "$CONTAINER" node broker/backup.js "$IN_CONTAINER" >/dev/null
docker cp "$CONTAINER:$IN_CONTAINER" "$DESTINATION/evoll-alexa-${STAMP}.sqlite" >/dev/null
docker exec "$CONTAINER" rm -f "$IN_CONTAINER"
chmod 600 "$DESTINATION/evoll-alexa-${STAMP}.sqlite"
find "$DESTINATION" -type f -name 'evoll-alexa-*.sqlite' -mtime +14 -delete
echo "$DESTINATION/evoll-alexa-${STAMP}.sqlite"
