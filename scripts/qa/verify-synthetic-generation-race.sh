#!/usr/bin/env bash
# Synthetic QA ONLY: read-only postconditions for native issue #19 after a
# timed account switch while athlete A's first-week draft awaited persistence.
# This does NOT claim privacy for any physical or production athlete files.
set -euo pipefail
: "${MAESTRO_UDID:?Synthetic simulator UDID is required}"
: "${QA_BUNDLE_ID:?Synthetic bundle ID is required}"
if [[ "$QA_BUNDLE_ID" != 'com.sidequest.synthetic.qa' ||
      "${NATIVE_QA_GENERATION_RACE:-}" != '1' ]]; then
  echo 'Refusing generation-race inspection outside isolated synthetic QA.' >&2
  exit 2
fi
if ! command -v sqlite3 >/dev/null; then
  echo 'SQLite CLI unavailable; cannot verify generation-race evidence.' >&2
  exit 2
fi
DATA_CONTAINER=$(xcrun simctl get_app_container "$MAESTRO_UDID" "$QA_BUNDLE_ID" data)
if [[ ! -d "$DATA_CONTAINER" ]]; then
  echo 'QA simulator database container missing.' >&2
  exit 2
fi

A_FILE=''
B_FILE=''
A_ID='local_synthetic-first-week-race-a@example.invalid'
B_ID='local_synthetic-first-week-race-b@example.invalid'
while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  # Inspect the embedded owner record, not a sanitized filename. Never log
  # owner identifiers or real training records even in QA output.
  TABLE=$(sqlite3 "$file" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sidequest_athlete_database_owner';")
  [[ "$TABLE" == '1' ]] || continue
  OWNER=$(sqlite3 "$file" "SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton=1;")
  if [[ "$OWNER" == "$A_ID" ]]; then A_FILE="$file"; fi
  if [[ "$OWNER" == "$B_ID" ]]; then B_FILE="$file"; fi
done < <(find "$DATA_CONTAINER" -type f -name 'circuit-generator*.db' -print)

if [[ -z "$A_FILE" || -z "$B_FILE" || "$A_FILE" == "$B_FILE" ]]; then
  echo 'QA generation race failed: distinct embedded SQLite owners not found.' >&2
  exit 1
fi
# Synthetic A intentionally selects GENERAL STRENGTH; B defaults to
# IRONMAN 70.3. Without distinct goal IDs, a stale write from A into B could
# be overwritten by B's own onboarding, yielding a dangerous false PASS.
A_BLOCKS=$(sqlite3 "$A_FILE" 'SELECT COUNT(*) FROM training_blocks;')
B_BLOCKS=$(sqlite3 "$B_FILE" 'SELECT COUNT(*) FROM training_blocks;')
A_GOALS=$(sqlite3 "$A_FILE" 'SELECT COUNT(*) FROM performance_goals;')
B_GOALS=$(sqlite3 "$B_FILE" 'SELECT COUNT(*) FROM performance_goals;')
B_A_GOAL_LEAK=$(sqlite3 "$B_FILE" "SELECT COUNT(*) FROM performance_goals WHERE id='goal_general_offseason';")
B_EXPECTED_GOAL=$(sqlite3 "$B_FILE" "SELECT COUNT(*) FROM performance_goals WHERE id='goal_ironman_70_3';")
B_STALE_BLOCKS=$(sqlite3 "$B_FILE" "SELECT COUNT(*) FROM training_blocks WHERE block_json LIKE '%general_offseason%';")
A_CHECK=$(sqlite3 "$A_FILE" 'PRAGMA quick_check;')
B_CHECK=$(sqlite3 "$B_FILE" 'PRAGMA quick_check;')
if [[ "$A_BLOCKS" != '0' || "$A_GOALS" != '0' ||
      "$B_BLOCKS" != '1' || "$B_GOALS" != '1' ||
      "$B_A_GOAL_LEAK" != '0' || "$B_STALE_BLOCKS" != '0' ||
      "$B_EXPECTED_GOAL" != '1' ||
      "$A_CHECK" != 'ok' || "$B_CHECK" != 'ok' ]]; then
  echo 'POSTCONDITION FAILED: A goal/block leaked into B, a plan was overwritten, or SQLite integrity failed.' >&2
  exit 1
fi
echo 'Synthetic generation-race PASS: no A goal/block in either file; B owns exactly one distinct goal/block; SQLite owners/integrity intact.'
