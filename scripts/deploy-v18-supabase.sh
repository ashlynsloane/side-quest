#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF}"
SECRETS_FILE="${V18_SECRETS_FILE:-supabase/.env.v18}"

command -v supabase >/dev/null 2>&1 || { echo "Supabase CLI is required." >&2; exit 1; }
[[ -f "$SECRETS_FILE" ]] || { echo "Missing $SECRETS_FILE. Copy supabase/.env.v18.example and fill it in." >&2; exit 1; }

supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push
supabase secrets set --env-file "$SECRETS_FILE"

for function_name in \
  strava-oauth-start \
  strava-oauth-callback \
  strava-sync \
  strava-webhook \
  strava-disconnect
do
  supabase functions deploy "$function_name"
done

set -a
# shellcheck disable=SC1090
source "$SECRETS_FILE"
set +a
"$ROOT/scripts/setup-strava-webhook.sh"

echo "V18 Supabase schema, functions, secrets, and Strava webhook are deployed."
