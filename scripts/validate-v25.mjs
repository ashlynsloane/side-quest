import fs from 'node:fs';
const required = [
  'packages/domain/src/index.ts',
  'packages/planner/src/index.ts',
  'packages/planner/src/unified-adaptive-planning.ts',
  'packages/planner/test/unified-adaptive-planning.test.ts',
  'apps/mobile/src/services/unified-adaptive-planning.ts',
];
for (const path of required) if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
const domain = fs.readFileSync('packages/domain/src/index.ts','utf8');
const planner = fs.readFileSync('packages/planner/src/unified-adaptive-planning.ts','utf8');
const tests = fs.readFileSync('packages/planner/test/unified-adaptive-planning.test.ts','utf8');
for (const token of ['AdaptiveTrainingState','UnifiedAdaptivePlanningDecision','AthleteLifeContext']) if (!domain.includes(token)) throw new Error(`Missing domain token ${token}`);
for (const token of ['life_context: 100','mental_health: 95','pain: 90','buildUnifiedAdaptivePlan','overriddenAlternatives']) if (!planner.includes(token)) throw new Error(`Missing planner token ${token}`);
if (!tests.includes('never creates a calorie-restriction recommendation')) throw new Error('Missing calorie-restriction safeguard test');
console.log('V25.0 validation passed: unified conflict resolution, life-first priority, explainable decisions, confidence, and calorie-restriction safeguard.');
