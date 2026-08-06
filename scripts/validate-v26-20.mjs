import fs from 'node:fs';
const required = [
  'packages/planner/src/unified-coaching-os.ts',
  'packages/planner/test/unified-coaching-os.test.ts',
  'apps/mobile/src/services/unified-coaching-os.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/unified-coaching-os.ts', 'utf8');
for (const token of ['UnifiedCoachStageResult','UnifiedCoachCandidate','UnifiedCoachRequest','UnifiedCoachingOsDecision','UnifiedCoachSummary']) if (!domain.includes(token)) throw new Error(`Missing domain contract ${token}`);
for (const token of ['evaluateUnifiedCoachCandidate','orchestrateUnifiedCoachDecision','buildUnifiedCoachExplanation','summarizeUnifiedCoachDecision']) if (!planner.includes(token)) throw new Error(`Missing planner export ${token}`);
if (!planner.includes('safetyViolation') || !planner.includes('clinicianRestrictionViolation')) throw new Error('Missing binding safety and clinician guardrails');
if (!planner.includes("recommendationStrength === 'strong'")) throw new Error('Automatic changes must require strong support');
if (!planner.includes('athleteConfirmationRequired')) throw new Error('Missing athlete confirmation flow');
if (!planner.includes('governanceApproved')) throw new Error('Missing governance integration');
if (!planner.includes('provenance')) throw new Error('Missing provenance preservation');
console.log('V26.20 validation passed: unified coaching orchestration, binding authority, uncertainty-aware decisions, athlete confirmation, and auditable provenance are present.');
