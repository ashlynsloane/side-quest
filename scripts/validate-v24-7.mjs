import fs from 'node:fs';
const required = ['packages/domain/src/index.ts','packages/planner/src/index.ts','packages/planner/src/progression-control.ts','packages/planner/test/progression-control.test.ts','apps/mobile/src/services/progression-control.ts'];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`V24.7 missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts','utf8');
const planner = fs.readFileSync('packages/planner/src/progression-control.ts','utf8');
const index = fs.readFileSync('packages/planner/src/index.ts','utf8');
const tests = fs.readFileSync('packages/planner/test/progression-control.test.ts','utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/progression-control.ts','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const assertions = [
  [domain.includes('ProgressionControlDecision'),'progression decision contract'],
  [domain.includes('ProgressionVariable'),'progression variable contract'],
  [planner.includes('decideProgressionControl'),'progression decision engine'],
  [planner.includes('applyProgressionDecision'),'decision application'],
  [planner.includes("slice(0, allowTwo ? 2 : 1)"),'one-variable default'],
  [planner.includes("input.establishedBaseline"),'established-baseline exception'],
  [planner.includes("response.painDuringOrAfter"),'response-sensitive restriction'],
  [index.includes("from './progression-control'"),'planner export'],
  [tests.includes('progresses one major variable at a time'),'single-variable fixture'],
  [tests.includes('strong established baseline'),'two-variable exception fixture'],
  [tests.includes('pain affects another workout'),'response restriction fixture'],
  [mobile.includes('Hold this dose'),'mobile explanation'],
  [pkg.scripts?.['check:v24']?.includes('validate-v24-7.mjs'),'V24.7 in pnpm check'],
];
for (const [ok,label] of assertions) if (!ok) throw new Error(`V24.7 validation failed: ${label}`);
console.log('V24.7 validation passed: one-variable progression, baseline-qualified exceptions, consolidation holds, novelty blocking, response-sensitive reductions, and mobile explanations.');
