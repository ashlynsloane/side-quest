#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = loadTypeScript();
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const failures = [];

function loadTypeScript() {
  try { return require('typescript'); } catch {}
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return require(path.join(globalRoot, 'typescript'));
  } catch {
    console.error('TypeScript is required. Run pnpm install --frozen-lockfile first.');
    process.exit(1);
  }
}

function fail(message) { failures.push(message); }
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : walk(full);
    return [full];
  });
}

for (const file of walk(root).filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts'))) {
  const source = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      isolatedModules: true,
    },
  });
  for (const diagnostic of result.diagnostics ?? []) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    fail(`${path.relative(root, file)}: ${message}`);
  }
}

for (const jsonFile of walk(root).filter((file) => file.endsWith('.json'))) {
  try { JSON.parse(fs.readFileSync(jsonFile, 'utf8')); }
  catch (error) { fail(`${path.relative(root, jsonFile)}: invalid JSON (${error.message})`); }
}

const required = [
  'supabase/V18_ENDURANCE_INTEGRATIONS.sql',
  'supabase/functions/strava-oauth-start/index.ts',
  'supabase/functions/strava-oauth-callback/index.ts',
  'supabase/functions/strava-sync/index.ts',
  'supabase/functions/strava-webhook/index.ts',
  'supabase/functions/strava-disconnect/index.ts',
  'apps/mobile/src/services/endurance.ts',
  'apps/mobile/src/services/integration-runtime.ts',
  'apps/mobile/src/services/strava.ts',
  'packages/planner/src/endurance.ts',
];
for (const relative of required) if (!fs.existsSync(path.join(root, relative))) fail(`Missing ${relative}`);

try { execFileSync('bash', ['-n', path.join(root, 'scripts/setup-strava-webhook.sh')], { stdio: 'pipe' }); }
catch (error) { fail(`setup-strava-webhook.sh failed bash -n: ${error.stderr?.toString() || error.message}`); }

try {
  const enduranceSource = fs.readFileSync(path.join(root, 'packages/planner/src/endurance.ts'), 'utf8');
  const compiled = ts.transpileModule(enduranceSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'module', 'require', compiled)(module.exports, module, require);
  const { calculateEnduranceContributions, matchCompletedActivities, buildPostEnduranceReplanProposals } = module.exports;
  const now = '2026-07-22T12:00:00.000Z';
  const activity = {
    id: 'strava_1', source: 'strava', externalId: '1', name: 'Long aerobic ride', discipline: 'bike',
    startAt: '2026-07-22T13:00:00.000Z', movingTimeSeconds: 7200, elapsedTimeSeconds: 7350,
    intensity: 'hard', importedAt: now, updatedAt: now,
  };
  const contributions = calculateEnduranceContributions(activity);
  assert(contributions.totalContribution > 0 && contributions.totalContribution <= 12);
  assert(contributions.contributions.every((item) => item.confidence === 'moderate'));
  assert(contributions.contributions.some((item) => item.region === 'quadriceps'));

  const events = [{ id: 'event_1', sourceId: 'tp', title: 'Long aerobic bike', startAt: '2026-07-22T13:15:00.000Z', endAt: '2026-07-22T15:15:00.000Z', allDay: false, discipline: 'bike' }];
  const matches = matchCompletedActivities({ activities: [activity], events, now });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].status, 'matched');
  assert.equal(matches[0].calendarEventId, 'event_1');

  const workout = { id: 'w1', name: 'Bike support', totalWorkSeconds: 2400 };
  const block = {
    id: 'block', createdAt: now, numberOfWeeks: 1,
    goal: { id: 'goal', name: '70.3', type: 'triathlon_70_3', eventDate: '2026-08-30', createdAt: now, updatedAt: now },
    weeks: [{ id: 'week', weekNumber: 1, weekStartDate: '2026-07-20', phase: 'build', headline: '', phaseExplanation: '', warnings: [], sessions: [
      { id: 's1', weekId: 'week', order: 1, date: '2026-07-22', title: 'Lower body strength', purpose: 'full_body', intendedLoad: 'high', completionStatus: 'planned', workout },
    ] }],
  };
  const proposals = buildPostEnduranceReplanProposals({ block, activity, calendarEvents: [], today: '2026-07-22' });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].fromDate, '2026-07-22');
  assert.equal(proposals[0].toDate, '2026-07-23');
} catch (error) { fail(`Pure V18 planner tests failed: ${error.stack || error.message}`); }

try {
  const calendarSource = fs.readFileSync(path.join(root, 'apps/mobile/src/services/calendar-sync.ts'), 'utf8');
  const compiled = ts.transpileModule(calendarSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const stubRequire = (id) => {
    if (id === './database') return {
      getTrainingCalendarEventsForSource: async () => [], getTrainingCalendarSource: async () => null,
      listTrainingCalendarSources: async () => [], replaceTrainingCalendarEvents: async () => {}, saveTrainingCalendarSource: async () => {},
    };
    if (id === './endurance') return { rebuildPlannedCompletedMatches: async () => ({ matchedCount: 0, ambiguousCount: 0 }) };
    if (id === '@circuit/planner') return { zonedWallTimeToUtc: (wall) => new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second ?? 0)).toISOString() };
    return require(id);
  };
  Function('exports', 'module', 'require', compiled)(module.exports, module, stubRequire);
  const { parseIcsEvents, shouldRefreshCalendarSource } = module.exports;
  const parsed = parseIcsEvents('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:abc\nDTSTART:20260722T130000Z\nDTEND:20260722T140000Z\nSUMMARY:Bike intervals\nEND:VEVENT\nEND:VCALENDAR', 'tp');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].discipline, 'bike');
  assert.equal(parsed[0].externalUid, 'abc');
  const staleSync = {
    id: 'tp', name: 'TP', sourceType: 'trainingpeaks_ics', url: 'https://example.com/calendar.ics', active: true,
    autoRefresh: true, refreshIntervalMinutes: 60, syncStatus: 'syncing', lastAttemptedAt: '2026-07-22T10:00:00.000Z',
    createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-22T10:00:00.000Z',
  };
  assert.equal(shouldRefreshCalendarSource(staleSync, new Date('2026-07-22T12:00:00.000Z')), true);
  assert.equal(shouldRefreshCalendarSource({ ...staleSync, lastAttemptedAt: '2026-07-22T11:55:00.000Z' }, new Date('2026-07-22T12:00:00.000Z')), false);
} catch (error) { fail(`Pure V18 calendar tests failed: ${error.stack || error.message}`); }

const sql = fs.readFileSync(path.join(root, 'supabase/V18_ENDURANCE_INTEGRATIONS.sql'), 'utf8');
for (const token of ['strava_tokens', 'enable row level security', 'strava_webhook_events', 'strava_activities']) {
  if (!sql.includes(token)) fail(`V18 SQL missing ${token}`);
}
const webhook = fs.readFileSync(path.join(root, 'supabase/functions/strava-webhook/index.ts'), 'utf8');
if (!webhook.includes('EdgeRuntime.waitUntil')) fail('Webhook does not use EdgeRuntime.waitUntil.');
if (!webhook.includes("'hub.challenge'")) fail('Webhook verification challenge is missing.');

if (failures.length) {
  console.error(`V18 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V18 validation passed: TypeScript/TSX syntax, JSON, shell syntax, pure planner tests, and integration structure.');
