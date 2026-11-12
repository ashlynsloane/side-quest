#!/usr/bin/env bash
# Synthetic iOS Release QA only: send REAL SIGKILL to a user-app PID after a
# partial workout was durably journaled and before canonical SQLite starts.
set -euo pipefail
: "${MAESTRO_UDID:?Missing isolated simulator UDID}"
: "${QA_BUNDLE_ID:?Missing isolated QA bundle ID}"
if [[ "$QA_BUNDLE_ID" != 'com.sidequest.synthetic.qa' ||
      "${NATIVE_QA_COMPLETION_KILL:-}" != '1' ]]; then
  echo 'SIGKILL denied outside explicit synthetic completion QA.' >&2
  exit 2
fi
case "${1:-}" in before|after) ;; *) echo 'Expected before or after action.' >&2; exit 2 ;; esac
if ! command -v sqlite3 >/dev/null; then
  echo 'SQLite CLI unavailable for canonical completion postcondition.' >&2
  exit 2
fi
DATA_CONTAINER=$(xcrun simctl get_app_container "$MAESTRO_UDID" "$QA_BUNDLE_ID" data)
if [[ ! -d "$DATA_CONTAINER" ]]; then
  echo 'Synthetic simulator container absent.' >&2
  exit 2
fi
A_ID='local_synthetic-save-interrupt-a@example.invalid'
A_FILE=''
while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  TABLE=$(sqlite3 "$file" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sidequest_athlete_database_owner';")
  [[ "$TABLE" == '1' ]] || continue
  OWNER=$(sqlite3 "$file" "SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton=1;")
  if [[ "$OWNER" == "$A_ID" ]]; then A_FILE="$file"; break; fi
done < <(find "$DATA_CONTAINER" -type f -name 'circuit-generator*.db' -print)
if [[ -z "$A_FILE" ]]; then
  echo 'Exact synthetic completed-workout SQLite owner not found.' >&2
  exit 2
fi
CHECK=$(sqlite3 "$A_FILE" 'PRAGMA quick_check;')
[[ "$CHECK" == 'ok' ]] || { echo 'Synthetic SQLite integrity failure.' >&2; exit 1; }
COUNTS=$(sqlite3 "$A_FILE" 'SELECT (SELECT COUNT(*) FROM completed_workouts), (SELECT COUNT(*) FROM workout_ledger);')
mkdir -p maestro-evidence
if [[ "$1" == before ]]; then
  if [[ "$COUNTS" != '0|0' ]]; then
    echo 'POSTCONDITION FAILED: canonical workout already saved before requested pre-SQL kill.' >&2
    exit 1
  fi
  # On simulator, launchctl lists UIKitApplication with its HOST-namespace
  # PID. Do not kill a broad matching process name, the Simulator app itself,
  # or any process whose full UIKitApplication bundle ID differs from QA.
  PIDS=$(xcrun simctl spawn "$MAESTRO_UDID" launchctl list |
    awk -v app="$QA_BUNDLE_ID" '$3 ~ /^UIKitApplication:/ {
      label=$3; sub(/^UIKitApplication:/,"",label); sub(/\\[.*/,"",label);
      if (label==app && $1 ~ /^[0-9]+$/) print $1
    }')
  if [[ ! "$PIDS" =~ ^[0-9]+$ ]]; then
    echo 'Could not prove one exact synthetic app PID; SIGKILL refused.' >&2
    exit 2
  fi
  kill -0 "$PIDS" || { echo 'Synthetic PID not alive.' >&2; exit 2; }
  # SIGKILL cannot execute the app's graceful Leave or iOS shutdown hooks.
  kill -9 "$PIDS"
  sleep 1
  if kill -0 "$PIDS" 2>/dev/null; then
    echo 'POSTCONDITION FAILED: synthetic app survived SIGKILL.' >&2
    exit 1
  fi
  printf 'SIGKILL delivered to exact synthetic app PID; pre-SQL canonical rows 0/0.\n'     > maestro-evidence/completion-kill-process.log
  exit 0
fi

# Recovery postcondition: every historical claim is checked against REAL
# SQLite rows, not only the app screenshot or a successful Maestro exit.
if [[ "$COUNTS" != '1|1' ]]; then
  echo 'POSTCONDITION FAILED: interrupted partial completion did not create exactly one completed and ledger row.' >&2
  exit 1
fi
VALID=$(sqlite3 "$A_FILE" "SELECT COUNT(*) FROM completed_workouts c JOIN workout_ledger l ON l.id=c.id WHERE c.completion_fraction>0 AND c.completion_fraction<1 AND abs(c.completion_fraction-l.completion_fraction)<0.000001 AND c.started_at=l.started_at AND c.completed_at=l.completed_at;")
if [[ "$VALID" != '1' ]]; then
  echo 'POSTCONDITION FAILED: completion fraction, stable identity, or original timestamps mismatched.' >&2
  exit 1
fi
FAKE_SETS=$(sqlite3 "$A_FILE" "SELECT COUNT(*) FROM workout_ledger, json_each(workout_ledger.exercises_json) ex, json_each(ex.value,'$.sets') sets WHERE workout_ledger.completion_fraction<1;")
if [[ "$FAKE_SETS" != '0' ]]; then
  echo 'POSTCONDITION FAILED: unlogged synthetic partial workout was assigned completed exercise sets.' >&2
  exit 1
fi
printf 'Native interrupted completion verified: real SIGKILL, one matching sub-100%% ledger/workout pair, no fabricated sets, owner and SQLite integrity intact.\n'   >> maestro-evidence/completion-kill-process.log
