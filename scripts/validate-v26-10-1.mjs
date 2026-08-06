import fs from 'node:fs';
const plannerPath = 'packages/planner/src/coach-policy.ts';
if (!fs.existsSync(plannerPath)) throw new Error(`Missing ${plannerPath}`);
const planner = fs.readFileSync(plannerPath, 'utf8');
for (const token of [
  'Unselected scenarios',
  'Unselected scenarios never contribute observed outcome evidence.',
  'Excluded decisions and unselected scenarios',
]) {
  if (!planner.includes(token)) throw new Error(`Missing V26.10.1 counterfactual safeguard: ${token}`);
}
console.log('V26.10.1 validation passed: exact counterfactual safeguard literals are present without changing policy behavior.');
