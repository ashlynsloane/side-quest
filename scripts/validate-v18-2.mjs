#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let ts;
try { ts = require('typescript'); } catch {
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  ts = require(path.join(globalRoot, 'typescript'));
}
const failures = [];
const fail = (message) => failures.push(message);
function source(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function transpile(relative, moduleKind = ts.ModuleKind.CommonJS) {
  const file = path.join(root, relative);
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: moduleKind, jsx: ts.JsxEmit.ReactJSX, isolatedModules: true },
  });
  for (const diagnostic of result.diagnostics ?? []) fail(`${relative}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
  return result.outputText;
}

for (const file of [
  'packages/domain/src/index.ts',
  'packages/planner/src/endurance.ts',
  'packages/planner/src/index.ts',
  'packages/planner/test/endurance.test.ts',
  'apps/mobile/src/services/database.ts',
  'apps/mobile/src/services/endurance.ts',
  'apps/mobile/src/app/calendar-sync.tsx',
  'apps/mobile/src/app/insights.tsx',
  'apps/mobile/src/app/training-region.tsx',
  'apps/mobile/src/app/workout-detail.tsx',
]) transpile(file, ts.ModuleKind.ESNext);

try {
  const compiled = transpile('packages/planner/src/endurance.ts');
  const module = { exports: {} };
  Function('exports', 'module', 'require', compiled)(module.exports, module, require);
  const { matchExternalTrainingToWorkouts } = module.exports;
  const now = '2026-07-22T16:00:00.000Z';
  const workout = { id:'workout_1', name:'Side Quest full-body strength', source:'side_quest', startedAt:'2026-07-21T14:05:00.000Z', completedAt:'2026-07-21T15:00:00.000Z' };
  const activity = { id:'activity_1', source:'strava', externalId:'s1', name:'HIIT', discipline:'hiit', sportType:'HighIntensityIntervalTraining', classification:'unclassified', startAt:'2026-07-21T14:00:00.000Z', movingTimeSeconds:3600, elapsedTimeSeconds:3600, intensity:'unknown', importedAt:now, updatedAt:now };
  const [link] = matchExternalTrainingToWorkouts({ activities:[activity], workouts:[workout], now });
  assert.equal(link.status, 'linked');
  assert.equal(link.workoutId, 'workout_1');
  assert(link.confidence >= 0.72);
  const far = matchExternalTrainingToWorkouts({ activities:[{...activity,startAt:'2026-07-21T08:00:00.000Z'}], workouts:[workout], now });
  assert.equal(far.length, 0);
  const double = matchExternalTrainingToWorkouts({ activities:[activity,{...activity,id:'activity_2',externalId:'s2',startAt:'2026-07-21T14:03:00.000Z'}], workouts:[workout], now });
  assert.equal(double.filter((item) => item.status === 'linked').length, 1);
} catch (error) { fail(`Canonical-link behavior: ${error.stack || error.message}`); }

const database = source('apps/mobile/src/services/database.ts');
for (const token of ['workout_sensor_links', 'getWorkoutSensorContext', 'saveWorkoutSensorLink', 'replaceAutomaticWorkoutSensorLinks']) {
  if (!database.includes(token)) fail(`Database missing ${token}`);
}
const endurance = source('apps/mobile/src/services/endurance.ts');
for (const token of ['matchExternalTrainingToWorkouts', 'linkedActivityIds', 'linkExternalTrainingToWorkout', 'dismissExternalTrainingLink']) {
  if (!endurance.includes(token)) fail(`Endurance service missing ${token}`);
}
if (!/linkedActivityIds\.has\(activity\.id\)[\s\S]{0,80}\? \[\]/.test(endurance)) fail('Linked watch activities are not suppressing duplicate region contributions.');
const insights = source('apps/mobile/src/app/insights.tsx');
for (const token of ['Direct strength', 'Sport load', 'cannot erase a direct-strength gap', 'Swim ·', 'Bike ·', 'Run ·']) {
  if (!insights.includes(token)) fail(`Training Memory UI missing ${token}`);
}
if (insights.includes('Combined context')) fail('Legacy combined default remains in Training Memory UI.');
if (!insights.includes("useState<MemoryView>('strength')") && !insights.includes("useState<MemoryView>('status')")) fail('Strength status is not the default Training Memory layer.');
const detail = source('apps/mobile/src/app/workout-detail.tsx');
for (const token of ['Watch data', 'Avg HR', 'Max HR', 'Relative effort', 'counted once']) {
  if (!detail.includes(token)) fail(`Workout detail missing ${token}`);
}
const calendar = source('apps/mobile/src/app/calendar-sync.tsx');
for (const token of ['Possible duplicate', 'Linked to', 'Keep separate', 'Link to']) {
  if (!calendar.includes(token)) fail(`Training connections UI missing ${token}`);
}

if (failures.length) {
  console.error(`V18.2 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V18.2 validation passed: canonical watch linking, one-count muscle credit, separate Direct strength and Sport load layers, watch metrics, ambiguity safeguards, and UI syntax.');
