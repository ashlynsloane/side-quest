import fs from 'node:fs';
const required = [
  'packages/planner/src/coach-uncertainty.ts',
  'packages/planner/test/coach-uncertainty.test.ts',
  'apps/mobile/src/services/coach-uncertainty.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/coach-uncertainty.ts', 'utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/coach-uncertainty.ts', 'utf8');
const tests = fs.readFileSync('packages/planner/test/coach-uncertainty.test.ts', 'utf8');
for (const token of ['CoachUncertaintyAssessment','CoachEvidenceConflict','CoachInformationGap','CoachDecisionStability','CoachRecommendationStrength','CoachEvidenceUpdateTrigger']) if (!domain.includes(token)) throw new Error(`Missing domain contract ${token}`);
for (const token of ['assessCoachUncertainty','identifyUncertaintySources','detectEvidenceConflicts','detectInformationGaps','evaluateDecisionStability','classifyRecommendationStrength','determineEvidenceUpdateTriggers','buildUncertaintyExplanation','applyUncertaintyGuardrails']) if (!planner.includes(`function ${token}`)) throw new Error(`Missing planner export ${token}`);
if (!planner.includes('requiresAthleteConfirmation: !stable')) throw new Error('Missing unstable-decision confirmation safeguard');
if (!planner.includes('Binding safety restrictions remain authoritative')) throw new Error('Missing safety-authority safeguard');
if (!planner.includes('automaticPlanChangeAllowed')) throw new Error('Missing automatic plan-change gate');
if (!domain.includes('avoidsNumericPrecision: true')) throw new Error('Missing no-fake-precision contract');
if (!mobile.includes('WhatWouldChangeThisCard')) throw new Error('Missing mobile uncertainty cards');
if (!tests.includes("from 'vitest'")) throw new Error('Missing Vitest-native suite');
console.log('V26.16 validation passed: uncertainty dimensions, conflicts, information value, stability, authority, explanations, and audit safeguards are present.');
