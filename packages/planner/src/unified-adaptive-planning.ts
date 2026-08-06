import type {
  AdaptiveDecisionConfidence,
  AdaptiveEvidenceItem,
  AdaptiveSessionDirective,
  AdaptiveTrainingState,
  UnifiedAdaptivePlanningDecision,
  UnifiedAdaptivePlanningInput,
} from '@circuit/domain';

const PRIORITY = {
  life_context: 100,
  mental_health: 95,
  pain: 90,
  structural_load: 80,
  recovery: 70,
  progression: 50,
  novelty: 40,
  preference: 30,
  variety: 20,
} as const;

function confidenceFromEvidence(evidence: AdaptiveEvidenceItem[]): AdaptiveDecisionConfidence {
  const high = evidence.filter((item) => item.confidence === 'high').length;
  const moderate = evidence.filter((item) => item.confidence === 'moderate').length;
  if (high >= 2 || (high >= 1 && moderate >= 2)) return 'high';
  if (high >= 1 || moderate >= 2) return 'moderate';
  return 'low';
}

function lifeState(input: UnifiedAdaptivePlanningInput): AdaptiveTrainingState | undefined {
  const life = input.lifeContext;
  if (life.athleteRequestedRest || life.lifeStress === 'overwhelming' || life.mentalEnergy === 'depleted') return 'recover';
  if (life.athleteRequestedSimplification || life.lifeStress === 'high' || life.illnessOrSystemicSymptoms) return 'consolidate';
  return undefined;
}

function deriveState(input: UnifiedAdaptivePlanningInput): AdaptiveTrainingState {
  const fromLife = lifeState(input);
  if (fromLife) return fromLife;
  if (input.responseDecision?.sessionAction === 'restrict_region') return 'restriction';
  if (input.loadManagementDecision?.kind === 'restriction') return 'restriction';
  if (input.loadManagementDecision?.kind === 'deload') return 'recover';
  if (input.loadManagementDecision?.kind === 'consolidation') return 'consolidate';
  return input.currentState;
}

function buildEvidence(input: UnifiedAdaptivePlanningInput): AdaptiveEvidenceItem[] {
  const evidence: AdaptiveEvidenceItem[] = [];
  const life = input.lifeContext;
  if (life.lifeStress === 'high' || life.lifeStress === 'overwhelming') evidence.push({ domain: 'life_context', priority: PRIORITY.life_context, summary: `Life stress is ${life.lifeStress}.`, confidence: 'high' });
  if (life.mentalEnergy === 'limited' || life.mentalEnergy === 'depleted') evidence.push({ domain: 'mental_health', priority: PRIORITY.mental_health, summary: `Mental energy is ${life.mentalEnergy}.`, confidence: 'high' });
  if (life.athleteRequestedRest) evidence.push({ domain: 'mental_health', priority: PRIORITY.mental_health, summary: 'The athlete requested rest.', confidence: 'high' });
  if (input.responseDecision?.restrictedRegions.length) evidence.push({ domain: 'pain', priority: PRIORITY.pain, summary: `Pain response restricts ${input.responseDecision.restrictedRegions.join(', ')}.`, confidence: 'high' });
  if (input.structuralDecision && input.structuralDecision.action !== 'proceed') evidence.push({ domain: 'structural_load', priority: PRIORITY.structural_load, summary: input.structuralDecision.explanations[0] ?? 'Cross-sport structural overlap requires adjustment.', confidence: 'moderate' });
  if (input.loadManagementDecision && input.loadManagementDecision.kind !== 'normal') evidence.push({ domain: 'recovery', priority: PRIORITY.recovery, summary: `Load-management state is ${input.loadManagementDecision.kind}.`, confidence: 'high' });
  if (input.progressionDecision?.action === 'progress') evidence.push({ domain: 'progression', priority: PRIORITY.progression, summary: 'Recent training supports a controlled progression.', confidence: 'moderate' });
  if (input.noveltyDecision) evidence.push({ domain: 'novelty', priority: PRIORITY.novelty, summary: 'Exercise novelty capacity was evaluated.', confidence: 'moderate' });
  return evidence.sort((a, b) => b.priority - a.priority);
}

