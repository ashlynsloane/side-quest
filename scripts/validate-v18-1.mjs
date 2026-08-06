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
function fail(message) { failures.push(message); }
function transpile(relative, moduleKind = ts.ModuleKind.CommonJS) {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(source, {
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
  'apps/mobile/src/services/strava.ts',
  'apps/mobile/src/services/database.ts',
  'apps/mobile/src/services/endurance.ts',
  'apps/mobile/src/app/calendar-sync.tsx',
  'apps/mobile/src/app/schedule.tsx',
  'supabase/functions/_shared/strava.ts',
]) transpile(file, ts.ModuleKind.ESNext);

try {
  const compiled = transpile('packages/planner/src/endurance.ts');
  const module = { exports: {} };
  Function('exports', 'module', 'require', compiled)(module.exports, module, require);
  const { matchCompletedActivities, calculateEnduranceContributions, buildPostEnduranceReplanProposals, isMatchEligibleCalendarEvent } = module.exports;
  const now = '2026-07-22T12:00:00.000Z';
  const hiit = { id:'strava_hiit', source:'strava', externalId:'h1', name:'HIIT', discipline:'hiit', sportType:'HighIntensityIntervalTraining', classification:'unclassified', startAt:'2026-07-21T14:00:00.000Z', movingTimeSeconds:3600, elapsedTimeSeconds:3700, intensity:'unknown', importedAt:now, updatedAt:now };
  const onix = { id:'onix', sourceId:'tp', title:'X-Train: Onix', startAt:'2026-07-21T14:05:00.000Z', endAt:'2026-07-21T15:05:00.000Z', allDay:false, discipline:'other' };
  assert.equal(isMatchEligibleCalendarEvent(onix), true);
  const [match] = matchCompletedActivities({ activities:[hiit], events:[onix], now });
  assert.equal(match.status, 'matched');
  assert.equal(match.calendarEventId, 'onix');
  assert.equal(calculateEnduranceContributions(hiit).totalContribution, 0);
  const classified = calculateEnduranceContributions({ ...hiit, classification:'full_body_strength' });
  assert(classified.totalContribution > 0 && classified.totalContribution <= 4);
  assert(classified.contributions.every((item) => item.confidence === 'low'));
  assert.deepEqual(buildPostEnduranceReplanProposals({ block:{ id:'b', createdAt:now, numberOfWeeks:1, goal:{ id:'g', type:'road_half_marathon', name:'Half', weeksUntilEvent:4, disciplines:['run'], priority:'perform', sessionsPerWeek:2, defaultSessionMinutes:40, createdAt:now, updatedAt:now }, weeks:[] }, activity:{ ...hiit, classification:'full_body_strength' }, today:'2026-07-21' }), []);
} catch (error) { fail(`Planner behavior: ${error.stack || error.message}`); }

try {
  const compiled = transpile('apps/mobile/src/services/strava.ts');
  const module = { exports: {} };
  const stubRequire = (id) => {
    if (id === '@circuit/planner') return { inferEnduranceIntensity: () => 'unknown' };
    if (id === 'expo-linking') return { createURL: () => 'sidequest://calendar-sync' };
    if (id === 'expo-web-browser') return {};
    if (id === './database') return {};
    if (id === './endurance') return {};
    if (id === './supabase') return { supabase: null };
    return require(id);
  };
  Function('exports', 'module', 'require', compiled)(module.exports, module, stubRequire);
  const fn = module.exports.disciplineFromStravaActivity;
  assert.equal(fn({ sportType:'HighIntensityIntervalTraining', name:'Onix HIIT' }), 'hiit');
  assert.equal(fn({ sportType:'WeightTraining', name:'Weights' }), 'strength');
  assert.equal(fn({ sportType:'Workout', name:'Dumbbell strength' }), 'strength');
  assert.equal(fn({ sportType:'Workout', name:'Onix circuit' }), 'hiit');
} catch (error) { fail(`Strava mapping: ${error.stack || error.message}`); }

const cloud = fs.readFileSync(path.join(root, 'supabase/functions/_shared/strava.ts'), 'utf8');
for (const token of ['highintensityintervaltraining', 'weighttraining', 'workout', 'crossfit']) {
  if (!cloud.includes(token)) fail(`Cloud Strava filter missing ${token}`);
}
const calendar = fs.readFileSync(path.join(root, 'apps/mobile/src/app/calendar-sync.tsx'), 'utf8');
for (const token of ['Recent completed training', 'Full-body strength class', 'matchablePlans', 'No muscle credit yet']) {
  if (!calendar.includes(token)) fail(`Calendar UI missing ${token}`);
}

if (failures.length) {
  console.error(`V18.1 patch validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V18.1 patch validation passed: HIIT/strength import mapping, conservative matching, classification, capped Training Memory credit, no automatic external-class replan, and UI syntax.');
