import type { TrainingBlockPlan } from '@circuit/domain';

import type {
  AppliedPlanDecision,
  AppliedPlanDecisionSnapshot,
} from './applied-plan-decision';
import type {
  AdaptationAction,
  CompletedWorkoutAdaptationSnapshot,
  EnduranceAdaptationSummary,
  EnduranceResponseRequest,
  StrengthAdaptationSummary,
} from './completed-workout-adaptation';

export interface CoachDevelopmentWeekLike {
  weekStartDate: string;
  weekNumber: number;
  totalWeeks: number;
  phase: string;
  loadIntent: 'build' | 'absorb' | 'recovery' | 'taper' | 'race';
  weekPurpose: string;
  runMode: 'return_to_run' | 'easy_rebuild' | 'normal';
  bikeQuality: { title: string; objective: string };
  longRide: { title: string; objective: string };
  runObjective: string;
  strengthObjective: string;
}

export interface CoachDevelopmentPlanLike {
  weeks: CoachDevelopmentWeekLike[];
}

export interface CoachDecisionTraceItem {
  label: string;
  text: string;
}

export interface CoachDecisionBrief {
  weekStartDate: string;
  eyebrow: string;
  headline: string;
  summary: string;
  whatChanged: CoachDecisionTraceItem[];
  evidence: CoachDecisionTraceItem[];
  keptStable: CoachDecisionTraceItem[];
  nextCheck: string;
  statusChips: Array<{ label: string; value: string }>;
  decisionLevel: 'protect' | 'hold' | 'progress' | 'maintain';
}

type AnyAdaptationSummary = StrengthAdaptationSummary | EnduranceAdaptationSummary;

interface ScopedAdaptation {
  label: 'RTR' | 'RUN' | 'BIKE' | 'STRENGTH' | 'SWIM';
  scopeName: string;
  summary: AnyAdaptationSummary;
}

