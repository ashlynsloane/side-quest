import type { GeneratedWholeAthleteBlock } from './whole-athlete-plan';
import type {
  AdaptationAction,
  CompletedWorkoutAdaptationSnapshot,
  EnduranceAdaptationSummary,
  StrengthAdaptationSummary,
} from './completed-workout-adaptation';

export type AppliedPlanDomain =
  | 'bike_quality'
  | 'bike_long'
  | 'swim_quality'
  | 'swim_endurance'
  | 'run_quality'
  | 'run_long'
  | 'return_to_run'
  | 'strength';

export type AppliedPlanAction =
  | 'progress'
  | 'hold'
  | 'reduce'
  | 'introduced'
  | 'removed';

export type AppliedPlanReason =
  | 'response_progression_applied'
  | 'response_progression_banked'
  | 'response_hold_applied'
  | 'response_protect_applied'
  | 'eligible_not_applied'
  | 'macrocycle_progression'
  | 'macrocycle_reduction'
  | 'maintain'
  | 'introduced'
  | 'removed'
  | 'guardrail_conflict';

export interface AppliedTrainingDose {
  sessionMinutes?: number;
  weeklyMinutes: number;
  frequency: number;
  representativeTitle?: string;
}

export interface AppliedDoseDelta {
  sessionMinutes?: number;
  weeklyMinutes: number;
  frequency: number;
}

export interface AppliedPlanDecision {
  domain: AppliedPlanDomain;
  label: string;
  action: AppliedPlanAction;
  previousDose?: AppliedTrainingDose;
  currentDose?: AppliedTrainingDose;
  delta: AppliedDoseDelta;
  adaptationAction: AdaptationAction;
  reason: AppliedPlanReason;
  previousSource: 'completed_prescription' | 'previous_generated_week' | 'none';
  constraints: string[];
  consistency: 'consistent' | 'review';
  explanation: string;
}

export interface AppliedPlanDecisionSnapshot {
  weekStartDate: string;
  generatedAt: string;
  loadIntent?: 'build' | 'absorb' | 'recovery' | 'taper' | 'race';
  decisions: AppliedPlanDecision[];
  primary: AppliedPlanDecision | null;
  warnings: string[];
}

type GeneratedSession = GeneratedWholeAthleteBlock['weeks'][number]['sessions'][number];
type GeneratedWeek = GeneratedWholeAthleteBlock['weeks'][number];

interface DomainDoseDefinition {
  domain: AppliedPlanDomain;
  label: string;
  current: AppliedTrainingDose | undefined;
  previousGenerated: AppliedTrainingDose | undefined;
  previousEvidence: AppliedTrainingDose | undefined;
  adaptationAction: AdaptationAction;
}

export function buildAppliedPlanDecisionSnapshot({
  generated,
  adaptation,
  asOf,
}: {
  generated: GeneratedWholeAthleteBlock;
  adaptation: CompletedWorkoutAdaptationSnapshot;
  asOf: string;
}): AppliedPlanDecisionSnapshot {
  const today = asOf.slice(0, 10);
  const currentIndex = generated.weeks.findIndex((week) => dateInWeek(today, week.weekStartDate));
  if (currentIndex < 0) {
    return {
      weekStartDate: today,
      generatedAt: asOf,
      decisions: [],
      primary: null,
      warnings: ['No generated whole-athlete week contains the current date, so no applied plan delta was produced.'],
    };
  }

  const currentWeek = generated.weeks[currentIndex]!;
  const previousWeek = currentIndex > 0 ? generated.weeks[currentIndex - 1] : undefined;
  const developmentWeek = generated.developmentPlan?.weeks.find(
    (week) => week.weekStartDate === currentWeek.weekStartDate,
  );
  const loadIntent = developmentWeek?.loadIntent;
  const domains = buildDomainDoseDefinitions(
    currentWeek,
    previousWeek,
    adaptation,
  );

  const decisions = domains
    .filter((item) => item.current || item.previousGenerated || item.previousEvidence)
    .map((item) => appliedDecisionForDomain(item, loadIntent));

  const warnings = decisions
    .filter((decision) => decision.consistency === 'review')
    .map((decision) => `${decision.label}: ${decision.explanation}`);

  return {
    weekStartDate: currentWeek.weekStartDate,
    generatedAt: asOf,
    ...(loadIntent ? { loadIntent } : {}),
    decisions,
    primary: choosePrimaryAppliedDecision(decisions),
    warnings,
  };
}

