import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'maestro-evidence';
const stages = ['profile', 'onboarding', 'ride', 'restart', 'isolation', 'strength', 'live-isolation', 'owner-recovery', 'generation-isolation', 'completion-kill-before', 'completion-kill-after', 'completion-in-transaction-before', 'completion-in-transaction-after'];
const scopes = Object.freeze({
  full: stages.filter((stage) => !['live-isolation', 'owner-recovery', 'generation-isolation', 'completion-kill-before', 'completion-kill-after', 'completion-in-transaction-before', 'completion-in-transaction-after'].includes(stage)), 
  isolation: stages.filter((stage) => !['strength', 'live-isolation', 'owner-recovery', 'generation-isolation', 'completion-kill-before', 'completion-kill-after', 'completion-in-transaction-before', 'completion-in-transaction-after'].includes(stage)), 
  strength: ['profile', 'onboarding', 'strength'],
  'live-isolation': ['profile', 'onboarding', 'live-isolation'],
  'owner-recovery': ['profile', 'onboarding', 'owner-recovery'],
  'generation-isolation': ['profile', 'generation-isolation'],
  'completion-kill': ['profile', 'onboarding', 'completion-kill-before', 'completion-kill-after'],
  'completion-in-transaction-kill': ['profile', 'onboarding', 'completion-in-transaction-before', 'completion-in-transaction-after'],
});
const scope = process.env.NATIVE_QA_SCOPE ?? 'full';
// An invalid or empty scope must never turn failed tests into success.
if (!Object.hasOwn(scopes, scope)) throw new Error('Invalid native acceptance scope.');
const required = new Set(scopes[scope]);
const escaped = (s) => s.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) =>
  ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity]);
function recurse(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const full = join(path, entry.name);
    return entry.isDirectory() ? recurse(full) : [full];
  });
}
function attr(xml, key) {
  const match = xml.match(new RegExp('\\b' + key + '="([^"]*)"'));
  return match?.[1];
}
function inspectHierarchy(node, hits) {
  if (!node || typeof node !== 'object') return;
  const attrs = node.attributes;
  if (attrs && typeof attrs === 'object') {
    const id = attrs['resource-id'];
    if (id === 'sidequest-qa-athlete-name' || id === 'sidequest-qa-athlete-email'
      || id === 'sidequest-qa-enter-beta') {
      hits[id] = { hasEmailString: /@/.test(String(attrs.value ?? attrs.text ?? '')),
        isEmpty: !String(attrs.value ?? attrs.text ?? '').trim(),
        enabled: attrs.enabled === 'true' };
    }
  }
  for (const child of node.children ?? []) inspectHierarchy(child, hits);
}
function profileDiagnostic() {
  const files = recurse(join(root, 'profile')).filter((p) =>
    p.includes('screen-hierarchy') && p.endsWith('.json')).sort();
  for (const path of files.reverse()) {
    try {
      const hits = {};
      inspectHierarchy(JSON.parse(readFileSync(path, 'utf8')), hits);
      const name = hits['sidequest-qa-athlete-name'];
      const email = hits['sidequest-qa-athlete-email'];
      const enter = hits['sidequest-qa-enter-beta'];
      if (name?.hasEmailString && email?.isEmpty && enter?.enabled === false) {
        return 'Email text remained in Name; Email was blank and Enter beta disabled (keyboard-focus leak).';
      }
    } catch {
      // An unreadable diagnostic artifact is not application evidence.
    }
  }
  return null;
}
// Classify what the application actually displayed when the onboarding
// assertion failed. Never publish raw accessibility values or athlete inputs.
function onboardingDiagnostic() {
  const files = recurse(join(root, 'onboarding')).filter((p) =>
    p.includes('screen-hierarchy') && p.endsWith('.json')).sort().reverse();
  for (const path of files) {
    try {
      const texts = new Set();
      let nextEnabled = false;
      function visit(node) {
        if (!node || typeof node !== 'object') return;
        const attrs = node.attributes ?? {};
        const label = String(attrs.accessibilityText ?? '');
        if (label) texts.add(label);
        if (attrs['resource-id'] === 'sidequest-qa-onboarding-next'
          && attrs.enabled === 'true') nextEnabled = true;
        for (const child of node.children ?? []) visit(child);
      }
      visit(JSON.parse(readFileSync(path, 'utf8')));
      if ([...texts].some((t) => t.includes('First-week navigation error:'))) {
        return 'Native first-week route threw a navigation exception; inspect the app-level error on the captured screenshot.';
      }
      if (texts.has('Ready to build.') && nextEnabled) {
        return 'Final Build my first week button remained enabled on the last questionnaire screen after being tapped; route did not advance.';
      }
      if (texts.has('Making the first draft.')) {
        return 'App entered first-week generation but did not reach a completed or recoverable error state before timeout.';
      }
      if (texts.has('The week needs one more review.')) {
        return 'App reached the first-week generation error state; inspect its visible error without publishing athlete inputs.';
      }
    } catch {
      // Preserve the original JUnit failure when hierarchy is incomplete.
    }
  }
  return null;
}
function visibleStageLabels(stage) {
  const files = recurse(join(root, stage)).filter((p) =>
    p.includes('screen-hierarchy') && p.endsWith('.json')).sort().reverse();
  for (const path of files) {
    try {
      const labels = [];
      function visit(node) {
        if (!node || typeof node !== 'object') return;
        const label = node.attributes?.accessibilityText;
        if (typeof label === 'string') labels.push(label);
        for (const child of node.children ?? []) visit(child);
      }
      visit(JSON.parse(readFileSync(path, 'utf8')));
      if (labels.length) return labels;
    } catch {
      // Partial hierarchy is not proof of a successful athlete journey.
    }
  }
  return [];
}

