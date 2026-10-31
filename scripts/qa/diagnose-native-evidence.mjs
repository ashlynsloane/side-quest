import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'maestro-evidence';
const stages = ['profile', 'onboarding', 'ride', 'restart'];
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
const report = { schemaVersion: 1, stages: [], allPassed: true };
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
    if (!Number.isFinite(total) || total < 1 || /<\/testsuite>/.test(xml) === false) {
      status = 'INVALID_REPORT';
    } else if (failures > 0 || errors > 0 || /<failure(?:\s|>)/.test(xml)) {
      status = 'FAILED';
      const match = xml.match(/<failure(?:\s[^>]*)?>([\s\S]*?)<\/failure>/);
      failure = match ? escaped(match[1]).trim().slice(0, 300) : 'Native assertion failed';
    } else {
      status = 'PASSED';
    }
  } else if (/BLOCKED|blocked|prerequisite/i.test(log)) {
    status = 'BLOCKED';
  } else if (log.trim()) {
    status = 'NO_REPORT';
  }
  if (status !== 'PASSED') report.allPassed = false;
  const diagnosis = stage === 'profile' && status === 'FAILED' ? profileDiagnostic() : null;
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
  '**All four native journeys verified: ' + (report.allPassed ? 'YES' : 'NO') + '**',
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines);
else process.stdout.write(lines);