function buildDomainDoseDefinitions(
  currentWeek: GeneratedWeek,
  previousWeek: GeneratedWeek | undefined,
  adaptation: CompletedWorkoutAdaptationSnapshot,
): DomainDoseDefinition[] {
  const current = dosesForWeek(currentWeek);
  const previous = previousWeek ? dosesForWeek(previousWeek) : emptyDoseMap();

  return [
    definition('return_to_run', 'Return to run', current.return_to_run, previous.return_to_run, evidenceDoseForEndurance(adaptation.returnToRun, 'return_to_run'), adaptation.returnToRun.action),
    definition('run_quality', 'Run quality', current.run_quality, previous.run_quality, evidenceDoseForEndurance(adaptation.endurance.run, 'quality'), adaptation.endurance.run.action),
    definition('run_long', 'Long run', current.run_long, previous.run_long, evidenceDoseForEndurance(adaptation.endurance.run, 'long'), adaptation.endurance.run.action),
    definition('bike_quality', 'Bike quality', current.bike_quality, previous.bike_quality, evidenceDoseForEndurance(adaptation.endurance.bike, 'quality'), adaptation.endurance.bike.action),
    definition('bike_long', 'Long ride', current.bike_long, previous.bike_long, evidenceDoseForEndurance(adaptation.endurance.bike, 'long'), adaptation.endurance.bike.action),
    definition('strength', 'Strength', current.strength, previous.strength, evidenceDoseForStrength(adaptation.strength), adaptation.strength.action),
    definition('swim_quality', 'Swim quality', current.swim_quality, previous.swim_quality, evidenceDoseForEndurance(adaptation.endurance.swim, 'quality'), adaptation.endurance.swim.action),
    definition('swim_endurance', 'Swim endurance', current.swim_endurance, previous.swim_endurance, evidenceDoseForEndurance(adaptation.endurance.swim, 'endurance'), adaptation.endurance.swim.action),
  ];
}

function definition(
  domain: AppliedPlanDomain,
  label: string,
  current: AppliedTrainingDose | undefined,
  previousGenerated: AppliedTrainingDose | undefined,
  previousEvidence: AppliedTrainingDose | undefined,
  adaptationAction: AdaptationAction,
): DomainDoseDefinition {
  return { domain, label, current, previousGenerated, previousEvidence, adaptationAction };
}

function appliedDecisionForDomain(
  item: DomainDoseDefinition,
  loadIntent: AppliedPlanDecisionSnapshot['loadIntent'],
): AppliedPlanDecision {
  const previous = mergePreviousDose(item.previousEvidence, item.previousGenerated);
  const current = item.current;
  const previousSource: AppliedPlanDecision['previousSource'] = item.previousEvidence
    ? 'completed_prescription'
    : item.previousGenerated
      ? 'previous_generated_week'
      : 'none';
  const action = compareDose(previous, current);
  const delta = doseDelta(previous, current);
  const constraints = constraintsFor(item.domain, item.adaptationAction, loadIntent);
  const consistency = consistencyFor(item.domain, item.adaptationAction, action, loadIntent);
  const reason = reasonFor(item.adaptationAction, action, loadIntent, consistency);

  return {
    domain: item.domain,
    label: item.label,
    action,
    ...(previous ? { previousDose: previous } : {}),
    ...(current ? { currentDose: current } : {}),
    delta,
    adaptationAction: item.adaptationAction,
    reason,
    previousSource,
    constraints,
    consistency,
    explanation: explainAppliedDecision({
      label: item.label,
      domain: item.domain,
      previous,
      current,
      delta,
      action,
      adaptationAction: item.adaptationAction,
      reason,
      loadIntent,
      consistency,
    }),
  };
}

