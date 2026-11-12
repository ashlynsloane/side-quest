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
# onboarding -> strength, live-isolation = profile -> onboarding ->
# A/B/A/B independent live workout checkpoints; owner-recovery = profile ->
# onboarding -> synthetic in-file owner mismatch -> fail-closed startup UI. Each
# scope uses a CLEAN simulator in its own job.
scope="${NATIVE_QA_SCOPE:-full}"
case "$scope" in
  full|isolation|strength|live-isolation|owner-recovery|generation-isolation|completion-kill|completion-in-transaction-kill) ;;
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
live_isolation=99
owner_recovery=99
generation_isolation=99
completion_kill_before=99
completion_kill_after=99
in_transaction_before=99
in_transaction_after=99
if [[ "$scope" == "generation-isolation" ]]; then
  run_flow profile e2e/maestro/synthetic-race-profile-entry.yaml
elif [[ "$scope" == "completion-kill" ]]; then
  run_flow profile e2e/maestro/synthetic-completion-kill-profile.yaml
elif [[ "$scope" == "completion-in-transaction-kill" ]]; then
  run_flow profile e2e/maestro/synthetic-completion-in-transaction-profile.yaml
else
  run_flow profile e2e/maestro/synthetic-profile-entry.yaml
fi
profile=$?
if [[ "$scope" != "generation-isolation" ]]; then
  if [[ "$profile" -eq 0 ]]; then
    run_flow onboarding e2e/maestro/synthetic-onboarding-steps.yaml
    onboarding=$?
  else
    echo "BLOCKED: onboarding requires passing profile creation" | tee maestro-evidence/onboarding-console.log
  fi
fi
if [[ "$scope" == "generation-isolation" ]]; then
  if [[ "$profile" -eq 0 ]]; then
    run_flow generation-isolation e2e/maestro/synthetic-first-week-generation-switch.yaml
    generation_isolation=$?
    if [[ "$generation_isolation" -eq 0 ]]; then
      # The QA barrier already resumed A after B's actual owner-verified
      # activation, not a guessed timer. Allow pending microtasks/SQL to settle
      # before inspecting both canonical SQLite files.
      sleep 3
      if ! NATIVE_QA_GENERATION_RACE=1 bash scripts/qa/verify-synthetic-generation-race.sh \
          >> maestro-evidence/generation-isolation-console.log 2>&1; then
        generation_isolation=1
        echo "POSTCONDITION FAILED: athlete A's stale generated plan or database ownership leaked" \
          | tee -a maestro-evidence/generation-isolation-console.log
      fi
    fi
  else
    echo "BLOCKED: generation switch needs a synthetic A profile" \
      | tee maestro-evidence/generation-isolation-console.log
  fi
elif [[ "$scope" == "completion-kill" ]]; then
  if [[ "$onboarding" -eq 0 ]]; then
    run_flow completion-kill-before e2e/maestro/synthetic-completion-kill-before.yaml
    completion_kill_before=$?
    if [[ "$completion_kill_before" -eq 0 ]]; then
      if NATIVE_QA_COMPLETION_KILL=1 bash scripts/qa/kill-synthetic-pending-completion.sh before; then
        run_flow completion-kill-after e2e/maestro/synthetic-completion-kill-after.yaml
        completion_kill_after=$?
        if [[ "$completion_kill_after" -eq 0 ]]; then
          if ! NATIVE_QA_COMPLETION_KILL=1 bash scripts/qa/kill-synthetic-pending-completion.sh after \
              >> maestro-evidence/completion-kill-after-console.log 2>&1; then
            completion_kill_after=1
            echo "POSTCONDITION FAILED: restored native partial workout has invalid canonical SQLite evidence" \
              | tee -a maestro-evidence/completion-kill-after-console.log
          fi
        fi
      else
        completion_kill_before=1
        echo "POSTCONDITION FAILED: no verified exact-app SIGKILL before canonical SQLite" \
          | tee -a maestro-evidence/completion-kill-before-console.log
      fi
    fi
  else
    echo "BLOCKED: interrupted completion needs passing synthetic onboarding" \
      | tee maestro-evidence/completion-kill-before-console.log
  fi
elif [[ "$scope" == "completion-in-transaction-kill" ]]; then
  if [[ "$onboarding" -eq 0 ]]; then
    run_flow completion-in-transaction-before e2e/maestro/synthetic-completion-in-transaction-before.yaml
    in_transaction_before=$?
    if [[ "$in_transaction_before" -eq 0 ]]; then
      if NATIVE_QA_COMPLETION_KILL=1 bash scripts/qa/kill-synthetic-uncommitted-completion.sh before; then
        run_flow completion-in-transaction-after e2e/maestro/synthetic-completion-kill-after.yaml
        in_transaction_after=$?
        if [[ "$in_transaction_after" -eq 0 ]]; then
          if ! NATIVE_QA_COMPLETION_KILL=1 bash scripts/qa/kill-synthetic-uncommitted-completion.sh after \
              >> maestro-evidence/completion-in-transaction-after-console.log 2>&1; then
            in_transaction_after=1
            echo "POSTCONDITION FAILED: in-transaction crash retry lost original SQLite fraction or created duplicate" \
              | tee -a maestro-evidence/completion-in-transaction-after-console.log
          fi
        fi
      else
        in_transaction_before=1
        echo "POSTCONDITION FAILED: real in-transaction app SIGKILL/SQL rollback was not verified" \
          | tee -a maestro-evidence/completion-in-transaction-before-console.log
      fi
    fi
  else
    echo "BLOCKED: in-transaction kill needs synthetic onboarding" \
      | tee maestro-evidence/completion-in-transaction-before-console.log
  fi