export function buildCoachDecisionBrief({
  block,
  developmentPlan,
  adaptation,
  appliedPlan,
  asOf,
}: {
  block: TrainingBlockPlan;
  developmentPlan?: CoachDevelopmentPlanLike | null;
  adaptation?: CompletedWorkoutAdaptationSnapshot | null;
  appliedPlan?: AppliedPlanDecisionSnapshot | null;
  asOf: string;
}): CoachDecisionBrief {
  const today = asOf.slice(0, 10);
  const blockWeek = trainingWeekForDate(block, today);
  const weekStartDate = blockWeek?.weekStartDate
    ?? developmentPlan?.weeks.find((week) => dateInWeek(today, week.weekStartDate))?.weekStartDate
    ?? today;
  const developmentWeek = developmentPlan?.weeks.find((week) => week.weekStartDate === weekStartDate)
    ?? developmentPlan?.weeks.find((week) => dateInWeek(today, week.weekStartDate))
    ?? null;
  const previousDevelopmentWeek = developmentWeek
    ? developmentPlan?.weeks.find((week) => week.weekNumber === developmentWeek.weekNumber - 1) ?? null
    : null;

  const scopes = adaptationScopes(adaptation);
  const primaryScope = choosePrimaryScope(scopes);
  const phaseTransition = Boolean(
    developmentWeek
    && previousDevelopmentWeek
    && developmentWeek.phase !== previousDevelopmentWeek.phase,
  );
  const loadTransition = Boolean(
    developmentWeek
    && previousDevelopmentWeek
    && developmentWeek.loadIntent !== previousDevelopmentWeek.loadIntent,
  );
  const macrocycleOverride = developmentWeek
    && (developmentWeek.loadIntent === 'recovery'
      || developmentWeek.loadIntent === 'absorb'
      || developmentWeek.loadIntent === 'taper'
      || developmentWeek.loadIntent === 'race')
    ? developmentWeek.loadIntent
    : null;

  const whatChanged: CoachDecisionTraceItem[] = [];
  const evidence: CoachDecisionTraceItem[] = [];
  const keptStable: CoachDecisionTraceItem[] = [];

  if (phaseTransition && developmentWeek && previousDevelopmentWeek) {
    whatChanged.push({
      label: 'Race horizon',
      text: `${phaseLabel(previousDevelopmentWeek.phase)} → ${phaseLabel(developmentWeek.phase)}. The week now follows the ${phaseLabel(developmentWeek.phase).toLowerCase()} objective.`,
    });
  }

  if (loadTransition && developmentWeek && previousDevelopmentWeek) {
    whatChanged.push({
      label: 'Weekly load',
      text: `${loadIntentLabel(previousDevelopmentWeek.loadIntent)} → ${loadIntentLabel(developmentWeek.loadIntent)}. ${loadIntentDecisionText(developmentWeek.loadIntent)}`,
    });
  }

  if (appliedPlan?.primary) {
    whatChanged.push(appliedDecisionTrace(appliedPlan.primary));
  } else if (primaryScope && primaryScope.summary.action !== 'learning') {
    whatChanged.push(decisionTraceForScope(primaryScope, macrocycleOverride));
  }

  if (!whatChanged.length) {
    whatChanged.push({
      label: 'Current week',
      text: 'No reactive plan change. Side Quest is keeping the current week intact while it gathers another comparable response.',
    });
  }

  if (appliedPlan?.primary) {
    evidence.push({
      label: 'Applied plan delta',
      text: appliedPlan.primary.explanation,
    });
  }

  if (primaryScope) {
    evidence.push({
      label: primaryScope.scopeName,
      text: primaryScope.summary.body,
    });
    evidence.push(...rawEvidenceForScope(primaryScope).slice(0, 2));
  } else if (developmentWeek) {
    evidence.push({
      label: 'Race horizon',
      text: developmentWeek.weekPurpose,
    });
  } else {
    evidence.push({
      label: 'Evidence state',
      text: 'There is not enough completed-response evidence yet to justify a new dose decision.',
    });
  }

  const pendingCount = totalPendingEvidence(adaptation);
  if (pendingCount > 0) {
    evidence.push({
      label: 'Queued evidence',
      text: `${pendingCount} completed response${pendingCount === 1 ? '' : 's'} from this week ${pendingCount === 1 ? 'is' : 'are'} intentionally waiting for the next planning decision instead of rewriting this week midstream.`,
    });
  }

  if (appliedPlan?.primary && appliedPlan.primary.action === 'hold') {
    keptStable.push({
      label: 'Applied dose',
      text: appliedPlan.primary.adaptationAction === 'progress_eligible'
        ? 'Progression eligibility did not automatically become a larger prescription. The actual generated dose stayed unchanged.'
        : 'The actual generated dose stayed unchanged; Coach reports maintenance rather than inferring a progression from intent.',
    });
  }

  if (developmentWeek) {
    keptStable.push({
      label: 'Week architecture',
      text: macrocycleOverride
        ? `${loadIntentLabel(developmentWeek.loadIntent)} stays intact. Positive fitness signals are banked rather than used to defeat the macrocycle’s fatigue-management intent.`
        : `The ${phaseLabel(developmentWeek.phase)} phase, key workout roles, and race-horizon purpose stay intact; response evidence changes progression eligibility, not the entire weekly architecture.`,
    });

    if (developmentWeek.runMode === 'return_to_run') {
      keptStable.push({
        label: 'Return to run',
        text: 'Running remains duration-before-speed. No completed run overrides the three-cleared-exposure gate or an active symptom restriction.',
      });
    } else {
      keptStable.push({
        label: 'Key endurance roles',
        text: `${developmentWeek.bikeQuality.title} and ${developmentWeek.longRide.title} keep their intended roles unless health, availability, or an approved Coach change requires otherwise.`,
      });
    }
  } else {
    keptStable.push({
      label: 'Plan architecture',
      text: 'Health restrictions, availability ceilings, and the existing weekly structure remain higher-priority guardrails than a single positive workout response.',
    });
  }

  if (adaptation?.pendingResponseRequests.length) {
    keptStable.push({
      label: 'Missing response data',
      text: 'An unanswered session or next-day check does not get silently interpreted as positive tolerance.',
    });
  }

  const decisionLevel = appliedPlan?.primary
    ? decisionLevelFromApplied(appliedPlan.primary)
    : decisionLevelFor(primaryScope?.summary.action, macrocycleOverride);
  const headline = appliedPlan?.primary
    ? appliedDecisionHeadline(appliedPlan.primary)
    : decisionHeadline({
        primaryScope,
        macrocycleOverride,
        developmentWeek,
        phaseTransition,
        loadTransition,
      });
  const summary = appliedPlan?.primary
    ? appliedDecisionSummary(appliedPlan.primary, primaryScope, pendingCount)
    : decisionSummary({
        primaryScope,
        macrocycleOverride,
        developmentWeek,
        pendingCount,
      });

  return {
    weekStartDate,
    eyebrow: developmentWeek
      ? `${phaseLabel(developmentWeek.phase).toUpperCase()} · WEEK ${developmentWeek.weekNumber} OF ${developmentWeek.totalWeeks} · ${loadIntentLabel(developmentWeek.loadIntent).toUpperCase()}`
      : `WEEK OF ${formatShortDate(weekStartDate).toUpperCase()}`,
    headline,
    summary,
    whatChanged: whatChanged.slice(0, 3),
    evidence: dedupeTrace(evidence).slice(0, 4),
    keptStable: dedupeTrace(keptStable).slice(0, 3),
    nextCheck: appliedPlan?.primary?.consistency === 'review'
      ? `Review the ${appliedPlan.primary.label.toLowerCase()} plan delta before treating it as an intentional coaching change.`
      : nextCheckText(adaptation, primaryScope, macrocycleOverride),
    statusChips: adaptation?.statusChips.map((chip) => ({
      label: chip.label,
      value: chip.actionLabel,
    })) ?? [],
    decisionLevel,
  };
}