function boundingBox(value) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(String(value ?? ''));
  if (!match) return null;
  return { left: Number(match[1]), top: Number(match[2]),
    right: Number(match[3]), bottom: Number(match[4]) };
}

/**
 * The native November 10 restart failure happened before History navigation.
 * Maestro matched the link by accessibility label at y=828, directly behind
 * the bottom Week tab at y=807–864. The tap was intercepted; it was NOT
 * evidence that an endurance record had disappeared from SQLite.
 */
function restartHistoryOcclusionDiagnostic(failure) {
  if (!/Training history.*visible/i.test(String(failure ?? ''))) return null;
  const files = recurse(join(root, 'restart')).filter((p) =>
    p.includes('screen-hierarchy') && p.endsWith('.json')).sort().reverse();
  for (const path of files) {
    try {
      const nodes = [];
      function visit(node) {
        if (!node || typeof node !== 'object') return;
        const attrs = node.attributes ?? {};
        if (attrs.accessibilityText || attrs['resource-id']) nodes.push({
          label: String(attrs.accessibilityText ?? ''),
          id: String(attrs['resource-id'] ?? ''),
          box: boundingBox(attrs.bounds),
        });
        for (const child of node.children ?? []) visit(child);
      }
      visit(JSON.parse(readFileSync(path, 'utf8')));
      const history = nodes.find((node) =>
        node.label === 'Inspect full training history' && node.box);
      const tabs = nodes.filter((node) =>
        /^sidequest-qa-(today|week|train)-tab$/.test(node.id) && node.box);
      if (!history || !tabs.length) continue;
      const tabTop = Math.min(...tabs.map((node) => node.box.top));
      const tabBottom = Math.max(...tabs.map((node) => node.box.bottom));
      if (history.box.top >= tabTop && history.box.top < tabBottom) {
        return 'History link was under the bottom navigation bar; the tap stayed on Week. Actual record persistence after restart is unverified.';
      }
    } catch {
      // Artifact parsing must never turn a failed scenario into a pass.
    }
  }
  return null;
}

