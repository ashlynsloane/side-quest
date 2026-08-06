import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function requireText(source, text, label) {
  if (!source.includes(text)) failures.push(`Missing ${label}`);
}

const service = read('apps/mobile/src/services/training-history.ts');
const screen = read('apps/mobile/src/app/training-history.tsx');
const progress = read('apps/mobile/src/app/(tabs)/library.tsx');
const app = JSON.parse(read('apps/mobile/app.json') || '{}');
const mobilePackage = JSON.parse(read('apps/mobile/package.json') || '{}');

requireText(service, "candidate.status === 'linked'", 'linked sensor collapse');
requireText(service, 'linkedActivityIds.has(activity.id)', 'duplicate-record exclusion');
requireText(service, "filter === 'review'", 'needs-review filter');
requireText(service, "activity.discipline === 'strength'", 'external strength review handling');
requireText(screen, 'counted once', 'single-record explanation');
requireText(screen, 'Exercises, sets, and regional strength credit come from Side Quest.', 'direct-strength boundary');
requireText(screen, 'Needs review', 'review tab');
requireText(screen, "pathname: '/activity-review'", 'endurance correction route');
requireText(screen, "pathname: '/workout-detail'", 'strength correction route');
requireText(progress, "router.push('/training-history'", 'Progress entry point');

const versionParts = String(mobilePackage.version ?? '0.0.0').split('.').map(Number);
if (versionParts[0] !== 0 || versionParts[1] < 18 || (versionParts[1] === 18 && versionParts[2] < 9)) failures.push('mobile package must be V18.9 or later');
if (app?.expo?.version !== mobilePackage.version) failures.push('app.json and mobile package versions must match');

if (failures.length) {
  console.error(`V18.9 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('V18.9 validation passed: unified strength/endurance history, linked-record collapse, review routing, and version metadata.');
