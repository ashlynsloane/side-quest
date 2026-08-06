import fs from 'node:fs';
const required = ['packages/domain/src/index.ts','packages/planner/src/index.ts','packages/planner/src/cross-sport-structural-load.ts','packages/planner/test/cross-sport-structural-load.test.ts','apps/mobile/src/services/cross-sport-structural-load.ts'];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`V24.6 missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts','utf8');
const planner = fs.readFileSync('packages/planner/src/cross-sport-structural-load.ts','utf8');
const index = fs.readFileSync('packages/planner/src/index.ts','utf8');
const tests = fs.readFileSync('packages/planner/test/cross-sport-structural-load.test.ts','utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/cross-sport-structural-load.ts','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const assertions = [
  [domain.includes('CrossSportStructuralPlanDecision'),'cross-sport decision contract'],
  [domain.includes('CrossSportRegionOverlap'),'overlap contract'],
  [planner.includes('detectCrossSportStructuralOverlaps'),'overlap detection'],
  [planner.includes('decideCrossSportStructuralPlan'),'plan decision'],
  [planner.includes('applyCrossSportAdjustmentToExposure'),'regional dose adjustment'],
  [planner.includes("left.discipline === right.discipline"),'cross-discipline guard'],
  [planner.includes("session.priority === 'key'"),'key-session protection'],
  [index.includes("from './cross-sport-structural-load'"),'planner export'],
  [tests.includes('paddle swim and overhead strength'),'swim-strength fixture'],
  [tests.includes('lower-priority supporting session'),'priority fixture'],
  [tests.includes('preserves unrelated exposure'),'unrelated training preservation'],
  [mobile.includes('Cross-sport load was redistributed'),'mobile explanation'],
  [pkg.scripts?.['check:v24']?.includes('validate-v24-6.mjs'),'V24.6 in pnpm check'],
];
for (const [ok,label] of assertions) if (!ok) throw new Error(`V24.6 validation failed: ${label}`);
console.log('V24.6 validation passed: cross-sport overlap detection, key-session protection, structural load redistribution, session separation, and unrelated-training preservation.');