function nativeStageDiagnostic(stage, failure) {
  if (stage !== 'ride' && stage !== 'restart') return null;
  const labels = visibleStageLabels(stage);
  if (stage === 'restart') {
    const occluded = restartHistoryOcclusionDiagnostic(failure);
    if (occluded) return occluded;
  }
  // A cold restart can correctly restore Today while Maestro fails to match
  // the short "Week" selector. The native tab label includes position/role.
  if (stage === 'restart' && /Text matching regex: Week/.test(String(failure ?? ''))
      && labels.some((label) => /^Week, tab, [0-9]+ of [0-9]+$/.test(label))
      && labels.includes('TODAY')) {
    return 'Cold restart restored the Today screen and Week tab; the short selector did not match the composite accessibility tab label.';
  }
  const expected = stage === 'ride' ? '75 minutes' : '75 min';
  if (!String(failure ?? '').includes(expected)) return null;
  if (!labels.includes('Completed bike')) return null;
  const exact = labels.find((label) => label.startsWith(expected + ' ·'));
  return exact
    ? 'Saved bike and 75-minute dose are visible; exact-text assertion ignored the composite native accessibility label.'
    : null;
}
const report = { schemaVersion: 1, scope, requiredStages: [...required], stages: [], allPassed: true };
for (const stage of stages) {
  const junitPath = join(root, stage + '-junit.xml');
  const consolePath = join(root, stage + '-console.log');
  const log = existsSync(consolePath) ? readFileSync(consolePath, 'utf8') : '';
  let status = 'NOT_RUN';
  let failure = null;
  if (existsSync(junitPath)) {
    const xml = readFileSync(junitPath, 'utf8');
    const suite = xml.match(/<testsuite\b[^>]*>/)?.[0];
    const total = Number(suite ? attr(suite, 'tests') : NaN);
    const failures = Number(suite ? attr(suite, 'failures') ?? 0 : NaN);
    const errors = Number(suite ? attr(suite, 'errors') ?? 0 : NaN);
    const skipped = Number(suite ? attr(suite, 'skipped') ?? 0 : NaN);
    const cases = (xml.match(/<testcase(?:\s|>)/g) ?? []).length;
    // Never count a missing/empty/aborted or skipped Maestro scenario as
    // real native evidence. Passing JUnit requires an executed test case;
    // a zero-failure suite with no assertion executed is not acceptance.
    if (!Number.isInteger(total) || total < 1
      || !Number.isInteger(cases) || cases !== total
      || !Number.isInteger(skipped) || skipped > 0
      || /<skipped(?:\s|>|\/)/.test(xml)
      || /<\/testsuite>/.test(xml) === false) {
      status = 'INVALID_REPORT';
      failure = 'Native JUnit missing, skipped or inconsistent test execution; no passing evidence.';
    } else if (failures > 0 || errors > 0 || /<failure(?:\s|>|\/)/.test(xml) || /<error(?:\s|>|\/)/.test(xml)) {
      status = 'FAILED';
      const match = xml.match(/<failure(?:\s[^>]*)?>([\s\S]*?)<\/failure>/);
      failure = match ? escaped(match[1]).trim().slice(0, 300) : 'Native assertion failed';
    } else {
      status = 'PASSED';
    }
  } else if (/iOS driver not ready in time|IOSDriverTimeoutException/.test(log)) {
    // No user-journey assertion was attempted: the CI XCTest transport failed.
    status = 'DRIVER_STARTUP_TIMEOUT';
    failure = 'Maestro XCTest driver failed to start; no app interaction was evaluated.';
  } else if (/BLOCKED|blocked|prerequisite/i.test(log)) {
    status = 'BLOCKED';
  } else if (log.trim()) {
    status = 'NO_REPORT';
  }
  // A post-Maestro SQLite integrity failure must override passing UI JUnit.
  // Otherwise the app could claim successful recovery while silently losing
  // historical training records or adopting the wrong profile.
  if (stage === 'owner-recovery' && required.has(stage)
      && /POSTCONDITION FAILED/.test(log)) {
    status = 'FAILED';
    failure = 'Synthetic owner mismatch or existing training records did not survive restart/retry.';
  }
  if (stage === 'generation-isolation' && required.has(stage)
      && /POSTCONDITION FAILED/.test(log)) {
    status = 'FAILED';
    failure = 'Old athlete generated plan or owner validation failed after A-to-B profile switch.';
  }
  if ((stage.startsWith('completion-kill-') || stage.startsWith('completion-in-transaction-')) && required.has(stage)
      && /POSTCONDITION FAILED/.test(log)) {
    status = 'FAILED';
    failure = 'Native SIGKILL was not confirmed, or the original partial completion did not survive SQLite recovery.';
  }
  if (!required.has(stage)) {
    // This journey was intentionally excluded, never a passing assertion.
    status = 'NOT_REQUIRED';
    failure = null;
  } else if (status !== 'PASSED') report.allPassed = false;
  const diagnosis = status !== 'FAILED' ? null
    : stage === 'profile' ? profileDiagnostic()
      : stage === 'onboarding' ? onboardingDiagnostic()
        : nativeStageDiagnostic(stage, failure);
  report.stages.push({ stage, status, failure, diagnosis });
}
const output = join(root, 'native-ui-summary.json');
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
const lines = [
  '## Side Quest native iOS acceptance',
  '',
  '| Stage | Result | Diagnosis |',
  '| --- | --- | --- |',
  ...report.stages.map((stage) =>
    '| ' + stage.stage + ' | ' + stage.status + ' | ' +
      (stage.diagnosis ?? stage.failure ?? '').replaceAll('|', ' ').replaceAll('\n', ' ').slice(0, 180) + ' |'),
  '',
  '**All required ' + scope + ' native stages verified: ' + (report.allPassed ? 'YES' : 'NO') + '**',
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines);
else process.stdout.write(lines);
// The native gate must be executable, not just a descriptive report.
// Even a zero-exit Maestro process cannot qualify an incomplete/skipped
// or corrupt JUnit file as passing evidence.
if (!report.allPassed) process.exitCode = 1;
