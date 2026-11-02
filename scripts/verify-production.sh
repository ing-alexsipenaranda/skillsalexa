#!/usr/bin/env bash
set -euo pipefail

BROKER_ORIGIN="${BROKER_ORIGIN:-https://alexa.evoll.app}"
SUPABASE_ORIGIN="${SUPABASE_URL:-https://melhdrdiesgeotzhkazg.supabase.co}"

expect_code() {
  local expected="$1" method="$2" url="$3" code
  code="$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' --request "$method" "$url")"
  if [[ "$code" != "$expected" ]]; then
    echo "Unexpected HTTP $code for $method $url (expected $expected)" >&2
    return 1
  fi
  echo "HTTP $code $method $url"
}

expect_code 200 GET "$BROKER_ORIGIN/health"
expect_code 200 GET "$BROKER_ORIGIN/privacy"
expect_code 200 GET "$BROKER_ORIGIN/terms"
expect_code 401 POST "$BROKER_ORIGIN/revoke-user"
expect_code 401 POST "$SUPABASE_ORIGIN/functions/v1/agent"
expect_code 401 POST "$SUPABASE_ORIGIN/functions/v1/alexa-actions"

echo "Public availability and anonymous-access protections verified."