function dosesForWeek(week: GeneratedWeek): Record<AppliedPlanDomain, AppliedTrainingDose | undefined> {
  const sessions = week.sessions;

  const rtr = sessions.filter((session) => isReturnToRun(session));
  const ordinaryRuns = sessions.filter((session) =>
    session.discipline === 'run' && !isReturnToRun(session));
  const bike = sessions.filter((session) => session.discipline === 'bike');
  const swim = sessions.filter((session) => session.discipline === 'swim');
  const strength = sessions.filter((session) => session.discipline === 'strength');

  const bikeLong = bike.filter((session) => isLongSession(session, 'bike'));
  const bikeQuality = bike.filter((session) => !bikeLong.includes(session) && isQualitySession(session));

  const runLong = ordinaryRuns.filter((session) => isLongSession(session, 'run'));
  const runQuality = ordinaryRuns.filter((session) => !runLong.includes(session) && isQualitySession(session));

  const swimQuality = swim.filter((session) => isQualitySession(session));
  const swimEndurance = swim.filter((session) => !swimQuality.includes(session) && isEnduranceSwim(session));

  return {
    return_to_run: aggregateDose(rtr, 'typical'),
    run_quality: aggregateDose(runQuality, 'max'),
    run_long: aggregateDose(runLong, 'max'),
    bike_quality: aggregateDose(bikeQuality, 'max'),
    bike_long: aggregateDose(bikeLong, 'max'),
    strength: aggregateDose(strength, 'typical'),
    swim_quality: aggregateDose(swimQuality, 'max'),
    swim_endurance: aggregateDose(swimEndurance, 'max'),
  };
}

function emptyDoseMap(): Record<AppliedPlanDomain, AppliedTrainingDose | undefined> {
  return {
    return_to_run: undefined,
    run_quality: undefined,
    run_long: undefined,
    bike_quality: undefined,
    bike_long: undefined,
    strength: undefined,
    swim_quality: undefined,
    swim_endurance: undefined,
  };
}

function aggregateDose(
  sessions: GeneratedSession[],
  representative: 'max' | 'typical',
): AppliedTrainingDose | undefined {
  if (!sessions.length) return undefined;
  const durations = sessions
    .map((session) => Math.max(0, Math.round(session.durationMinutes)))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  if (!durations.length) return undefined;

  const sessionMinutes = representative === 'max'
    ? durations.at(-1)!
    : medianRounded(durations);
  const representativeSession = [...sessions]
    .sort((left, right) =>
      Math.abs(left.durationMinutes - sessionMinutes) - Math.abs(right.durationMinutes - sessionMinutes))[0];

  return {
    sessionMinutes,
    weeklyMinutes: durations.reduce((sum, value) => sum + value, 0),
    frequency: durations.length,
    ...(representativeSession?.title ? { representativeTitle: representativeSession.title } : {}),
  };
}

function evidenceDoseForEndurance(
  summary: EnduranceAdaptationSummary,
  role: 'quality' | 'long' | 'endurance' | 'return_to_run',
): AppliedTrainingDose | undefined {
  const responses = summary.appliedResponses
    .filter((response) => response.role === role)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const latest = responses[0];
  if (!latest) return undefined;
  return {
    sessionMinutes: latest.plannedDurationMinutes,
    weeklyMinutes: latest.plannedDurationMinutes,
    frequency: 1,
    representativeTitle: latest.sessionTitle,
  };
}

