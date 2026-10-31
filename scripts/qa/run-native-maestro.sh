#!/usr/bin/env bash
# Native UI acceptance against an isolated, already-installed QA simulator app.
# No real accounts, provider credentials or production bundle identifiers.
set +e
: "${MAESTRO_UDID:?Provide the selected iOS simulator UDID}"
: "${QA_BUNDLE_ID:=com.sidequest.synthetic.qa}"
if [[ "$QA_BUNDLE_ID" != "com.sidequest.synthetic.qa" ]]; then
  echo "Refusing native QA against a non-synthetic bundle ID" >&2
  exit 2
fi
export PATH="$HOME/.maestro/bin:$PATH"
mkdir -p maestro-evidence

run_flow() {
  local label="$1"
  local file="$2"
  maestro --udid="$MAESTRO_UDID" test \
    --format junit --output "maestro-evidence/${label}-junit.xml" \
    --test-output-dir="maestro-evidence/${label}" \
    "$file" > "maestro-evidence/${label}-console.log" 2>&1
  local result=$?
  tail -n 90 "maestro-evidence/${label}-console.log"
  return "$result"
}

# Every downstream test is blocked (code 99) if prerequisites failed.
profile=99
onboarding=99
ride=99
restart=99
run_flow profile e2e/maestro/synthetic-profile-entry.yaml
profile=$?
if [[ "$profile" -eq 0 ]]; then
  run_flow onboarding e2e/maestro/synthetic-onboarding-first-week.yaml
  onboarding=$?
else
  echo "BLOCKED: onboarding requires passing profile creation" | tee maestro-evidence/onboarding-console.log
fi
if [[ "$onboarding" -eq 0 ]]; then
  run_flow ride e2e/maestro/synthetic-completed-ride.yaml
  ride=$?
else
  echo "BLOCKED: recorded ride requires passing onboarding" | tee maestro-evidence/ride-console.log
fi
if [[ "$ride" -eq 0 ]]; then
  run_flow restart e2e/maestro/synthetic-ride-restart.yaml
  restart=$?
else
  echo "BLOCKED: restart requires passing completed ride" | tee maestro-evidence/restart-console.log
fi
xcrun simctl io "$MAESTRO_UDID" screenshot maestro-evidence/final-simulator-screen.png || true
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "profile=$profile"
    echo "onboarding=$onboarding"
    echo "ride=$ride"
    echo "restart=$restart"
  } >> "$GITHUB_OUTPUT"
fi
summary="Profile: $profile; onboarding: $onboarding; ride: $ride; restart: $restart (0=pass, 99=blocked)"
echo "$summary"
# Parse JUnit reports and accessibility hierarchy into an actionable, privacy-
# preserving diagnosis. Do not let reporting success override a failed UI test.
node scripts/qa/diagnose-native-evidence.mjs maestro-evidence || true
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Native iOS athlete acceptance"
    echo "$summary"
    echo "A passing native build or launch alone is not a passing athlete journey."
  } >> "$GITHUB_STEP_SUMMARY"
fi
if [[ "$profile" -ne 0 || "$onboarding" -ne 0 || "$ride" -ne 0 || "$restart" -ne 0 ]]; then
  exit 1
fi
exit 0
