import type {
  CoachScenarioCandidate,
  CoachScenarioSimulatorInput,
  CoachScenarioSimulatorResult,
  CoachScenarioScore,
  CoachScenarioWeights,
} from '@circuit/domain';

const DEFAULT_WEIGHTS: CoachScenarioWeights = {
  adaptation: 0.2,
  recovery: 0.18,
  performance: 0.18,
  injuryRisk: 0.2,
  calendarFit: 0.1,
  preferenceFit: 0.09,
  disruption: 0.05,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizedWeights(input?: Partial<CoachScenarioWeights>): CoachScenarioWeights {
  const merged = { ...DEFAULT_WEIGHTS, ...input };
  const nonnegative = Object.fromEntries(
    Object.entries(merged).map(([key, value]) => [key, Math.max(0, value)]),
  ) as unknown as CoachScenarioWeights;
  const total = Object.values(nonnegative).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return DEFAULT_WEIGHTS;
  return Object.fromEntries(
    Object.entries(nonnegative).map(([key, value]) => [key, value / total]),
  ) as unknown as CoachScenarioWeights;
}

function componentScores(candidate: CoachScenarioCandidate): Record<keyof CoachScenarioWeights, number> {
  const p = candidate.projection;
  return {
    adaptation: clamp(p.adaptation),
    recovery: clamp(p.recovery),
    performance: clamp(p.performance),
    injuryRisk: 1 - clamp(p.injuryRisk),
    calendarFit: clamp(p.calendarFit),
    preferenceFit: clamp(p.preferenceFit),
    disruption: 1 - clamp(p.disruption),
  };
}

function tradeoffs(candidate: CoachScenarioCandidate): string[] {
  const p = candidate.projection;
  const notes: string[] = [];
  if (p.adaptation >= 0.75) notes.push('Preserves a strong adaptation stimulus.');
  if (p.recovery >= 0.75) notes.push('Supports recovery capacity.');
  if (p.performance >= 0.75) notes.push('Protects near-term session quality.');
  if (p.injuryRisk >= 0.6) notes.push('Carries elevated projected injury risk.');
  if (p.disruption >= 0.6) notes.push('Requires meaningful calendar disruption.');
  if (p.preferenceFit < 0.5) notes.push('Fits athlete preferences poorly.');
  return notes.length ? notes : ['No dominant benefit or cost was identified.'];
}

export function simulateCoachScenarios(
  input: CoachScenarioSimulatorInput,
): CoachScenarioSimulatorResult {
  const weights = normalizedWeights(input.weights);
  const protectedIds = new Set(input.protectedSessionIds ?? []);
  const minimumRecovery = clamp(input.minimumRecovery ?? 0);
  const maximumInjuryRisk = clamp(input.maximumInjuryRisk ?? 1);

  const scored: CoachScenarioScore[] = input.candidates.map((candidate): CoachScenarioScore => {
    const components = componentScores(candidate);
    const violations = [...(candidate.hardConstraintViolations ?? [])];
    if (candidate.projection.recovery < minimumRecovery) {
      violations.push('Projected recovery is below the required minimum.');
    }
    if (candidate.projection.injuryRisk > maximumInjuryRisk) {
      violations.push('Projected injury risk exceeds the allowed maximum.');
    }
    if (
      candidate.sessionId &&
      protectedIds.has(candidate.sessionId) &&
      (candidate.kind === 'remove' || candidate.kind === 'replace')
    ) {
      violations.push('The scenario changes a protected session.');
    }
    const utilityScore = round(
      Object.entries(weights).reduce(
        (sum, [key, weight]) => sum + components[key as keyof CoachScenarioWeights] * weight,
        0,
      ),
    );
    return {
      scenarioId: candidate.scenarioId,
      utilityScore,
      rank: 0,
      eligible: violations.length === 0,
      recommended: false,
      tradeoffs: tradeoffs(candidate),
      constraintViolations: violations,
      projection: candidate.projection,
      componentScores: components,
    };
  });

  const ranked = [...scored].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (b.utilityScore !== a.utilityScore) return b.utilityScore - a.utilityScore;
    return a.scenarioId.localeCompare(b.scenarioId);
  });
  ranked.forEach((item, index) => {
    item.rank = index + 1;
  });
  const recommended = ranked.find((item) => item.eligible);
  if (recommended) recommended.recommended = true;

  const scenarioById = Object.fromEntries(ranked.map((item) => [item.scenarioId, item]));
  return {
    generatedAt: input.generatedAt,
    recommendedScenarioId: recommended?.scenarioId,
    rankedScenarioIds: ranked.map((item) => item.scenarioId),
    scenarios: ranked,
    scenarioById,
    summary: recommended
      ? [
          `${recommended.scenarioId} ranked first among ${ranked.length} evaluated scenarios.`,
          `${ranked.filter((item) => !item.eligible).length} scenario${ranked.filter((item) => !item.eligible).length === 1 ? ' was' : 's were'} excluded by hard constraints.`,
        ]
      : ['No eligible scenario remained after safety and plan constraints were applied.'],
    safeguards: [
      'Scenario scores compare planning alternatives; they do not predict medical outcomes.',
      'Hard safety and protected-session constraints override utility scores.',
      'The simulator does not apply plan changes or bypass athlete approval.',
      'Missing or uncertain projections should be represented conservatively upstream.',
      'Scenario rankings are decision support, not guarantees of adaptation or performance.',
    ],
  };
}