function evidenceDoseForStrength(
  summary: StrengthAdaptationSummary,
): AppliedTrainingDose | undefined {
  const latest = summary.appliedResponses
    .filter((response) => response.plannedDurationMinutes !== undefined)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
  if (!latest?.plannedDurationMinutes) return undefined;
  return {
    sessionMinutes: latest.plannedDurationMinutes,
    weeklyMinutes: latest.plannedDurationMinutes,
    frequency: 1,
    representativeTitle: latest.sessionTitle,
  };
}

function mergePreviousDose(
  evidence: AppliedTrainingDose | undefined,
  generated: AppliedTrainingDose | undefined,
): AppliedTrainingDose | undefined {
  if (!evidence) return generated;
  if (!generated) return evidence;
  return {
    sessionMinutes: evidence.sessionMinutes ?? generated.sessionMinutes,
    weeklyMinutes: generated.weeklyMinutes,
    frequency: generated.frequency,
    representativeTitle: evidence.representativeTitle ?? generated.representativeTitle,
  };
}

function compareDose(
  previous: AppliedTrainingDose | undefined,
  current: AppliedTrainingDose | undefined,
): AppliedPlanAction {
  if (!previous && current) return 'introduced';
  if (previous && !current) return 'removed';
  if (!previous || !current) return 'hold';

  const sessionDelta = (current.sessionMinutes ?? 0) - (previous.sessionMinutes ?? 0);
  const weeklyDelta = current.weeklyMinutes - previous.weeklyMinutes;
  const frequencyDelta = current.frequency - previous.frequency;

  if (sessionDelta >= 2 || weeklyDelta >= 5 || frequencyDelta > 0) return 'progress';
  if (sessionDelta <= -2 || weeklyDelta <= -5 || frequencyDelta < 0) return 'reduce';
  return 'hold';
}

function doseDelta(
  previous: AppliedTrainingDose | undefined,
  current: AppliedTrainingDose | undefined,
): AppliedDoseDelta {
  return {
    ...(previous?.sessionMinutes !== undefined && current?.sessionMinutes !== undefined
      ? { sessionMinutes: current.sessionMinutes - previous.sessionMinutes }
      : {}),
    weeklyMinutes: (current?.weeklyMinutes ?? 0) - (previous?.weeklyMinutes ?? 0),
    frequency: (current?.frequency ?? 0) - (previous?.frequency ?? 0),
  };
}

function constraintsFor(
  domain: AppliedPlanDomain,
  adaptationAction: AdaptationAction,
  loadIntent: AppliedPlanDecisionSnapshot['loadIntent'],
): string[] {
  const values: string[] = [];
  if (adaptationAction === 'protect') values.push('response protection');
  if (adaptationAction === 'hold') values.push('response hold');
  if (
    loadIntent === 'recovery'
    || loadIntent === 'absorb'
    || loadIntent === 'taper'
    || loadIntent === 'race'
  ) values.push(`${loadIntent} week`);
  if (domain === 'return_to_run') values.push('RTR duration-before-speed gate');
  values.push('availability and weekly structure');
  return [...new Set(values)];
}

function consistencyFor(
  domain: AppliedPlanDomain,
  adaptationAction: AdaptationAction,
  action: AppliedPlanAction,
  loadIntent: AppliedPlanDecisionSnapshot['loadIntent'],
): AppliedPlanDecision['consistency'] {
  if (
    action === 'progress'
    && (adaptationAction === 'protect' || adaptationAction === 'hold')
  ) return 'review';

  if (
    domain === 'return_to_run'
    && action === 'progress'
    && adaptationAction !== 'progress_eligible'
  ) return 'review';

  if (
    action === 'progress'
    && (loadIntent === 'recovery' || loadIntent === 'absorb' || loadIntent === 'taper' || loadIntent === 'race')
  ) return 'review';

  return 'consistent';
}