function appliedDecisionTrace(
  decision: AppliedPlanDecision,
): CoachDecisionTraceItem {
  return {
    label: decision.label,
    text: appliedActionText(decision),
  };
}

function appliedActionText(decision: AppliedPlanDecision): string {
  const transition = compactDoseTransition(decision);
  if (decision.consistency === 'review') {
    return `${transition} · REVIEW. The actual generated delta conflicts with the current adaptation or macrocycle guardrail.`;
  }
  if (decision.action === 'progress') return `${transition} · PROGRESS. The generated prescription actually increased.`;
  if (decision.action === 'reduce') return `${transition} · REDUCE. The generated prescription actually came down.`;
  if (decision.action === 'introduced') return `${transition} · INTRODUCED.`;
  if (decision.action === 'removed') return `${transition} · REMOVED.`;
  return `${transition} · HOLD. The generated prescription did not increase.`;
}

function compactDoseTransition(decision: AppliedPlanDecision): string {
  const before = decision.previousDose?.sessionMinutes;
  const after = decision.currentDose?.sessionMinutes;
  if (before !== undefined && after !== undefined) {
    return `${before} → ${after} min`;
  }
  if (!decision.previousDose && decision.currentDose) {
    return `New: ${decision.currentDose.sessionMinutes ?? decision.currentDose.weeklyMinutes} min`;
  }
  if (decision.previousDose && !decision.currentDose) {
    return `Previously ${decision.previousDose.sessionMinutes ?? decision.previousDose.weeklyMinutes} min → no current session`;
  }
  return `${decision.previousDose?.weeklyMinutes ?? 0} → ${decision.currentDose?.weeklyMinutes ?? 0} weekly min`;
}

function decisionLevelFromApplied(
  decision: AppliedPlanDecision,
): CoachDecisionBrief['decisionLevel'] {
  if (decision.consistency === 'review') return 'protect';
  if (decision.adaptationAction === 'protect') return 'protect';
  if (decision.adaptationAction === 'hold') return 'hold';
  if (decision.action === 'progress') return 'progress';
  return 'maintain';
}

function appliedDecisionHeadline(decision: AppliedPlanDecision): string {
  const transition = compactDoseTransition(decision);
  if (decision.consistency === 'review') {
    return `${decision.label}: ${transition}. Review the generated delta.`;
  }
  if (decision.action === 'progress') return `${decision.label}: ${transition}. Progress applied.`;
  if (decision.action === 'reduce') return `${decision.label}: ${transition}. Dose reduced.`;
  if (decision.action === 'hold') return `${decision.label}: ${transition}. Hold applied.`;
  if (decision.action === 'introduced') return `${decision.label}: introduced in the current week.`;
  return `${decision.label}: removed from the current week.`;
}

