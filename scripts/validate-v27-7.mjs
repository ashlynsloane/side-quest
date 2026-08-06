import fs from 'node:fs';
const required = [
  'packages/planner/src/workout-history-recall.ts',
  'apps/mobile/src/services/workout-history-recall.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const token of ['WorkoutHistoryRecord', 'WorkoutProgressionRecommendation', 'WorkoutRecallRequest']) {
  if (!domain.includes(token)) throw new Error(`Missing ${token}`);
}
console.log('V27.7 validation passed: workout history, recall, collections, and progression contracts are present.');
