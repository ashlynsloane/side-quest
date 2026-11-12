import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = new URL('../../../', import.meta.url);
function source(path: string) {
  return readFileSync(new URL(path, root), 'utf8');
}
function present(path: string) {
  return existsSync(new URL(path, root));
}

describe('native synthetic UI automation contract', () => {
  it('keeps a separate iOS identifier and non-production simulator credentials', () => {
    const flow = source('e2e/maestro/synthetic-onboarding-first-week.yaml');
    const profileFlow = source('e2e/maestro/synthetic-profile-entry.yaml');
    const workflow = source('.github/workflows/native-ios-simulator-smoke.yml');
    expect(flow).toContain('appId: com.sidequest.synthetic.qa');
    expect(flow).toContain('- runFlow: synthetic-profile-entry.yaml');
    expect(profileFlow).toContain('clearState: true');
    expect(workflow).toContain('QA_BUNDLE_ID: com.sidequest.synthetic.qa');
    expect(workflow).toContain('app.expo.ios.bundleIdentifier = process.env.QA_BUNDLE_ID');
    expect(workflow).not.toContain('EXPO_PUBLIC_BETA_INVITE_CODE=');
    expect(workflow).not.toContain('EXPO_PUBLIC_SUPABASE_');
  });

  it('enters Email before Name to avoid the iOS keyboard occluding lower controls', () => {
    const profile = source('e2e/maestro/synthetic-profile-entry.yaml');
    const emailIndex = profile.indexOf('id: "sidequest-qa-athlete-email"');
    const nameIndex = profile.indexOf('id: "sidequest-qa-athlete-name"');
    expect(emailIndex).toBeGreaterThan(0);
    expect(nameIndex).toBeGreaterThan(emailIndex);
    expect(profile).not.toMatch(/^- hideKeyboard/m);
    // The numeric activity keyboard must also avoid the unreliable dismiss API.
    expect(source('e2e/maestro/synthetic-completed-ride-steps.yaml'))
      .not.toMatch(/^- hideKeyboard/m);
  });

  it('cannot silently bypass an interrupted first-week setup after saving only a goal', () => {
    const onboarding = source('apps/mobile/src/services/onboarding.ts');
    const context = source('apps/mobile/src/state/onboarding-context.tsx');
    const screen = source('apps/mobile/src/app/onboarding.tsx');
    const authLayout = source('apps/mobile/src/app/_layout.tsx');

    const firstRun = onboarding.slice(onboarding.indexOf('export async function evaluateFirstRun('));
    expect(firstRun.indexOf('mustResumeFirstWeekSetup(state)')).toBeGreaterThan(0);
    expect(firstRun.indexOf('mustResumeFirstWeekSetup(state)'))
      .toBeLessThan(firstRun.indexOf('const [goal, completed, calendar, pt]'));
    expect(context).toContain('firstWeekSetupStartedAt: current.firstWeekSetupStartedAt ?? new Date().toISOString()');
    expect(context).toContain('beginFirstWeek,');
    expect(screen).toContain("if (step === 'welcome') beginFirstWeek();");
    expect(authLayout).toContain("OnboardingProvider key={user?.id ?? 'signed-out'}");
    expect(authLayout).toContain('<ScopedOnboardingProvider>');
  });

  it('routes the final native onboarding action using Expo Router params and surfaces failures', () => {
    const onboarding = source('apps/mobile/src/app/onboarding.tsx');
    const finish = onboarding.slice(onboarding.indexOf('function finish()'), onboarding.indexOf('return <AppScreen'));
    expect(finish).toContain("pathname: '/onboarding-first-week'");
    expect(finish).toContain('router.replace({');
    expect(finish).not.toContain('new URLSearchParams(');
    expect(finish).toContain('setNavigationError(');
    expect(onboarding).toContain('First-week navigation error:');
    expect(onboarding).toContain("onPress={step === 'review' ? finish : next}");
  });

  it('keeps the recorded flow targets backed by live accessible controls', () => {
    const cases: Array<[string, string]> = [
      ['apps/mobile/src/app/sign-in.tsx', 'sidequest-qa-athlete-name'],
      ['apps/mobile/src/app/sign-in.tsx', 'sidequest-qa-athlete-email'],
      ['apps/mobile/src/app/sign-in.tsx', 'sidequest-qa-enter-beta'],
      ['apps/mobile/src/app/onboarding.tsx', 'sidequest-qa-onboarding-next'],
      ['apps/mobile/src/app/onboarding-first-week.tsx', 'sidequest-qa-review-first-week'],
      ['apps/mobile/src/app/log-endurance.tsx', 'sidequest-qa-save-endurance'],
    ];
    for (const [path, id] of cases) {
      expect(source(path), path + ' must expose ' + id)
        .toContain('testID="' + id + '"');
    }
  });

  it('reuses the same manual endurance record identity on a failed save retry', () => {
    const sourceText = source('apps/mobile/src/app/log-endurance.tsx');
    expect(sourceText).toContain('const submissionRef = useRef<');
    expect(sourceText).toContain('submissionRef.current = submission;');
    expect(sourceText).toContain('id: submission.id');
    expect(sourceText).toContain('recordedAt: submission.recordedAt');
    expect(sourceText).not.toContain("id: 'manual-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 10),\\n        name:");
  });

  it('prevents signed-out screen effects from writing the previous athlete checkpoint', () => {
    const screen = source('apps/mobile/src/app/active-workout.tsx');
    expect(screen.split("if (!user || !workout || !sessionHydrated || phase === 'complete') return;"))
      .toHaveLength(3);
    expect(screen).toContain("loadLiveWorkoutSession(user?.id ?? null)");
    expect(screen).toContain("clearLiveWorkoutSession(user?.id ?? null)");
    expect(source('apps/mobile/src/services/active-workout-persistence.ts'))
      .toContain("if (profileId === null) return null;");
  });

  it('uses one authoritative PR acceptance workflow without duplicate planner jobs', () => {
    const qa = source('.github/workflows/automated-athlete-acceptance.yml');
    const guardrail = source('.github/workflows/experimental-training-guardrails.yml');
    expect(qa).toContain('pull_request:');
    expect(qa).toContain('- sq2-experience-rebuild');
    expect(qa).toContain("'scripts/qa/**'");
    expect(qa).toContain("'e2e/maestro/**'");
    expect(qa).not.toMatch(/^  push:/m);
    expect(guardrail).not.toMatch(/^  pull_request:/m);
    expect(guardrail).toContain('workflow_dispatch:');
  });

  it('uses one staged native runner and refuses a non-synthetic app identity', () => {
    const runner = source('scripts/qa/run-native-maestro.sh');
    for (const flow of ['profile', 'onboarding', 'ride', 'restart', 'isolation', 'strength']) {
      expect(runner).toMatch(new RegExp('run_flow ' + flow + ' e2e/maestro/'));
    }
    expect(runner).toContain('QA_BUNDLE_ID');
    expect(runner).toContain('com.sidequest.synthetic.qa');
    expect(runner).toContain('MAESTRO_DRIVER_STARTUP_TIMEOUT');
    expect(runner).toContain('360000');
    expect(runner).toContain('99=not run/blocked');
    const script = new URL('../../../scripts/qa/run-native-maestro.sh', import.meta.url);
    const check = spawnSync('bash', ['-n', script.pathname], { encoding: 'utf8' });
    expect(check.status, check.stderr).toBe(0);
    const refused = spawnSync('bash', [script.pathname], {
      encoding: 'utf8',
      env: { ...process.env, MAESTRO_UDID: 'synthetic-do-not-run', QA_BUNDLE_ID: 'com.production.sidequest' },
    });
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('non-synthetic');
  });

  it('fails closed when trying to reuse a stale native binary for updated sources', () => {
    const workflow = source('.github/workflows/native-ios-ui-only.yml');
    const fingerprintScript = source('scripts/qa/native-source-fingerprint.mjs');
    expect(workflow).toContain('diff -u native-binary/native-source.sha256 current-native-source.sha256');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain("'e2e/maestro/*.yaml'");
    expect(workflow).toContain('refusing to test an old binary');
    expect(workflow).toContain('QA_BUNDLE_ID: com.sidequest.synthetic.qa');
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('scripts/qa/run-native-maestro.sh');
    expect(fingerprintScript).toContain("path.startsWith('apps/mobile/src/')");
    expect(fingerprintScript).toContain("path.startsWith('packages/domain/src/')");
    expect(fingerprintScript).toContain("path.startsWith('packages/planner/src/')");
    expect(fingerprintScript).toContain("path.startsWith('packages/exercise-content/data/')");
    expect(fingerprintScript).toContain("path.startsWith('packages/exercise-content/src/')");
    expect(fingerprintScript).toContain("path.startsWith('apps/mobile/assets/')");
    expect(fingerprintScript).toContain('package\\.json');
    expect(fingerprintScript).not.toContain("path.startsWith('e2e/maestro/')");
    const full = source('.github/workflows/native-ios-simulator-smoke.yml');
    expect(full).toContain("packages/exercise-content/data/**");
    expect(full).toContain("packages/exercise-content/src/**");
    expect(full).toContain("packages/*/package.json");
    const fingerprintPath = new URL('../../../scripts/qa/native-source-fingerprint.mjs', import.meta.url);
    const first = spawnSync(process.execPath, [fingerprintPath.pathname], {
      cwd: new URL('../../../', import.meta.url).pathname, encoding: 'utf8',
    });
    const second = spawnSync(process.execPath, [fingerprintPath.pathname], {
      cwd: new URL('../../../', import.meta.url).pathname, encoding: 'utf8',
    });
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout.trim()).toMatch(/^[a-f0-9]{64}$/);
    expect(second.stdout).toBe(first.stdout);
  });

  it('scrolls onboarding using the visible native button ID rather than hidden child text', () => {
    const flow = source('e2e/maestro/synthetic-onboarding-steps.yaml');
    expect(flow).not.toContain('element: "Continue"');
    expect(flow).not.toContain('element: "Build my first week"');
    const scrolls = [...flow.matchAll(/- scrollUntilVisible:\n    element:\n      id: "sidequest-qa-onboarding-next"\n    direction: DOWN\n    visibilityPercentage: 50/g)];
    expect(scrolls.length).toBeGreaterThanOrEqual(6);
    expect(flow).toContain('id: "sidequest-qa-review-first-week"');
    expect(flow).toContain('retryTapIfNoChange: true');
    expect(flow).toContain('takeScreenshot: "synthetic-before-first-week-build"');
    // Native hierarchy includes the arrow in "Build my first week, ›":
    // an exact nested Text selector failed even though the Pressable was visible.
    expect(flow).not.toContain('text: "Build my first week"');
    expect(flow).toContain([
      '- assertVisible:',
      '    id: "sidequest-qa-onboarding-next"',
      '- takeScreenshot: "synthetic-before-first-week-build"',
      '- tapOn:',
      '    id: "sidequest-qa-onboarding-next"',
    ].join('\n'));
    expect(flow).toContain('notVisible: "Ready to build."');
    expect(flow).toContain('timeout: 15000');
    expect(source('apps/mobile/src/app/onboarding.tsx'))
      .toContain('testID="sidequest-qa-onboarding-next"');
  });

  it('requires nested journeys to point at committed sibling flows', () => {
    const flowNames = [
      'synthetic-profile-entry.yaml',
      'synthetic-onboarding-first-week.yaml',
      'synthetic-completed-ride.yaml',
      'synthetic-ride-restart.yaml',
      'synthetic-onboarding-steps.yaml',
      'synthetic-completed-ride-steps.yaml',
      'synthetic-ride-restart-steps.yaml',
      'synthetic-athlete-isolation-steps.yaml',
      'synthetic-strength-restart-steps.yaml',
    ];
    for (const name of flowNames) {
      const path = 'e2e/maestro/' + name;
      expect(present(path), path).toBe(true);
      const value = source(path);
      expect(value).toMatch(/^appId: com\.sidequest\.synthetic\.qa/m);
      expect(value).toMatch(/^---$/m);
      for (const match of value.matchAll(/^- runFlow:\s*([^\s]+)$/gm)) {
        expect(present('e2e/maestro/' + match[1]), name + ' calls ' + match[1]).toBe(true);
        expect(match[1]).not.toBe(name);
      }
    }
  });

  it('keeps first-week retries scoped to the verified athlete and render attempt', () => {
    const screen = source('apps/mobile/src/app/onboarding-first-week.tsx');
    const db = source('apps/mobile/src/services/database.ts');
    expect(screen).toContain("buildFirstWeek(params, exercises, { weekStartDate, seed, referenceDate }, athleteId)");
    expect(screen).toContain("await withVerifiedAthleteDatabase(athleteId, async () => {");
    expect(screen).toContain("const evidence = await withVerifiedAthleteDatabase(athleteId, async () => {");
    expect(screen).toContain('resultAttemptKey !== expectedAttemptKey');
    expect(screen).toContain('currentAttempt.current === attemptNumber');
    expect(screen).toContain('setRetryAttempt((current) => current + 1)');
    expect(screen).toContain('testID="sidequest-qa-retry-first-week"');
    expect(db).toContain('export async function withVerifiedAthleteDatabase<T>');
    expect(db).toContain('runWithDatabaseActivationLock');
  });

  it('exercises A-to-B-to-A native history isolation without deleting the original athlete data', () => {
    const isolation = source('e2e/maestro/synthetic-athlete-isolation-steps.yaml');
    const runner = source('scripts/qa/run-native-maestro.sh');
    const diagnostic = source('scripts/qa/diagnose-native-evidence.mjs');
    expect(isolation).toContain('synthetic-other-athlete@example.invalid');
    expect(isolation).toContain('synthetic-athlete@example.invalid');
    expect(isolation).toContain('runFlow: synthetic-onboarding-steps.yaml');
    expect(isolation).toContain('assertVisible: "No training records yet"');
    expect(isolation).toContain('assertNotVisible: "Review Completed bike activity"');
    expect(isolation).toContain('assertVisible: "Review Completed bike activity"');
    expect(isolation).toContain('visible: "75 minutes.*"');
    expect(isolation).toContain('synthetic-a-ride-preserved-across-account-switch');
    expect(isolation.match(/centerElement: true/g)?.length).toBeGreaterThanOrEqual(4);
    expect(runner).toContain('run_flow isolation e2e/maestro/synthetic-athlete-isolation-steps.yaml');
    expect(runner).toContain('"isolation=$isolation"');
    expect(diagnostic).toContain("'restart', 'isolation', 'strength'");
  });

  it('does not report full planned work after partial completion and requires a durable Leave save', () => {
    const screen = source('apps/mobile/src/app/active-workout.tsx');
    const ledger = source('apps/mobile/src/services/database.ts');
    expect(screen).toContain("completedWorkoutSeconds(totalPlannedSeconds, completionFractionRef.current)");
    expect(screen).toContain('await withVerifiedAthleteDatabase(athleteId, async () => {');
    expect(screen).toContain('await saveCompletedWorkout({');
    expect(screen).toContain('PARTIAL WORKOUT');
    expect(screen).toContain('Paused time is not counted.');
    expect(screen).toContain('await saveLiveWorkoutSession({');
    expect(screen).toContain("setPauseSaveError(error instanceof Error");
    expect(screen).toContain('disabled={pauseSaveBusy}');
    expect(ledger).toContain('completionFraction < 1 ? [] : [{');
  });

  it('navigates cross-athlete native journeys through stable tabs, not back-stack assumptions', () => {
    const isolation = source('e2e/maestro/synthetic-athlete-isolation-steps.yaml');
    const strength = source('e2e/maestro/synthetic-strength-restart-steps.yaml');
    expect(isolation).toContain('visible: "Go back"');
    expect(isolation).toContain('id: "sidequest-qa-profile-tab"');
    expect(isolation).toContain('id: "sidequest-qa-train-tab"');
    const bEmpty = isolation.indexOf('assertVisible: "No training records yet"');
    const leaveBHistory = isolation.indexOf('- tapOn: "Go back"', bEmpty);
    const backToProfile = isolation.indexOf('id: "sidequest-qa-profile-tab"', leaveBHistory);
    expect(bEmpty).toBeGreaterThan(0);
    expect(leaveBHistory).toBeGreaterThan(bEmpty);
    expect(backToProfile).toBeGreaterThan(leaveBHistory);
    const first = isolation.indexOf('- tapOn:');
    expect(isolation.slice(first, first + 75)).toContain('sidequest-qa-profile-tab');
    expect(strength).toContain('id: "sidequest-qa-train-tab"');
    expect(strength.split('---')[1]?.split('id: "sidequest-qa-train-tab"')[0])
      .not.toContain('tapOn: "Go back"');
  });

  it('provides an actual Today/Train workout resume affordance after force-quit', () => {
    const today = source('apps/mobile/src/app/(tabs)/index.tsx');
    const train = source('apps/mobile/src/app/(tabs)/train.tsx');
    const card = source('apps/mobile/src/components/active-workout-resume-card.tsx');
    const ui = source('apps/mobile/src/components/v23-ui.tsx');
    const flow = source('e2e/maestro/synthetic-strength-restart-steps.yaml');
    const runner = source('scripts/qa/run-native-maestro.sh');

    for (const page of [today, train]) {
      expect(page).toContain('<ActiveWorkoutResumeCard');
      expect(page).toContain('workoutSessionReady && activeWorkout');
      expect(page).toContain("router.push('/active-workout' as Href)");
    }
    expect(card).toContain('testID="sidequest-qa-resume-active-workout"');
    expect(ui).toContain('testID={testID}');
    expect(flow).toContain('id: "sidequest-qa-quick-workout"');
    expect(flow).not.toContain('- tapOn: "Quick workout"');
    expect(source('apps/mobile/src/app/(tabs)/train.tsx'))
      .toContain('testID="sidequest-qa-quick-workout"');
    expect(flow).toContain('stopApp');
    expect(flow).toContain('launchApp');
    expect(flow).toContain('id: "sidequest-qa-resume-active-workout"');
    expect(flow).toContain('Save partial');
    expect(flow).toContain('element: "Start workout, play"');
    expect(flow).toContain('tapOn: "Start workout, play"');
    expect(flow).not.toContain('element: "Start workout"');
    expect(flow).not.toContain('- tapOn: "Start workout"');
    expect(flow).toContain('element: "Finish station"');
    expect(flow).toContain('tapOn: "Finish station"');
    expect(flow.match(/- tapOn: "Leave"/g)).toHaveLength(1);
    expect(flow).toContain('visible: "Recover and record"');
    expect(flow).toContain('assertVisible: "Open .* strength workout, [1-9][0-9]? percent completed"');
    expect(flow).toContain('assertNotVisible: "Open .* strength workout, 100 percent completed"');
    expect(source('apps/mobile/src/app/training-history.tsx'))
      .toContain('percent completed');
    expect(flow).toContain('assertNotVisible: "100% completed"');
    expect(runner).toContain('run_flow strength e2e/maestro/synthetic-strength-restart-steps.yaml');
  });

  it('keeps the History link tappable and native restart navigation occlusion-safe', () => {
    const week = source('apps/mobile/src/app/(tabs)/plan.tsx');
    const historyId = 'sidequest-qa-open-training-history';
    const link = week.indexOf('testID="' + historyId + '"');
    const review = week.indexOf('Review recorded training and the week');
    const otherActions = week.indexOf('Preview training-plan changes');
    expect(link).toBeGreaterThan(0);
    expect(link).toBeLessThan(review);
    expect(link).toBeLessThan(otherActions);
    expect(week).toContain("router.push('/training-history' as Href)");

    const restart = source('e2e/maestro/synthetic-ride-restart-steps.yaml');
    expect(restart).toContain('id: "' + historyId + '"');
    expect(restart).toContain('centerElement: true');
    expect(restart).toContain('takeScreenshot: "synthetic-history-link-before-tap"');
    expect(restart).toContain('- tapOn: "Review Completed bike activity"');
    expect(restart).toContain('- assertNotVisible: "Training evidence this week"');
    expect(restart).toContain('assertVisible: "Review Completed bike activity"');
    expect(restart).toContain('visible: "75 minutes.*"');
    expect(restart).not.toContain('- tapOn: "Inspect full training history"');
  });

  it('runs exactly one synthetic athlete from onboarding through restart', () => {
    const wrapperPairs: Array<[string, string, string]> = [
      ['synthetic-onboarding-first-week.yaml', 'synthetic-profile-entry.yaml', 'synthetic-onboarding-steps.yaml'],
      ['synthetic-completed-ride.yaml', 'synthetic-onboarding-first-week.yaml', 'synthetic-completed-ride-steps.yaml'],
      ['synthetic-ride-restart.yaml', 'synthetic-completed-ride.yaml', 'synthetic-ride-restart-steps.yaml'],
    ];
    for (const [wrapper, predecessor, stage] of wrapperPairs) {
      const value = source('e2e/maestro/' + wrapper);
      expect(value).toContain('- runFlow: ' + predecessor);
      expect(value).toContain('- runFlow: ' + stage);
      expect(source('e2e/maestro/' + stage)).not.toMatch(/^- runFlow:/m);
    }
    const runner = source('scripts/qa/run-native-maestro.sh');
    expect(runner).toContain('staged synthetic account and workout lifecycle');
    const onboarding = source('e2e/maestro/synthetic-onboarding-steps.yaml');
    expect(onboarding).toContain('- launchApp');
    expect(onboarding).toContain('retryTapIfNoChange: true');
    expect(onboarding).toContain('visible: "Build your first week."');
    const ride = source('e2e/maestro/synthetic-completed-ride-steps.yaml');
    expect(ride).toContain('- launchApp');
    expect(ride).toContain('id: "sidequest-qa-week-tab"');
    expect(source('apps/mobile/src/app/(tabs)/_layout.tsx'))
      .toContain("tabBarButtonTestID: 'sidequest-qa-week-tab'");
    const restart = source('e2e/maestro/synthetic-ride-restart-steps.yaml');
    // Native inspection showed the labels include trailing intensity context.
    expect(ride).toContain('assertVisible: "75 minutes.*"');
    expect(restart).toContain('assertVisible: "Review Completed bike activity"');
    expect(restart).toContain('visible: "75 minutes.*"');
    expect(ride).toContain('takeScreenshot: "synthetic-completed-ride-review"');
    expect(restart).toContain('stopApp');
    expect(restart).toContain('launchApp');
    // Native accessibility labels vary with iOS versions; the test ID does not.
    expect(restart).toContain('id: "sidequest-qa-week-tab"');
    expect(restart).not.toContain('text: "Week, tab, .*"');
    expect(restart).toContain('retryTapIfNoChange: true');
    expect(restart).not.toContain('- tapOn: "Week"');
  });


  it('uses deterministic Today/Week/Train tab IDs across native navigation', () => {
    const tabs = source('apps/mobile/src/app/(tabs)/_layout.tsx');
    for (const id of ['sidequest-qa-today-tab','sidequest-qa-week-tab','sidequest-qa-train-tab']) {
      expect(tabs).toContain("tabBarButtonTestID: '" + id + "'");
    }
    for (const flow of ['synthetic-completed-ride-steps.yaml','synthetic-ride-restart-steps.yaml']) {
      const script = source('e2e/maestro/' + flow);
      expect(script).toContain('id: "sidequest-qa-week-tab"');
      expect(script).not.toContain('- tapOn: "Week"');
    }
  });

  it('records native screenshots and uploads failure evidence', () => {
    const workflow = source('.github/workflows/native-ios-simulator-smoke.yml');
    expect(workflow).toContain('synthetic-ios-first-launch.png');
    expect(workflow).toContain('maestro-evidence/');
    expect(workflow).toContain('if: always()');
    const runner = source('scripts/qa/run-native-maestro.sh');
    expect(workflow).toContain('MAESTRO_UDID:');
    expect(workflow).toContain('bash scripts/qa/run-native-maestro.sh');
    expect(workflow).toContain('name: sidequest-synthetic-ios-app');
    expect(workflow).toContain('native-source.sha256');
    expect(runner).toContain('${label}-junit.xml');
    expect(runner).toContain('run_flow profile e2e/maestro/synthetic-profile-entry.yaml');
    expect(runner).toContain('run_flow onboarding e2e/maestro/synthetic-onboarding-steps.yaml');
    expect(runner).toContain('run_flow ride e2e/maestro/synthetic-completed-ride-steps.yaml');
    expect(runner).toContain('run_flow restart e2e/maestro/synthetic-ride-restart-steps.yaml');
    expect(runner).not.toContain('run_flow ride e2e/maestro/synthetic-completed-ride.yaml');
    expect(runner).toContain('exit 1');
    expect(runner).toContain('diagnostics=$?');
    expect(runner).toContain('NATIVE_QA_SCOPE');
    expect(runner).toContain('if [[ "$scope" == "strength" ]]');
    expect(runner).toContain('run_flow strength e2e/maestro/synthetic-strength-restart-steps.yaml');
    const focused = source('.github/workflows/native-ios-ui-only.yml');
    expect(focused).toContain('["isolation","strength"]');
    expect(focused).toContain('NATIVE_QA_SCOPE:');
    expect(focused).toContain('for ATTEMPT in 1 2 3 4');
    expect(focused).toContain('diff -u native-binary/native-source.sha256 current-native-source.sha256');
    expect(runner).toContain('scripts/qa/native-driver-retry.mjs');
    expect(runner).toContain('driver-attempt1-junit.xml');
    expect(runner).toContain('driver-attempt1-console.log');
    expect(runner).toContain('"$diagnostics" -ne 0');
    expect(source('scripts/qa/diagnose-native-evidence.mjs'))
      .toContain('if (!report.allPassed) process.exitCode = 1;');
  });
});
