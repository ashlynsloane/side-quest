#!/usr/bin/env bash
# Native QA ONLY: inject a deliberately mismatched embedded SQLite owner into
# the isolated synthetic iOS simulator. No production/dev bundle is allowed.
set -euo pipefail
: "${MAESTRO_UDID:?Missing synthetic simulator UDID}"
: "${QA_BUNDLE_ID:?Missing synthetic QA bundle identifier}"
if [[ "$QA_BUNDLE_ID" != 'com.sidequest.synthetic.qa' ||
      "${NATIVE_QA_OWNER_RECOVERY:-}" != '1' ]]; then
  echo 'Refusing owner fault injection outside explicit synthetic QA scope.' >&2
  exit 2
fi
if ! command -v sqlite3 >/dev/null; then
  echo 'macOS sqlite3 CLI unavailable; cannot verify synthetic fixture.' >&2
  exit 2
fi
if [[ "${1:-inject}" == "inject" ]]; then
  xcrun simctl terminate "$MAESTRO_UDID" "$QA_BUNDLE_ID" >/dev/null 2>&1 || {
    echo 'Could not terminate isolated synthetic app before database injection.' >&2
    exit 2
  }
elif [[ "${1:-inject}" != "verify" ]]; then
  echo 'Unsupported synthetic owner QA action.' >&2
  exit 2
fi
DATA_CONTAINER=$(xcrun simctl get_app_container "$MAESTRO_UDID" "$QA_BUNDLE_ID" data)
if [[ ! -d "$DATA_CONTAINER" ]]; then
  echo 'Synthetic simulator data container missing.' >&2
  exit 2
fi
SOURCE=$(find "$DATA_CONTAINER" -type f -name 'circuit-generator.db' -print -quit)
if [[ -z "$SOURCE" || ! -f "$SOURCE" || "$SOURCE" != "$DATA_CONTAINER/"* ]]; then
  echo 'Original synthetic SQLite database not found; refusing to inject fault.' >&2
  exit 2
fi
# This script never prints owner IDs or training rows; only counts/status.
PLAN_COUNT=$(sqlite3 "$SOURCE" "SELECT COUNT(*) FROM training_blocks;")
OWNER_COUNT=$(sqlite3 "$SOURCE" "SELECT COUNT(*) FROM sidequest_athlete_database_owner WHERE singleton=1 AND length(user_id)>0;")
if [[ "$OWNER_COUNT" != '1' || ! "$PLAN_COUNT" =~ ^[0-9]+$ ||
      "$PLAN_COUNT" -lt 1 ]]; then
  echo 'Synthetic owner/first-week training block missing; refusing to continue.' >&2
  exit 2
fi

if [[ "${1:-inject}" == "verify" ]]; then
  EXPECTED=$(cat maestro-evidence/synthetic-owner-plan-count.txt)
  STILL_MISMATCHED=$(sqlite3 "$SOURCE" "SELECT COUNT(*) FROM sidequest_athlete_database_owner WHERE singleton=1 AND user_id='synthetic-mismatched-owner';")
  INTEGRITY=$(sqlite3 "$SOURCE" "PRAGMA quick_check;")
  if [[ "$PLAN_COUNT" != "$EXPECTED" || "$STILL_MISMATCHED" != '1' ||
        "$INTEGRITY" != 'ok' ]]; then
    echo 'POSTCONDITION FAILED: mismatch was adopted, plan rows changed, or SQLite integrity failed.' >&2
    exit 1
  fi
  echo 'Synthetic native recovery verified: original plan count intact, owner still mismatched, SQLite integrity OK.'
  exit 0
fi

# This exercise intentionally changes ONLY the SYNTHETIC embedded owner.
mkdir -p maestro-evidence
printf '%s\n' "$PLAN_COUNT" > maestro-evidence/synthetic-owner-plan-count.txt
sqlite3 "$SOURCE" "UPDATE sidequest_athlete_database_owner SET user_id='synthetic-mismatched-owner' WHERE singleton=1;"
CHANGED=$(sqlite3 "$SOURCE" "SELECT COUNT(*) FROM sidequest_athlete_database_owner WHERE singleton=1 AND user_id='synthetic-mismatched-owner';")
if [[ "$CHANGED" != '1' ]]; then
  echo 'Synthetic owner mismatch could not be established.' >&2
  exit 2
fi
echo 'Native synthetic database owner mismatch prepared.'
