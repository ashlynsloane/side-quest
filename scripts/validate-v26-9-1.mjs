import fs from 'node:fs';

const domainPath = 'packages/domain/src/index.ts';
const plannerPath = 'packages/planner/src/coach-decision-ledger.ts';
const domain = fs.readFileSync(domainPath, 'utf8');
const planner = fs.readFileSync(plannerPath, 'utf8');

const legacyDeclarations = [...domain.matchAll(/export interface CoachDecisionExplanation\s*\{/g)];
if (legacyDeclarations.length !== 1) {
  throw new Error(`Expected exactly one legacy CoachDecisionExplanation declaration; found ${legacyDeclarations.length}.`);
}
if (!domain.includes('export interface CoachDecisionLedgerExplanation {')) {
  throw new Error('Missing collision-free CoachDecisionLedgerExplanation contract.');
}
if (!domain.includes('explanation: CoachDecisionLedgerExplanation;')) {
  throw new Error('CoachDecisionRecord does not use CoachDecisionLedgerExplanation.');
}
if (!planner.includes('CoachDecisionLedgerExplanation')) {
  throw new Error('Decision ledger planner does not import/use CoachDecisionLedgerExplanation.');
}
if (planner.includes('CoachDecisionExplanation,')) {
  throw new Error('Decision ledger still imports the pre-existing evidence-engine explanation type.');
}
console.log('V26.9.1 validation passed: decision-ledger explanations use a distinct domain contract without declaration merging conflicts.');
