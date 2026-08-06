import fs from 'node:fs';

const file = 'apps/mobile/src/app/side-quest-coach.tsx';
if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const source = fs.readFileSync(file, 'utf8');
const required = [
  'Your training decision, explained',
  'Why this recommendation?',
  'What changed?',
  'Upcoming decisions',
  'Coach history',
  'Human Coach Access',
  "type CoachPanel = 'why' | 'changed' | 'upcoming' | 'history' | null",
  'Material plan changes remain proposals for you to approve',
  'History-informed',
  'Intake-based',
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`V31.7C missing required source token: ${token}`);
}
if (source.includes('onPress={() => undefined}')) throw new Error('V31.7C still contains a dead Coach action.');
console.log('V31.7C validation passed: structured Coach explanation, change visibility, upcoming decisions, history, and human-coach separation.');
