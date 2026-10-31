// Fingerprint only source/config files that materially affect the native QA binary.
// UI scripts, docs, QA reports and unrelated tests must NOT require a rebuild.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0').filter(Boolean);
const includes = (path) =>
  path.startsWith('apps/mobile/src/')
  || path.startsWith('packages/domain/src/')
  || path.startsWith('packages/planner/src/')
  || path.startsWith('packages/generator/src/')
  || path.startsWith('packages/design-system/src/')
  || /^apps\/mobile\/(app\.json|package\.json|babel\.config\.[^/]+|metro\.config\.[^/]+)$/.test(path)
  || ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(path);
const relevant = tracked.filter(includes).sort();
if (relevant.length < 30) throw new Error('Native source inventory unexpectedly small.');
const hash = createHash('sha256');
for (const path of relevant) {
  hash.update(path, 'utf8');
  hash.update('\0');
  hash.update(readFileSync(path));
  hash.update('\0');
}
process.stdout.write(hash.digest('hex') + '\n');
