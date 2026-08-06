import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const testPath = path.join(root, 'packages/planner/test/coach-attention-queue.test.ts');
const source = fs.readFileSync(testPath, 'utf8');
const required = [
  "title: `${decisionId} title`",
  'supportingSignalIds: []',
  'rejectedAlternatives: []',
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`V26.4.1 missing UnifiedCoachDecision fixture field: ${token}`);
}
if (source.includes('evidence: []')) {
  throw new Error('V26.4.1 still uses obsolete UnifiedCoachDecision.evidence fixture field.');
}
console.log('V26.4.1 validation passed: coach attention queue tests match the UnifiedCoachDecision contract.');