function directiveFor(sessionId: string, input: UnifiedAdaptivePlanningInput, state: AdaptiveTrainingState): AdaptiveSessionDirective {
  const isKey = input.keySessionIds.includes(sessionId);
  const restricted = input.responseDecision?.restrictedRegions ?? [];
  if (state === 'restriction') return { sessionId, action: isKey ? 'reduce' : 'replace', durationScale: isKey ? 0.8 : 0.65, intensityScale: isKey ? 0.8 : 0.6, noveltyAllowed: false, protectedRegions: restricted, reasons: ['Pain and restriction rules override progression and variety.'] };
  if (state === 'recover') return { sessionId, action: isKey ? 'keep' : 'reduce', durationScale: isKey ? 0.9 : 0.65, intensityScale: isKey ? 0.9 : 0.65, noveltyAllowed: false, protectedRegions: restricted, reasons: [isKey ? 'Key session preserved with a recovery ceiling.' : 'Supporting load reduced to protect life and recovery capacity.'] };
  if (state === 'consolidate') return { sessionId, action: 'repeat', durationScale: isKey ? 1 : 0.85, intensityScale: 0.9, noveltyAllowed: false, protectedRegions: restricted, reasons: ['Repeat familiar work without adding a new progression demand.'] };
  const mayProgress = input.progressionDecision?.action === 'progress';
  return { sessionId, action: mayProgress ? 'progress' : 'keep', durationScale: 1, intensityScale: 1, noveltyAllowed: Boolean(input.loadManagementDecision?.noveltyBudget ?? 1), protectedRegions: restricted, reasons: [mayProgress ? 'Progression remains after higher-priority safeguards.' : 'No higher-priority reason requires a change.'] };
}

export function buildUnifiedAdaptivePlan(input: UnifiedAdaptivePlanningInput): UnifiedAdaptivePlanningDecision {
  const state = deriveState(input);
  const evidence = buildEvidence(input);
  const confidence = confidenceFromEvidence(evidence);
  const directives = input.candidateSessionIds.map((sessionId) => directiveFor(sessionId, input, state));
  const progressionAllowed = !['recover', 'restriction', 'consolidate'].includes(state) && input.loadManagementDecision?.progressionAllowed !== false && input.responseDecision?.progressionAllowed !== false;
  const noveltyBudget = progressionAllowed ? (input.loadManagementDecision?.noveltyBudget ?? 1) : 0;
  const overriddenAlternatives: string[] = [];
  if (!progressionAllowed && input.progressionDecision?.action === 'progress') overriddenAlternatives.push('Progression was available but was overridden by a higher-priority life, pain, structural, or recovery signal.');
  if (noveltyBudget === 0 && input.noveltyDecision) overriddenAlternatives.push('Exercise novelty was withheld to reduce cognitive and physical load.');
  const focus = state === 'recover'
    ? 'Protect mental and physical recovery while preserving only training that supports wellbeing.'
    : state === 'restriction'
      ? 'Protect the affected region and preserve unrelated movement where practical.'
      : state === 'consolidate'
        ? 'Absorb recent training with familiar, manageable sessions.'
        : 'Build fitness using one coherent progression plan.';
  const headline = state === 'recover' ? 'Life and recovery come first' : state === 'restriction' ? 'Protect and adapt' : state === 'consolidate' ? 'Consolidate this week' : 'Build with control';
  const coachNotes = [focus, progressionAllowed ? 'A controlled progression is available.' : 'No progression is required this cycle.', input.lifeContext.trainingIsProfessionalObligation ? 'Professional obligations were declared.' : 'Training remains optional and may be reduced or skipped without penalty.'];
  return {
    state,
    headline,
    focus,
    confidence,
    progressionAllowed,
    noveltyBudget,
    protectedSessionIds: input.keySessionIds,
    directives,
    evidence,
    overriddenAlternatives,
    coachNotes,
    decisionLog: { decidedAt: input.planningDate, state, decision: headline, confidence, evidence, overriddenAlternatives },
  };
}

export const adaptiveDecisionPriority = PRIORITY;
