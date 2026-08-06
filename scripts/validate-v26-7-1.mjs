import fs from 'node:fs';

const file = 'packages/planner/src/digital-twin.ts';
if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const source = fs.readFileSync(file, 'utf8');
for (const expected of [
  'TwinEvidence,',
  'const latestEvidence: TwinEvidence = {',
  "source: 'workout_response'",
  "quality: 'self_reported'",
  'latestEvidence,',
]) {
  if (!source.includes(expected)) throw new Error(`Missing V26.7.1 contract: ${expected}`);
}
console.log('V26.7.1 validation passed: Digital Twin evidence literals retain their domain union types.');
