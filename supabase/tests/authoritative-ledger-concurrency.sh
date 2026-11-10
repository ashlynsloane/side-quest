#!/usr/bin/env bash
# Concurrent, fully authoritative starts against two independent PostgreSQL
# connections: no relying on mocked responses or sequential calls.
set -euo pipefail
actor='00000000-0000-4000-8000-000000000003'
psql -X -A -t -v ON_ERROR_STOP=1 >/dev/null <<SQL
set role authenticated;
set request.jwt.claim.sub = '${actor}';
select public.publish_training_remote_plan(
  current_date,
  jsonb_build_array(jsonb_build_object(
    'sessionId','race-session','minutes',25,
    'regions',jsonb_build_array('general'))));
SQL
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
attempt() {
  local device="$1" out="$2"
  psql -X -A -t -v ON_ERROR_STOP=1 >"$out" <<SQL
set role authenticated;
set request.jwt.claim.sub = '${actor}';
select granted::text from public.acquire_training_workout_lease_v2(
  'race-workout','${device}',current_date,'race-session',25,array['general']::text[]);
SQL
}
attempt 'device-A' "$tmp/a" &
pa=$!
attempt 'device-B' "$tmp/b" &
pb=$!
wait "$pa"
wait "$pb"
a="$(tail -n 1 "$tmp/a")"
b="$(tail -n 1 "$tmp/b")"
if [[ "$a:$b" != "true:false" && "$a:$b" != "false:true" ]]; then
  echo "Concurrent synchronized start must have one winner: A=$a B=$b" >&2
  exit 1
fi
count="$(psql -X -A -t -v ON_ERROR_STOP=1 <<SQL
select count(*) from public.training_remote_reservations
where athlete_id='${actor}' and session_id='race-session';
SQL
)"
if [[ "$count" != "1" ]]; then
  echo "Expected exactly one durable server reservation, got $count" >&2
  exit 1
fi
echo 'Synchronized daily-budget contention passed: one lease and one durable reservation.'