function appliedDecisionSummary(
  decision: AppliedPlanDecision,
  primaryScope: ScopedAdaptation | null,
  pendingCount: number,
): string {
  const parts = [decision.explanation];
  if (primaryScope) parts.push(primaryScope.summary.body);
  if (pendingCount > 0) {
    parts.push('Current-week response evidence is still deferred to the next week-boundary decision.');
  }
  return parts.join(' ');
}

function adaptationScopes(
  adaptation: CompletedWorkoutAdaptationSnapshot | null | undefined,
): ScopedAdaptation[] {
  if (!adaptation) return [];
  const values: ScopedAdaptation[] = [
    { label: 'RTR', scopeName: 'Return to run', summary: adaptation.returnToRun },
    { label: 'RUN', scopeName: 'Run', summary: adaptation.endurance.run },
    { label: 'BIKE', scopeName: 'Bike', summary: adaptation.endurance.bike },
    { label: 'STRENGTH', scopeName: 'Strength', summary: adaptation.strength },
    { label: 'SWIM', scopeName: 'Swim', summary: adaptation.endurance.swim },
  ];
  return values.filter(({ summary }) =>
    summary.evidenceCount > 0
    || summary.pendingEvidenceCount > 0
    || summary.healthOverride !== 'none');
}

function choosePrimaryScope(scopes: ScopedAdaptation[]): ScopedAdaptation | null {
  if (!scopes.length) return null;
  const actionPriority: Record<AdaptationAction, number> = {
    protect: 40,
    hold: 30,
    progress_eligible: 20,
    learning: 10,
  };
  const scopePriority: Record<ScopedAdaptation['label'], number> = {
    RTR: 5,
    RUN: 4,
    BIKE: 3,
    STRENGTH: 2,
    SWIM: 1,
  };
  return [...scopes].sort((left, right) =>
    (actionPriority[right.summary.action] - actionPriority[left.summary.action])
    || (right.summary.evidenceCount - left.summary.evidenceCount)
    || (scopePriority[right.label] - scopePriority[left.label])
  )[0] ?? null;
}

function decisionTraceForScope(
  scope: ScopedAdaptation,
  macrocycleOverride: CoachDevelopmentWeekLike['loadIntent'] | null,
): CoachDecisionTraceItem {
  const action = scope.summary.action;
  if (action === 'protect') {
    return {
      label: scope.scopeName,
      text: `Protect ${scope.scopeName.toLowerCase()} progression. Completed work still counts, but the next comparable dose is not allowed to advance from the current evidence.`,
    };
  }
  if (action === 'hold') {
    return {
      label: scope.scopeName,
      text: `Hold ${scope.scopeName.toLowerCase()} progression at the current step until the response is clearer.`,
    };
  }
  if (action === 'progress_eligible') {
    return {
      label: scope.scopeName,
      text: macrocycleOverride
        ? `${scope.scopeName} is progression-eligible, but this ${loadIntentLabel(macrocycleOverride).toLowerCase()} week banks that positive signal instead of adding load.`
        : `Allow normal ${scope.scopeName.toLowerCase()} progression when the weekly structure, recovery, and availability permit it.`,
    };
  }
  return {
    label: scope.scopeName,
    text: `Keep ${scope.scopeName.toLowerCase()} steady while Side Quest gathers another comparable response.`,
  };
}

