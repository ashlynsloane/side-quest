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
# iOS 26 XCTest first launch can take >2 minutes even after the app is booted.
# Maestro expects milliseconds (confirmed by its release documentation).
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-360000}"
mkdir -p maestro-evidence

run_flow() {
  local label="$1"
  local file="$2"
  maestro --udid="$MAESTRO_UDID" test \
    --format junit --output "maestro-evidence/${label}-junit.xml" \
    --test-output-dir="maestro-evidence/${label}" \
    "$file" > "maestro-evidence/${label}-console.log" 2>&1
  local result=$?
  if [[ "$result" -ne 0 ]] && node scripts/qa/native-driver-retry.mjs \
      "maestro-evidence/${label}-junit.xml" "maestro-evidence/${label}"; then
    # Only pre-interaction XCTest failures qualify. Preserve the original
    # failure for forensics; the retry must produce its own fresh JUnit.
    mv "maestro-evidence/${label}-junit.xml" "maestro-evidence/${label}-driver-attempt1-junit.xml"
    mv "maestro-evidence/${label}-console.log" "maestro-evidence/${label}-driver-attempt1-console.log"
    echo "INFRASTRUCTURE RETRY: pre-interaction XCTest driver transport failed; retrying ${label} once."
    maestro --udid="$MAESTRO_UDID" test \
      --format junit --output "maestro-evidence/${label}-junit.xml" \
      --test-output-dir="maestro-evidence/${label}-retry" \
      "$file" > "maestro-evidence/${label}-console.log" 2>&1
    result=$?
  fi
  tail -n 90 "maestro-evidence/${label}-console.log"
  return "$result"
}

# One installed synthetic binary supports three independent acceptance scopes:
# full = six consecutive stages, isolation = five, strength = profile ->
# onboarding -> strength. Each scope uses a CLEAN simulator in its own job.
scope="${NATIVE_QA_SCOPE:-full}"
case "$scope" in
  full|isolation|strength) ;;
  *) echo "Unsupported NATIVE_QA_SCOPE: $scope" >&2; exit 2 ;;
esac
export NATIVE_QA_SCOPE="$scope"

# The six stages use a staged synthetic account and workout lifecycle instead of clearing
# the app four times through nested standalone wrappers. Each stage keeps its
# own JUnit and screenshot evidence, and is gated on its predecessor.
# Every downstream test is blocked (code 99) if prerequisites failed.
profile=99
onboarding=99
ride=99
restart=99
isolation=99
strength=99
run_flow profile e2e/maestro/synthetic-profile-entry.yaml
profile=$?
if [[ "$profile" -eq 0 ]]; then
  run_flow onboarding e2e/maestro/synthetic-onboarding-steps.yaml
  onboarding=$?
else
  echo "BLOCKED: onboarding requires passing profile creation" | tee maestro-evidence/onboarding-console.log
fi
if [[ "$scope" == "strength" ]]; then
  # This is the primary architectural improvement: strength acceptance
  # no longer depends on recorded endurance or switching two profiles.
  if [[ "$onboarding" -eq 0 ]]; then
    run_flow strength e2e/maestro/synthetic-strength-restart-steps.yaml
    strength=$?
  else
    echo "BLOCKED: strength requires passing synthetic onboarding" | tee maestro-evidence/strength-console.log
  fi
else
  if [[ "$onboarding" -eq 0 ]]; then
    run_flow ride e2e/maestro/synthetic-completed-ride-steps.yaml
    ride=$?
  else
    echo "BLOCKED: recorded ride requires passing onboarding" | tee maestro-evidence/ride-console.log
  fi
  if [[ "$ride" -eq 0 ]]; then
    run_flow restart e2e/maestro/synthetic-ride-restart-steps.yaml
    restart=$?
  else
    echo "BLOCKED: restart requires passing completed ride" | tee maestro-evidence/restart-console.log
  fi
  if [[ "$restart" -eq 0 ]]; then
    run_flow isolation e2e/maestro/synthetic-athlete-isolation-steps.yaml
    isolation=$?
  else
    echo "BLOCKED: account isolation requires passing cold-restart history" | tee maestro-evidence/isolation-console.log
  fi
  if [[ "$scope" == "full" ]]; then
    if [[ "$isolation" -eq 0 ]]; then
      run_flow strength e2e/maestro/synthetic-strength-restart-steps.yaml
      strength=$?
    else
      echo "BLOCKED: strength pause/restart requires passing A/B isolation" | tee maestro-evidence/strength-console.log
    fi
  fi
fi
xcrun simctl io "$MAESTRO_UDID" screenshot maestro-evidence/final-simulator-screen.png || true
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "profile=$profile"
    echo "onboarding=$onboarding"
    echo "ride=$ride"
    echo "restart=$restart"
    echo "isolation=$isolation"
    echo "strength=$strength"
  } >> "$GITHUB_OUTPUT"
fi
summary="Scope: $scope; profile: $profile; onboarding: $onboarding; ride: $ride; restart: $restart; isolation: $isolation; strength: $strength (0=pass, 99=not run/blocked)"
echo "$summary"
# Parse JUnit reports and accessibility hierarchy into an actionable, privacy-
# preserving diagnosis. Do not let reporting success override a failed UI test.
node scripts/qa/diagnose-native-evidence.mjs maestro-evidence
diagnostics=$?
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Native iOS athlete acceptance ($scope)"
    echo "$summary"
    echo "A passing native build or launch alone is not a passing athlete journey."
  } >> "$GITHUB_STEP_SUMMARY"
fi
if [[ "$diagnostics" -ne 0 || "$profile" -ne 0 || "$onboarding" -ne 0 ]]; then exit 1; fi
if [[ "$scope" == "strength" && "$strength" -ne 0 ]]; then exit 1; fi
if [[ "$scope" != "strength" && ( "$ride" -ne 0 || "$restart" -ne 0 || "$isolation" -ne 0 ) ]]; then exit 1; fi
if [[ "$scope" == "full" && "$strength" -ne 0 ]]; then exit 1; fi
exit 0
