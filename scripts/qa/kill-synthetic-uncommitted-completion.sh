#!/usr/bin/env bash
# Real iOS process SIGKILL with an active, uncommitted SQLite transaction.
# The before-phase MUST NOT read SQLite before killing its write transaction.
set -euo pipefail
: "${MAESTRO_UDID:?Synthetic simulator required}"
: "${QA_BUNDLE_ID:?Synthetic QA bundle required}"
if [[ "$QA_BUNDLE_ID" != 'com.sidequest.synthetic.qa' ||
      "${NATIVE_QA_COMPLETION_KILL:-}" != '1' ]]; then
  echo 'Refusing SQL SIGKILL outside explicit isolated synthetic QA.' >&2; exit 2
fi
case "${1:-}" in before|after) ;; *) echo 'Expected before or after.' >&2; exit 2 ;; esac
command -v sqlite3 >/dev/null || { echo 'SQLite unavailable.' >&2; exit 2; }
DATA_CONTAINER=$(xcrun simctl get_app_container "$MAESTRO_UDID" "$QA_BUNDLE_ID" data)
[[ -d "$DATA_CONTAINER" ]] || { echo 'Synthetic app container missing.' >&2; exit 2; }
B_ID='local_synthetic-save-interrupt-b@example.invalid'
mkdir -p maestro-evidence
find_b_file() {
  B_FILE=''
  while IFS= read -r file; do
    [[ -f "$file" ]] || continue
    local exists owner
    exists=$(sqlite3 "$file" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sidequest_athlete_database_owner';")
    [[ "$exists" == '1' ]] || continue
    owner=$(sqlite3 "$file" 'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton=1;')
    if [[ "$owner" == "$B_ID" ]]; then B_FILE="$file"; break; fi
  done < <(find "$DATA_CONTAINER" -type f -name 'circuit-generator*.db' -print)
  [[ -n "$B_FILE" && "$B_FILE" == "$DATA_CONTAINER/"* ]] || {
    echo 'Embedded synthetic B owner not verified.' >&2; exit 2;
  }
}
check_sql() {
  [[ "$(sqlite3 "$B_FILE" 'PRAGMA quick_check;')" == 'ok' ]] || {
    echo 'POSTCONDITION FAILED: synthetic B SQLite integrity.' >&2; exit 1;
  }
  COUNTS=$(sqlite3 "$B_FILE" 'SELECT (SELECT COUNT(*) FROM completed_workouts), (SELECT COUNT(*) FROM workout_ledger);')
}
if [[ "$1" == before ]]; then
  # Real uncommitted INSERT is held by an app-source callback within the
  # active withTransactionAsync call. No sqlite3 transaction probing here:
  # SQLite file-level locks can block until the host actually kills iOS.
  PID=$(xcrun simctl spawn "$MAESTRO_UDID" launchctl list |
    awk -v app="$QA_BUNDLE_ID" '$3 ~ /^UIKitApplication:/ {
      label=$3; sub(/^UIKitApplication:/,"",label); sub(/\[.*/,"",label);
      if (label==app && $1 ~ /^[0-9]+$/) print $1
    }')
  [[ "$PID" =~ ^[0-9]+$ ]] || {
    echo 'Refusing SIGKILL: exact synthetic UIKit process PID not proven.' >&2; exit 2;
  }
  kill -0 "$PID" || { echo 'Synthetic PID already exited.' >&2; exit 2; }
  kill -9 "$PID"
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then
    echo 'POSTCONDITION FAILED: synthetic app process survived SIGKILL.' >&2; exit 1
  fi
  # Only NOW ask SQLite for B's owner and integrity; an uncommitted INSERT
  # must have rolled back, leaving zero canonical workouts and ledger rows.
  find_b_file
  check_sql
  [[ "$COUNTS" == '0|0' ]] || {
    echo 'POSTCONDITION FAILED: uncommitted SQLite write survived real SIGKILL.' >&2; exit 1;
  }
  echo 'Verified actual synthetic iOS SIGKILL inside SQL transaction; uncommitted rows rolled back 0/0.' \
    > maestro-evidence/completion-in-transaction-process.log
  exit 0
fi

find_b_file
check_sql
[[ "$COUNTS" == '1|1' ]] || {
  echo 'POSTCONDITION FAILED: cold retry did not produce exactly one completed/ledger pair.' >&2; exit 1;
}
VALID=$(sqlite3 "$B_FILE" "SELECT COUNT(*) FROM completed_workouts c JOIN workout_ledger l ON l.id=c.id WHERE c.completion_fraction>0 AND c.completion_fraction<1 AND abs(c.completion_fraction-l.completion_fraction)<0.000001 AND c.started_at=l.started_at AND c.completed_at=l.completed_at;")
[[ "$VALID" == '1' ]] || {
  echo 'POSTCONDITION FAILED: original partial fraction, timestamps, or stable ledger ID changed.' >&2; exit 1;
}
FAKE=$(sqlite3 "$B_FILE" "SELECT COUNT(*) FROM workout_ledger, json_each(workout_ledger.exercises_json) ex, json_each(ex.value,'$.sets') sets WHERE workout_ledger.completion_fraction<1;")
[[ "$FAKE" == '0' ]] || {
  echo 'POSTCONDITION FAILED: resumed partial workout contains fabricated completed sets.' >&2; exit 1;
}
echo 'Verified in-transaction native SIGKILL rollback/retry: one original partial dose, no duplicates or fabricated sets.' \
  >> maestro-evidence/completion-in-transaction-process.log