function rawEvidenceForScope(scope: ScopedAdaptation): CoachDecisionTraceItem[] {
  if (scope.label === 'STRENGTH') {
    const summary = scope.summary as StrengthAdaptationSummary;
    return summary.appliedResponses.slice(0, 2).map((response) => {
      const details = [
        completionKindLabel(response.completionKind),
        response.difficulty ? difficultyLabel(response.difficulty) : null,
        response.rpe !== undefined ? `RPE ${response.rpe}/10` : null,
      ].filter(Boolean);
      return {
        label: response.sessionTitle,
        text: details.join(' · ') || 'Completed strength response recorded.',
      };
    });
  }

  const summary = scope.summary as EnduranceAdaptationSummary;
  return summary.appliedResponses.slice(0, 2).map((response) => {
    const details = [
      `${response.actualDurationMinutes}/${response.plannedDurationMinutes} min`,
      response.perceivedDifficulty ? difficultyLabel(response.perceivedDifficulty) : null,
      response.sessionRpe !== undefined ? `RPE ${response.sessionRpe}/10` : null,
      response.symptomsDuring === false && response.symptomsAfter === false ? 'no symptoms during/after' : null,
      response.nextDayStatus === 'same_or_better' ? 'next day same/better' : null,
      response.nextDayStatus === 'worse' ? 'next day worse' : null,
    ].filter(Boolean);
    return {
      label: response.sessionTitle,
      text: details.join(' · ') || completionKindLabel(response.completionKind),
    };
  });
}

function nextCheckText(
  adaptation: CompletedWorkoutAdaptationSnapshot | null | undefined,
  primaryScope: ScopedAdaptation | null,
  macrocycleOverride: CoachDevelopmentWeekLike['loadIntent'] | null,
): string {
  const request = adaptation?.pendingResponseRequests[0];
  if (request) return responseRequestNextCheck(request);

  if (totalPendingEvidence(adaptation) > 0) {
    return 'Current-week completed responses are queued. Reassess them at the next week-boundary planning decision rather than changing this week midstream.';
  }

  if (primaryScope?.summary.action === 'protect') {
    return `Reassess ${primaryScope.scopeName.toLowerCase()} after the next comparable response and after any active symptom restriction has cleared.`;
  }
  if (primaryScope?.summary.action === 'hold') {
    return `Look for a clean, repeatable ${primaryScope.scopeName.toLowerCase()} response before reopening progression.`;
  }
  if (primaryScope?.summary.action === 'progress_eligible') {
    if (macrocycleOverride) {
      return `Carry the positive ${primaryScope.scopeName.toLowerCase()} signal into the next non-${loadIntentLabel(macrocycleOverride).toLowerCase()} planning decision.`;
    }
    return `Confirm the next comparable ${primaryScope.scopeName.toLowerCase()} session remains repeatable; progression is permission, not a forced jump.`;
  }

  return 'Keep collecting completed-session responses. One isolated good or bad session does not force a plan rewrite.';
}

function responseRequestNextCheck(request: EnduranceResponseRequest): string {
  if (request.stage === 'next_day') {
    return `Complete the next-day RTR check for ${request.sessionTitle}. That run cannot count as cleared progression evidence until the next-day response is known.`;
  }
  return `Capture “How did this session go?” for ${request.sessionTitle}. Completion counts as training load, but the missing response is not treated as positive tolerance.`;
}

function decisionHeadline({
  primaryScope,
  macrocycleOverride,
  developmentWeek,
  phaseTransition,
  loadTransition,
}: {
  primaryScope: ScopedAdaptation | null;
  macrocycleOverride: CoachDevelopmentWeekLike['loadIntent'] | null;
  developmentWeek: CoachDevelopmentWeekLike | null;
  phaseTransition: boolean;
  loadTransition: boolean;
}): string {
  if (primaryScope?.summary.action === 'protect') {
    return `Protect ${primaryScope.scopeName.toLowerCase()}; keep the rest of the week coherent.`;
  }
  if (primaryScope?.summary.action === 'hold') {
    return `Hold ${primaryScope.scopeName.toLowerCase()}; do not overreact elsewhere.`;
  }
  if (macrocycleOverride) {
    const verb = macrocycleOverride === 'recovery' || macrocycleOverride === 'absorb'
      ? 'Absorb the block'
      : macrocycleOverride === 'taper'
        ? 'Reduce fatigue'
        : 'Preserve race readiness';
    return primaryScope?.summary.action === 'progress_eligible'
      ? `${verb}; bank the positive ${primaryScope.scopeName.toLowerCase()} signal.`
      : `${verb}; keep the race-horizon intent intact.`;
  }
  if (primaryScope?.summary.action === 'progress_eligible') {
    return `Progress ${primaryScope.scopeName.toLowerCase()} only as the week permits.`;
  }
  if (phaseTransition && developmentWeek) {
    return `Move into ${phaseLabel(developmentWeek.phase).toLowerCase()} without discarding the evidence already earned.`;
  }
  if (loadTransition && developmentWeek) {
    return `${loadIntentLabel(developmentWeek.loadIntent)} is the deliberate call this week.`;
  }
  return 'Stay the course; no new evidence justifies a reactive change.';
}

