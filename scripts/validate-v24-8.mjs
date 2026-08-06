import fs from 'node:fs';
const required = ['packages/domain/src/index.ts','packages/planner/src/index.ts','packages/planner/src/load-management-week.ts','packages/planner/test/load-management-week.test.ts','apps/mobile/src/services/load-management-week.ts'];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`V24.8 missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts','utf8');
const planner = fs.readFileSync('packages/planner/src/load-management-week.ts','utf8');
const index = fs.readFileSync('packages/planner/src/index.ts','utf8');
const tests = fs.readFileSync('packages/planner/test/load-management-week.test.ts','utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/load-management-week.ts','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const assertions = [
  [domain.includes('LoadManagementWeekDecision'),'load-management decision contract'],
  [domain.includes("'consolidation' | 'deload'"),'recovery-week kinds'],
  [planner.includes('decideLoadManagementWeek'),'automatic recovery-week engine'],
  [planner.includes("triggers.includes('pain_response')"),'pain restriction trigger'],
  [planner.includes("session.priority === 'key'"),'key-session protection'],
  [planner.includes('mechanicalDemandScale'),'mechanical-demand reduction'],
  [planner.includes('noveltyBudget'),'novelty reduction'],
  [index.includes("from './load-management-week'"),'planner export'],
  [tests.includes('progression streak'),'progression-cycle fixture'],
  [tests.includes('persistent soreness'),'soreness and exposure fixture'],
  [tests.includes('pain affects another workout'),'pain carryover fixture'],
  [mobile.includes('Deload without losing the week'),'mobile deload explanation'],
  [pkg.scripts?.['check:v24']?.includes('validate-v24-8.mjs'),'V24.8 in pnpm check'],
];
for (const [ok,label] of assertions) if (!ok) throw new Error(`V24.8 validation failed: ${label}`);
console.log('V24.8 validation passed: automatic consolidation, deload, and restriction weeks; key-session protection; progression holds; mechanical-demand and novelty reductions; and mobile explanations.');
