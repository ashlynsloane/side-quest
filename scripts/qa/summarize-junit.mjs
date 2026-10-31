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
  if (suiteTags.length === 0) {
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
  if (result.tests === 0) {
    result.status = 'ZERO_TESTS';
    report.status = 'INCOMPLETE';
  } else if (result.failures || result.errors) {
    result.status = 'FAIL';
    report.status = 'FAIL';
  }
  report.files.push(result);
  for (const key of Object.keys(report.totals)) {
    report.totals[key] += result[key];
  }
}
writeFileSync('qa-summary.json', JSON.stringify(report, null, 2) + '\n');
const markdown = [
  '## Side Quest automated athlete QA',
  '',
  '| Suite | Result | Tests | Failures | Errors | Skipped |',
  '| --- | --- | ---: | ---: | ---: | ---: |',
  ...report.files.map(f => '| ' + f.file + ' | ' + f.status + ' | ' +
    [f.tests ?? '-', f.failures ?? '-', f.errors ?? '-', f.skipped ?? '-'].join(' | ') + ' |'),
  '',
  '**Aggregate status: ' + report.status + '**. This covers Node/planner tests only, not native iOS behavior.',
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
} else {
  process.stdout.write(markdown);
}