function decisionSummary({
  primaryScope,
  macrocycleOverride,
  developmentWeek,
  pendingCount,
}: {
  primaryScope: ScopedAdaptation | null;
  macrocycleOverride: CoachDevelopmentWeekLike['loadIntent'] | null;
  developmentWeek: CoachDevelopmentWeekLike | null;
  pendingCount: number;
}): string {
  const parts: string[] = [];
  if (primaryScope) parts.push(primaryScope.summary.body);
  else if (developmentWeek) parts.push(developmentWeek.weekPurpose);
  else parts.push('The current plan remains the best-supported decision with the evidence available.');

  if (macrocycleOverride && primaryScope?.summary.action === 'progress_eligible') {
    parts.push(`The ${loadIntentLabel(macrocycleOverride).toLowerCase()} week outranks the progression signal for now.`);
  }
  if (pendingCount > 0) {
    parts.push('New responses from this week are visible to Coach but intentionally deferred to the next week-boundary decision.');
  }
  return parts.join(' ');
}

function decisionLevelFor(
  action: AdaptationAction | undefined,
  macrocycleOverride: CoachDevelopmentWeekLike['loadIntent'] | null,
): CoachDecisionBrief['decisionLevel'] {
  if (action === 'protect') return 'protect';
  if (action === 'hold') return 'hold';
  if (macrocycleOverride) return 'maintain';
  if (action === 'progress_eligible') return 'progress';
  return 'maintain';
}

function totalPendingEvidence(
  adaptation: CompletedWorkoutAdaptationSnapshot | null | undefined,
): number {
  if (!adaptation) return 0;
  return adaptation.strength.pendingEvidenceCount
    + adaptation.endurance.swim.pendingEvidenceCount
    + adaptation.endurance.bike.pendingEvidenceCount
    + adaptation.endurance.run.pendingEvidenceCount
    + adaptation.returnToRun.pendingEvidenceCount;
}

function trainingWeekForDate(
  block: TrainingBlockPlan,
  date: string,
): TrainingBlockPlan['weeks'][number] | null {
  return block.weeks.find((week) => dateInWeek(date, week.weekStartDate)) ?? null;
}

function dateInWeek(date: string, weekStartDate: string): boolean {
  return date >= weekStartDate && date <= addDays(weekStartDate, 6);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function phaseLabel(value: string): string {
  if (value === 'race_week') return 'Race Week';
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function loadIntentLabel(value: CoachDevelopmentWeekLike['loadIntent']): string {
  if (value === 'build') return 'Progress week';
  if (value === 'absorb') return 'Absorb week';
  if (value === 'recovery') return 'Recovery week';
  if (value === 'taper') return 'Taper';
  return 'Race week';
}

function loadIntentDecisionText(value: CoachDevelopmentWeekLike['loadIntent']): string {
  if (value === 'build') return 'Normal progression can proceed where response evidence supports it.';
  if (value === 'absorb') return 'Fitness is consolidated without chasing another load increase.';
  if (value === 'recovery') return 'Volume and residual fatigue are deliberately reduced.';
  if (value === 'taper') return 'Volume comes down while short race-relevant intensity is preserved.';
  return 'Freshness and race execution outrank fitness-building volume.';
}

function completionKindLabel(value: string): string {
  if (value === 'completed_as_planned') return 'completed as planned';
  if (value === 'completed_modified') return 'completed with modification';
  if (value === 'completed_partial') return 'partial completion';
  return value.replaceAll('_', ' ');
}

function difficultyLabel(value: string): string {
  if (value === 'appropriate' || value === 'about_right') return 'about right';
  if (value === 'too_easy') return 'too easy';
  if (value === 'too_hard') return 'too hard';
  return value.replaceAll('_', ' ');
}

function dedupeTrace(items: CoachDecisionTraceItem[]): CoachDecisionTraceItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.label}:${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatShortDate(value: string): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}