function reasonFor(
  adaptationAction: AdaptationAction,
  action: AppliedPlanAction,
  loadIntent: AppliedPlanDecisionSnapshot['loadIntent'],
  consistency: AppliedPlanDecision['consistency'],
): AppliedPlanReason {
  if (consistency === 'review') return 'guardrail_conflict';
  if (action === 'introduced') return 'introduced';
  if (action === 'removed') return 'removed';

  const macrocycleOverride = loadIntent === 'recovery'
    || loadIntent === 'absorb'
    || loadIntent === 'taper'
    || loadIntent === 'race';

  if (adaptationAction === 'protect') return 'response_protect_applied';
  if (adaptationAction === 'hold') return 'response_hold_applied';
  if (adaptationAction === 'progress_eligible' && action === 'progress') return 'response_progression_applied';
  if (adaptationAction === 'progress_eligible' && macrocycleOverride) return 'response_progression_banked';
  if (adaptationAction === 'progress_eligible') return 'eligible_not_applied';
  if (action === 'progress') return 'macrocycle_progression';
  if (action === 'reduce') return 'macrocycle_reduction';
  return 'maintain';
}

function explainAppliedDecision({
  label,
  domain,
  previous,
  current,
  delta,
  action,
  adaptationAction,
  reason,
  loadIntent,
  consistency,
}: {
  label: string;
  domain: AppliedPlanDomain;
  previous: AppliedTrainingDose | undefined;
  current: AppliedTrainingDose | undefined;
  delta: AppliedDoseDelta;
  action: AppliedPlanAction;
  adaptationAction: AdaptationAction;
  reason: AppliedPlanReason;
  loadIntent: AppliedPlanDecisionSnapshot['loadIntent'];
  consistency: AppliedPlanDecision['consistency'];
}): string {
  const dose = doseTransitionText(previous, current, delta);

  if (consistency === 'review') {
    if (domain === 'return_to_run') {
      return `${dose} The generated plan increased return-to-run despite the cleared-response gate not authorizing progression. This requires review before Coach describes it as intentional.`;
    }
    return `${dose} The generated dose increased despite a hold/protect or macrocycle constraint. This requires review before Coach describes it as intentional.`;
  }

  if (reason === 'response_progression_applied') {
    return `${dose} The actual generated prescription increased after the completed-response state made normal progression eligible.`;
  }
  if (reason === 'response_progression_banked') {
    return `${dose} ${label} was progression-eligible, but the ${loadIntent ?? 'current'} week kept the actual prescription from increasing. The positive signal is banked rather than converted into more load.`;
  }
  if (reason === 'eligible_not_applied') {
    return `${dose} Progression was eligible, but the actual generated prescription stayed unchanged. Eligibility is permission, not a forced increase; availability and weekly structure still constrain the applied dose.`;
  }
  if (reason === 'response_hold_applied') {
    return `${dose} The actual generated prescription did not advance while the response state was HOLD.`;
  }
  if (reason === 'response_protect_applied') {
    return `${dose} The actual generated prescription stayed protected or came down while the response state was PROTECT.`;
  }
  if (reason === 'macrocycle_progression') {
    return `${dose} The generated plan increased this domain from race-horizon/weekly progression rather than attributing the increase to completed-response evidence.`;
  }
  if (reason === 'macrocycle_reduction') {
    return `${dose} The generated plan reduced this domain as part of the current weekly structure rather than as a punishment for one workout.`;
  }
  if (reason === 'introduced') {
    return `${dose} This domain appears in the current generated week without a comparable prior dose.`;
  }
  if (reason === 'removed') {
    return `${dose} This domain was present previously but is not prescribed in the current generated week.`;
  }

  return `${dose} The actual generated prescription is effectively unchanged, so Coach should describe this as maintenance rather than progression.`;
}

