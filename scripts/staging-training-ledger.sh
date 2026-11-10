#!/usr/bin/env bash
# Explicit staging-only deployment gate for the authoritative cloud training ledger.
# Default: dry-run. Production deployments and silent target selection are forbidden.
set -euo pipefail

MODE="${1:-plan}"
if [[ "$MODE" != "plan" && "$MODE" != "apply" ]]; then
  echo "Usage: bash scripts/staging-training-ledger.sh [plan|apply]" >&2
  exit 2
fi

: "${STAGING_PROJECT_REF:?Set the dedicated staging Supabase project ref}"
: "${PRODUCTION_PROJECT_REF:?Set the production Supabase project ref for collision protection}"
: "${SUPABASE_ACCESS_TOKEN:?Set a staging-authorized Supabase CLI token}"
: "${SUPABASE_DB_PASSWORD:?Set the dedicated staging database password}"

# Supabase project refs are 20 lowercase alphanumeric characters. Explicitly
# require both identifiers to prevent empty/ambiguous/branch targets.
for ref in "$STAGING_PROJECT_REF" "$PRODUCTION_PROJECT_REF"; do
  if [[ ! "$ref" =~ ^[a-z0-9]{20}$ ]]; then
    echo "Ref must be a concrete 20-character Supabase project ID." >&2
    exit 2
  fi
done
if [[ "$STAGING_PROJECT_REF" == "$PRODUCTION_PROJECT_REF" ]]; then
  echo "Refusing to deploy: staging and production refs are identical." >&2
  exit 2
fi
if [[ "$MODE" == "apply" ]]; then
  if [[ "${APPLY_STAGING_LEDGER:-}" != "yes" ||
        "${CONFIRM_STAGING_REF:-}" != "$STAGING_PROJECT_REF" ]]; then
    echo "Apply requires APPLY_STAGING_LEDGER=yes and CONFIRM_STAGING_REF exactly matching staging." >&2
    exit 2
  fi
fi

command -v supabase >/dev/null || {
  echo "The Supabase CLI must be installed; no deployment occurred." >&2
  exit 2
}
cd "$(dirname "$0")/.."
for filename in \
  20261110150000_training_workout_leases.sql \
  20261110190000_authoritative_training_ledger.sql \
  20261110210000_reviewed_training_corrections.sql; do
  if [[ ! -s "supabase/migrations/$filename" ]]; then
    echo "Missing migration $filename; refusing staging deployment." >&2
    exit 2
  fi
done

echo "Supabase staging migration preview for project $STAGING_PROJECT_REF"
# --remote is explicit. Do not depend on a saved .temp/project-ref link,
# which might point at production or a different account.
supabase db push --remote="$STAGING_PROJECT_REF" --dry-run

if [[ "$MODE" == "plan" ]]; then
  echo "PLAN ONLY. No staging database was modified by this script."
  exit 0
fi
echo "Applying reviewed migration set to explicit STAGING project $STAGING_PROJECT_REF"
supabase db push --remote="$STAGING_PROJECT_REF" --yes
echo "CLI migration push finished. Live postflight permissions and device QA remain REQUIRED."
