#!/usr/bin/env bash
set -euo pipefail

: "${STRAVA_CLIENT_ID:?Set STRAVA_CLIENT_ID}"
: "${STRAVA_CLIENT_SECRET:?Set STRAVA_CLIENT_SECRET}"
: "${STRAVA_VERIFY_TOKEN:?Set STRAVA_VERIFY_TOKEN}"
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF}"
command -v python3 >/dev/null 2>&1 || { echo "python3 is required to parse the Strava subscription response." >&2; exit 1; }
command -v supabase >/dev/null 2>&1 || { echo "Supabase CLI is required to store STRAVA_SUBSCRIPTION_ID." >&2; exit 1; }

CALLBACK_URL="https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/strava-webhook"
API="https://www.strava.com/api/v3/push_subscriptions"

existing="$(curl --fail --silent --show-error -G "$API" \
  --data-urlencode "client_id=$STRAVA_CLIENT_ID" \
  --data-urlencode "client_secret=$STRAVA_CLIENT_SECRET")"

subscription_id="$(EXISTING_JSON="$existing" CALLBACK_URL="$CALLBACK_URL" python3 - <<'PY'
import json, os
for item in json.loads(os.environ['EXISTING_JSON']):
    if item.get('callback_url') == os.environ['CALLBACK_URL']:
        print(item['id'])
        break
PY
)"

if [[ -z "$subscription_id" ]]; then
  created="$(curl --fail --silent --show-error -X POST "$API" \
    -F "client_id=$STRAVA_CLIENT_ID" \
    -F "client_secret=$STRAVA_CLIENT_SECRET" \
    -F "callback_url=$CALLBACK_URL" \
    -F "verify_token=$STRAVA_VERIFY_TOKEN")"
  subscription_id="$(CREATED_JSON="$created" python3 - <<'PY'
import json, os
print(json.loads(os.environ['CREATED_JSON'])['id'])
PY
)"
  echo "Registered $CALLBACK_URL as subscription $subscription_id."
else
  echo "The V18 callback is already registered as subscription $subscription_id."
fi

supabase secrets set "STRAVA_SUBSCRIPTION_ID=$subscription_id" --project-ref "$SUPABASE_PROJECT_REF"
echo "Stored the expected subscription ID for webhook POST validation."