elif [[ "$scope" == "strength" ]]; then
  # This is the primary architectural improvement: strength acceptance
  # no longer depends on recorded endurance or switching two profiles.
  if [[ "$onboarding" -eq 0 ]]; then
    run_flow strength e2e/maestro/synthetic-strength-restart-steps.yaml
    strength=$?
  else
    echo "BLOCKED: strength requires passing synthetic onboarding" | tee maestro-evidence/strength-console.log
  fi
elif [[ "$scope" == "live-isolation" ]]; then
  if [[ "$onboarding" -eq 0 ]]; then
    run_flow live-isolation e2e/maestro/synthetic-live-checkpoint-isolation-steps.yaml
    live_isolation=$?
  else
    echo "BLOCKED: live checkpoint isolation requires passing synthetic onboarding" | tee maestro-evidence/live-isolation-console.log
  fi
elif [[ "$scope" == "owner-recovery" ]]; then
  if [[ "$onboarding" -eq 0 ]]; then
    # Injection is refused unless the selected installed bundle is the
    # isolated synthetic QA application. Never mutate a real device.
    if NATIVE_QA_OWNER_RECOVERY=1 bash scripts/qa/inject-synthetic-owner-mismatch.sh; then
      run_flow owner-recovery e2e/maestro/synthetic-owner-recovery-steps.yaml
      owner_recovery=$?
      if [[ "$owner_recovery" -eq 0 ]]; then
        if ! NATIVE_QA_OWNER_RECOVERY=1 bash scripts/qa/inject-synthetic-owner-mismatch.sh verify \
            >> maestro-evidence/owner-recovery-console.log 2>&1; then
          owner_recovery=1
          echo "POSTCONDITION FAILED: synthetic owner recovery data integrity check" \
            | tee -a maestro-evidence/owner-recovery-console.log
        fi
      fi
    else
      owner_recovery=1
      echo "BLOCKED: synthetic SQLite owner mismatch could not be prepared safely" | tee maestro-evidence/owner-recovery-console.log
    fi
  else
    echo "BLOCKED: owner recovery requires passing synthetic onboarding" | tee maestro-evidence/owner-recovery-console.log
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
    echo "live_isolation=$live_isolation"
    echo "owner_recovery=$owner_recovery"
    echo "generation_isolation=$generation_isolation"
    echo "completion_kill_before=$completion_kill_before"
    echo "completion_kill_after=$completion_kill_after"
    echo "completion_in_transaction_before=$in_transaction_before"
    echo "completion_in_transaction_after=$in_transaction_after"
  } >> "$GITHUB_OUTPUT"
fi
summary="Scope: $scope; profile: $profile; onboarding: $onboarding; ride: $ride; restart: $restart; isolation: $isolation; strength: $strength; live-isolation: $live_isolation; owner-recovery: $owner_recovery; generation-isolation: $generation_isolation; completion-kill-before: $completion_kill_before; completion-kill-after: $completion_kill_after; in-transaction-before: $in_transaction_before; in-transaction-after: $in_transaction_after (0=pass, 99=not run/blocked)"
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
if [[ "$diagnostics" -ne 0 || "$profile" -ne 0 ]]; then exit 1; fi
if [[ "$scope" != "generation-isolation" && "$onboarding" -ne 0 ]]; then exit 1; fi
if [[ "$scope" == "generation-isolation" && "$generation_isolation" -ne 0 ]]; then exit 1; fi
if [[ "$scope" == "completion-kill" &&
      ( "$completion_kill_before" -ne 0 || "$completion_kill_after" -ne 0 ) ]]; then exit 1; fi
if [[ "$scope" == "completion-in-transaction-kill" &&
      ( "$in_transaction_before" -ne 0 || "$in_transaction_after" -ne 0 ) ]]; then exit 1; fi
if [[ "$scope" == "strength" && "$strength" -ne 0 ]]; then exit 1; fi
if [[ "$scope" == "live-isolation" && "$live_isolation" -ne 0 ]]; then exit 1; fi
if [[ "$scope" == "owner-recovery" && "$owner_recovery" -ne 0 ]]; then exit 1; fi
if [[ "$scope" == "full" || "$scope" == "isolation" ]]; then
  if [[ "$ride" -ne 0 || "$restart" -ne 0 || "$isolation" -ne 0 ]]; then exit 1; fi
fi
if [[ "$scope" == "full" && "$strength" -ne 0 ]]; then exit 1; fi
exit 0
