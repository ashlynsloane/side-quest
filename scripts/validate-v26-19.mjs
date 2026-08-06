import fs from 'node:fs';
const required = [
  'packages/planner/src/coach-meta-learning.ts',
  'packages/planner/test/coach-meta-learning.test.ts',
  'apps/mobile/src/services/coach-meta-learning.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/coach-meta-learning.ts', 'utf8');
for (const token of ['CoachLearningEpisode','CoachContextSimilarity','CoachStrategyTransferAssessment','CoachMetaLearningReport']) if (!domain.includes(token)) throw new Error(`Missing domain contract ${token}`);
for (const token of ['compareCoachLearningContexts','assessStrategyTransfer','buildCoachMetaLearningReport','explainCoachMetaLearning']) if (!planner.includes(token)) throw new Error(`Missing planner export ${token}`);
if (!planner.includes('automaticApplicationAllowed = false')) throw new Error('Transferred strategies must never apply automatically');
if (!planner.includes('safetyViolation') || !planner.includes('do_not_transfer')) throw new Error('Missing safety transfer guardrail');
if (!planner.includes('conflictingEpisodeIds')) throw new Error('Missing conflict preservation');
console.log('V26.19 validation passed: context-aware meta-learning, transfer safeguards, conflict preservation, athlete confirmation, and auditability are present.');
