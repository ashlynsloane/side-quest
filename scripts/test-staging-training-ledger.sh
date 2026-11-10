#!/usr/bin/env bash
# No Supabase network access: test the guardrails with a fake CLI executable.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/supabase" <<'CLI'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SQ_TEST_CALLS"
CLI
chmod +x "$tmp/supabase"
export PATH="$tmp:$PATH"
export SQ_TEST_CALLS="$tmp/calls"
export STAGING_PROJECT_REF='aaaaaaaaaaaaaaaaaaaa'
export PRODUCTION_PROJECT_REF='bbbbbbbbbbbbbbbbbbbb'
export SUPABASE_ACCESS_TOKEN=x
export SUPABASE_DB_PASSWORD=x
: > "$SQ_TEST_CALLS"

# Repeated production reference is refused without touching the CLI.
if PRODUCTION_PROJECT_REF="$STAGING_PROJECT_REF" \
  bash scripts/staging-training-ledger.sh plan >"$tmp/log" 2>&1; then
  echo "Production collision unexpectedly allowed" >&2
  exit 1
fi
[[ ! -s "$SQ_TEST_CALLS" ]] || { echo "Collision invoked Supabase" >&2; exit 1; }

# Plan is dry-run only. No implied deploy.
bash scripts/staging-training-ledger.sh plan >"$tmp/log" 2>&1
[[ "$(wc -l < "$SQ_TEST_CALLS")" -eq 1 ]] || exit 1
grep -F -- "db push --remote=$STAGING_PROJECT_REF --dry-run" "$SQ_TEST_CALLS" >/dev/null
: > "$SQ_TEST_CALLS"

# Apply without both independent confirmations must fail before any network call.
if APPLY_STAGING_LEDGER=yes CONFIRM_STAGING_REF='not-the-target' \
  bash scripts/staging-training-ledger.sh apply >"$tmp/log" 2>&1; then
  echo "Unconfirmed staging deployment unexpectedly allowed" >&2
  exit 1
fi
[[ ! -s "$SQ_TEST_CALLS" ]] || { echo "Unconfirmed apply invoked Supabase" >&2; exit 1; }

# Explicit confirmed apply must preview before issuing the write.
APPLY_STAGING_LEDGER=yes CONFIRM_STAGING_REF="$STAGING_PROJECT_REF" \
  bash scripts/staging-training-ledger.sh apply >"$tmp/log" 2>&1
[[ "$(wc -l < "$SQ_TEST_CALLS")" -eq 2 ]] || exit 1
[[ "$(head -n 1 "$SQ_TEST_CALLS")" == "db push --remote=$STAGING_PROJECT_REF --dry-run" ]]
[[ "$(tail -n 1 "$SQ_TEST_CALLS")" == "db push --remote=$STAGING_PROJECT_REF --yes" ]]
echo "Staging gate checks passed: target collision, plan-only and explicit apply."
