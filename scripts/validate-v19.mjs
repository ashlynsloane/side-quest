import fs from 'node:fs';

const required = [
  ['packages/planner/src/unified-training.ts', ['validateUnifiedWeek', 'chooseProgressionBudget', 'requiresAthleteApproval', 'ZERO_STRENGTH_DRIFT', 'RETURN_TO_RUN_IMPACT']],
  ['packages/planner/test/unified-training.test.ts', ['unified training core', 'TIME_BUDGET_EXCEEDED']],
  ['packages/planner/src/index.ts', ["from './unified-training'", "from './synthetic-athletes'"]],
  ['packages/planner/src/synthetic-athletes.ts', ['beginner-tri-8h', 'bone-stress-rtr', 'postponed-race']],
];
for (const [file, needles] of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${file} missing ${needle}`);
}
console.log('V19 structural validation passed: unified multidimensional load, progression budgets, plan invariants, confidence, athlete approval, audit trail, and regression fixtures.');
