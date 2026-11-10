#!/usr/bin/env bash
# Run against the disposable PostgreSQL service configured in CI.
# Two independent authenticated SQL connections race for one athlete's row.
set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=sidequest_lease_ci}"

actor='00000000-0000-4000-8000-000000000003'
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

attempt() {
  local device="$1" output="$2"
  psql -X -A -t -v ON_ERROR_STOP=1 >"$output" <<SQL
set role authenticated;
set request.jwt.claim.sub = '${actor}';
select granted::text from public.acquire_training_workout_lease('concurrent-workout', '${device}');
SQL
}

for round in 1 2 3 4 5; do
  # Expiring as the test admin is equivalent to a lease timeout. Do not
  # access lease rows directly from an application client.
  psql -X -A -t -v ON_ERROR_STOP=1 >/dev/null <<SQL
update public.training_workout_leases
set expires_at = clock_timestamp() - interval '1 second'
where athlete_id = '${actor}';
SQL
  attempt "device-A-${round}" "$tmpdir/first" &
  first_pid=$!
  attempt "device-B-${round}" "$tmpdir/second" &
  second_pid=$!
  wait "$first_pid"
  wait "$second_pid"
  first="$(tail -n 1 "$tmpdir/first")"
  second="$(tail -n 1 "$tmpdir/second")"
  if [[ "$first:$second" != "true:false" && "$first:$second" != "false:true" ]]; then
    echo "Expected exactly one granted lease in round ${round}; got ${first} / ${second}" >&2
    exit 1
  fi
done
echo "Five independent PostgreSQL contention rounds granted exactly one workout lease each."
