import fs from 'node:fs';

const required = [
  'packages/domain/src/index.ts',
  'packages/planner/src/index.ts',
  'packages/planner/src/exercise-novelty.ts',
  'packages/planner/test/exercise-novelty.test.ts',
  'apps/mobile/src/services/exercise-novelty.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`V24.3 missing ${file}`);

const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
const novelty = fs.readFileSync('packages/planner/src/exercise-novelty.ts', 'utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/exercise-novelty.ts', 'utf8');
const tests = fs.readFileSync('packages/planner/test/exercise-novelty.test.ts', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const assertions = [
  [domain.includes("ExerciseFamiliarity = 'new' | 'recently_introduced' | 'familiar' | 'detrained'"), 'familiarity states'],
  [domain.includes('export interface ExerciseExposureRecord'), 'exercise exposure history'],
  [domain.includes('introductoryDoseMultiplier'), 'introductory dose metadata'],
  [novelty.includes('classifyExerciseFamiliarity'), 'familiarity classifier'],
  [novelty.includes('DETRAINED_WINDOW_DAYS'), 'detraining rule'],
  [novelty.includes("loadDecision.action === 'restrict'"), 'restriction novelty budget'],
  [novelty.includes("loadDecision.action === 'consolidate'"), 'consolidation novelty budget'],
  [novelty.includes('maximumHighDemandNovelExercises'), 'high-demand novelty cap'],
  [novelty.includes('poorly_tolerated'), 'response-sensitive novelty cost'],
  [planner.includes("from './exercise-novelty'"), 'planner exports'],
  [mobile.includes('exerciseNoveltySummary'), 'mobile explanation'],
  [tests.includes('defers high-demand novelty during consolidation'), 'consolidation fixture'],
  [pkg.scripts?.['check:v24']?.includes('validate-v24-3.mjs'), 'V24.3 included in pnpm check'],
];
for (const [ok, label] of assertions) if (!ok) throw new Error(`V24.3 validation failed: ${label}`);
console.log('V24.3 validation passed: exercise familiarity, detraining, novelty cost, introductory dosing, load-aware novelty budgets, and high-demand deferral.');