function doseTransitionText(
  previous: AppliedTrainingDose | undefined,
  current: AppliedTrainingDose | undefined,
  delta: AppliedDoseDelta,
): string {
  if (!previous && current) return `Introduced at ${doseText(current)}.`;
  if (previous && !current) return `Removed after ${doseText(previous)} previously.`;
  if (!previous || !current) return 'No comparable dose is available.';

  const before = doseText(previous);
  const after = doseText(current);
  const pieces: string[] = [`${before} → ${after}.`];
  if (delta.sessionMinutes) {
    pieces.push(`${signed(delta.sessionMinutes)} min per representative session.`);
  }
  if (delta.frequency) {
    pieces.push(`${signed(delta.frequency)} session${Math.abs(delta.frequency) === 1 ? '' : 's'} this week.`);
  }
  return pieces.join(' ');
}

function doseText(dose: AppliedTrainingDose): string {
  const pieces: string[] = [];
  if (dose.sessionMinutes !== undefined) pieces.push(`${dose.sessionMinutes} min`);
  pieces.push(`${dose.frequency}×/week`);
  if (dose.frequency > 1) pieces.push(`${dose.weeklyMinutes} min total`);
  return pieces.join(' · ');
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function choosePrimaryAppliedDecision(
  decisions: AppliedPlanDecision[],
): AppliedPlanDecision | null {
  if (!decisions.length) return null;
  const actionPriority: Record<AppliedPlanAction, number> = {
    progress: 30,
    reduce: 25,
    removed: 20,
    introduced: 15,
    hold: 10,
  };
  const domainPriority: Record<AppliedPlanDomain, number> = {
    return_to_run: 8,
    run_quality: 7,
    run_long: 6,
    bike_quality: 5,
    bike_long: 4,
    strength: 3,
    swim_quality: 2,
    swim_endurance: 1,
  };

  return [...decisions].sort((left, right) => {
    if (left.consistency !== right.consistency) return left.consistency === 'review' ? -1 : 1;

    const leftAdapt = adaptationPriority(left.adaptationAction);
    const rightAdapt = adaptationPriority(right.adaptationAction);
    if (leftAdapt !== rightAdapt) return rightAdapt - leftAdapt;

    if (actionPriority[left.action] !== actionPriority[right.action]) {
      return actionPriority[right.action] - actionPriority[left.action];
    }
    return domainPriority[right.domain] - domainPriority[left.domain];
  })[0] ?? null;
}

function adaptationPriority(action: AdaptationAction): number {
  if (action === 'protect') return 40;
  if (action === 'hold') return 30;
  if (action === 'progress_eligible') return 20;
  return 10;
}

function isReturnToRun(session: GeneratedSession): boolean {
  if (session.discipline !== 'run') return false;
  const text = sessionText(session);
  return /return[\s-]*to[\s-]*run|run\s*\/\s*walk|walk[\s-]*run|\brtr\b/.test(text);
}

function isLongSession(session: GeneratedSession, discipline: 'bike' | 'run'): boolean {
  if (session.discipline !== discipline) return false;
  const text = sessionText(session);
  if (discipline === 'bike') {
    return /long ride|long aerobic|long endurance|fueling practice|rolling terrain|hills|full rehearsal/.test(text);
  }
  return /\blong\b/.test(text);
}

function isQualitySession(session: GeneratedSession): boolean {
  const text = sessionText(session);
  const intensity = String(session.intensity ?? '').toLowerCase();
  return intensity === 'hard'
    || /vo2|threshold|tempo|over\s*\/\s*under|interval|quality|race pace|surges|track/.test(text);
}

function isEnduranceSwim(session: GeneratedSession): boolean {
  if (session.discipline !== 'swim') return false;
  const text = sessionText(session);
  return /endurance|long water|aerobic|steady/.test(text) || !isQualitySession(session);
}

function sessionText(session: GeneratedSession): string {
  return [
    session.title,
    ...(session.rationale ?? []),
  ].join(' ').toLowerCase();
}

function medianRounded(values: number[]): number {
  if (!values.length) return 0;
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[middle]!;
  return Math.round((values[middle - 1]! + values[middle]!) / 2);
}

function dateInWeek(date: string, weekStartDate: string): boolean {
  return date >= weekStartDate && date <= addDays(weekStartDate, 6);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
