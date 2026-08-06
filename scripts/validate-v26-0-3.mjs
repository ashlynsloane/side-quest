import fs from 'node:fs';

const plannerPath = 'packages/planner/src/unified-coach-engine.ts';
const domainPath = 'packages/domain/src/index.ts';

for (const path of [plannerPath, domainPath]) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
}

const planner = fs.readFileSync(plannerPath, 'utf8');
const domain = fs.readFileSync(domainPath, 'utf8');

if (!domain.includes('export interface CalendarAdjustmentProposal')) {
  throw new Error('CalendarAdjustmentProposal contract is missing.');
}
if (!domain.includes('reasons: string[]')) {
  throw new Error('CalendarAdjustmentProposal must expose reasons.');
}
if (/proposal\.explanation\b/.test(planner)) {
  throw new Error('Unified Coach Engine still references obsolete proposal.explanation.');
}
if (!planner.includes("proposal.reasons[0] ?? 'Calendar constraints require a proposed session adjustment.'")) {
  throw new Error('Unified Coach Engine does not use the calendar proposal reasons fallback.');
}

console.log('V26.0.3 validation passed: calendar proposals use the exported reasons contract.');
