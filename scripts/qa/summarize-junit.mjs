import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const filenames = process.argv.slice(2);
if (!filenames.length) {
  console.error('Usage: node summarize-junit.mjs FILE.xml [FILE.xml...]');
  process.exit(2);
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? 'local',
  runId: process.env.GITHUB_RUN_ID ?? null,
  files: [],
  totals: { tests: 0, failures: 0, errors: 0, skipped: 0 },
  status: 'PASS',
};
for (const filename of filenames) {
  if (!existsSync(filename)) {
    report.files.push({ file: filename, status: 'MISSING' });
    report.status = 'INCOMPLETE';
    continue;
  }
  const xml = readFileSync(filename, 'utf8');
  const suiteTags = [...xml.matchAll(/<testsuite\b[^>]*>/g)].map(m => m[0]);
  const closedSuites = [...xml.matchAll(/<\/testsuite\s*>/g)].length;
  if (suiteTags.length === 0 || closedSuites !== suiteTags.length) {
    report.files.push({ file: filename, status: 'INVALID_XML_OR_EMPTY' });
    report.status = 'INCOMPLETE';
    continue;
  }
  const result = { file: filename, status: 'PASS', tests: 0, failures: 0, errors: 0, skipped: 0 };
  for (const tag of suiteTags) {
    const attrs = attributes(tag);
    for (const field of ['tests', 'failures', 'errors', 'skipped']) {
      const value = Number(attrs[field] ?? 0);
      if (!Number.isInteger(value) || value < 0) {
        result.status = 'INVALID_COUNTS';
        report.status = 'INCOMPLETE';
        break;
      }
      result[field] += value;
    }
  }
  if (result.tests === 0 || result.tests <= result.skipped) {
    result.status = result.tests === 0 ? 'ZERO_TESTS' : 'NO_EXECUTED_TESTS';
    report.status = 'INCOMPLETE';
  } else if (result.failures || result.errors) {
    result.status = 'FAIL';
    report.status = 'FAIL';
  }
  // The XML attributes must not claim success when testcase elements report
  // a failure or error. Treat discordant evidence as a failed release gate.
  if ((/<failure(?:\s|>)/.test(xml) && result.failures === 0)
    || (/<error(?:\s|>)/.test(xml) && result.errors === 0)) {
    result.status = 'INCONSISTENT_XML_FAILURES';
    report.status = 'FAIL';
  }
  report.files.push(result);
  for (const key of Object.keys(report.totals)) {
    report.totals[key] += result[key];
  }
}
const gateDefinitions = [
  ['QA_PLANNER_TYPECHECK', 'Planner typecheck'],
  ['QA_MOBILE_TYPECHECK', 'Mobile typecheck'],
  ['QA_SYNTHETIC_SUITE', 'Synthetic athlete suite'],
  ['QA_MOBILE_SQL_SUITE', 'Actual mobile SQLite suite'],
  ['QA_FULL_PLANNER', 'Full planner regression'],
  ['QA_IOS_JS_EXPORT', 'iOS JavaScript export (not native runtime)'],
];
const gates = gateDefinitions
  .filter(([key]) => process.env[key] !== undefined)
  .map(([key, label]) => ({ label, outcome: process.env[key] }));
report.gates = gates;
for (const gate of gates) {
  if (gate.outcome === 'failure' || gate.outcome === 'cancelled') {
    report.status = 'FAIL';
  } else if (gate.outcome !== 'success' && report.status === 'PASS') {
    report.status = 'INCOMPLETE';
  }
}

// The full regression run already contains the named acceptance suites.
// Do not inflate the count by summing overlapping runs.
const completePlanner = report.files.find(f => f.file === 'planner-regression-junit.xml');
report.uniquePlannerTests = completePlanner?.status === 'PASS'
  ? { tests: completePlanner.tests, failures: completePlanner.failures,
      errors: completePlanner.errors, skipped: completePlanner.skipped }
  : null;
writeFileSync('qa-summary.json', JSON.stringify(report, null, 2) + '\n');
const markdown = [
  '## Side Quest automated athlete QA',
  '',
  '| Suite | Result | Tests | Failures | Errors | Skipped |',
  '| --- | --- | ---: | ---: | ---: | ---: |',
  ...report.files.map(f => '| ' + f.file + ' | ' + f.status + ' | ' +
    [f.tests ?? '-', f.failures ?? '-', f.errors ?? '-', f.skipped ?? '-'].join(' | ') + ' |'),
  '',
  '| CI gate | Outcome |',
  '| --- | --- |',
  ...report.gates.map(g => '| ' + g.label + ' | ' + g.outcome + ' |'),
  '',
  '**Aggregate status: ' + report.status + '**. Full regression is the unique planner test count; named suites are repeated within it. These outcomes do not prove native iOS behavior.',
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
} else {
  process.stdout.write(markdown);
}

if (report.status !== 'PASS') {
  console.error('QA gate is not passing: ' + report.status);
  process.exitCode = 1;
}
