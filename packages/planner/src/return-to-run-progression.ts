import type {
  WholeAthletePlannedSession,
  WholeAthleteWeekPlan,
} from './whole-athlete-week';

export type ReturnToRunMode = 'walk_run' | 'continuous';

export interface ReturnToRunPrescription {
  mode: ReturnToRunMode;
  repeats: number;
  runMinutes: number;
  walkMinutes: number;
  runningMinutes: number;
  elapsedMinutes: number;
  protocolWeek: number;
  longExposure: boolean;
}

export interface ReturnToRunCompletedExposure {
  discipline: string;
  completedAt: string;
  durationMinutes?: number;
  completedAsPlanned?: boolean;
}

export interface ReturnToRunProgressionInput {
  weekIndex: number;
  recentBoneStress: boolean;
  recentCompletedRunMinutes?: number[];
}

interface ReturnToRunStep {
  mode: ReturnToRunMode;
  repeats: number;
  runMinutes: number;
  walkMinutes: number;
  elapsedMinutes: number;
}

const CONSERVATIVE_WALK_RUN: ReturnToRunStep[] = [
  walkRunStep(6, 1, 1),
  walkRunStep(6, 2, 1),
  walkRunStep(6, 3, 1),
  walkRunStep(6, 4, 1),
  walkRunStep(6, 5, 1),
];

const ESTABLISHED_RETURN: ReturnToRunStep[] = [
  walkRunStep(4, 4, 1),
  walkRunStep(4, 5, 1),
  walkRunStep(4, 6, 1),
  walkRunStep(4, 7, 1),
  walkRunStep(3, 10, 1),
  continuousStep(35),
  continuousStep(40),
  continuousStep(45),
  continuousStep(50),
  continuousStep(55),
  continuousStep(60),
];

export function recentReturnToRunDurations(
  exposures: ReturnToRunCompletedExposure[],
  weekStartDate: string,
  lookbackDays = 21,
): number[] {
  const cutoff = addDays(weekStartDate, -Math.max(1, Math.round(lookbackDays)));

  return exposures
    .filter((exposure) => exposure.discipline === 'run')
    .filter((exposure) => exposure.completedAsPlanned !== false)
    .filter((exposure) => exposure.completedAt.slice(0, 10) >= cutoff)
    .filter((exposure) => exposure.completedAt.slice(0, 10) < weekStartDate)
    .filter((exposure) => Number.isFinite(exposure.durationMinutes) && (exposure.durationMinutes ?? 0) > 0)
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt))
    .slice(-6)
    .map((exposure) => Math.max(1, Math.round(exposure.durationMinutes!)));
}

export function returnToRunPrescriptionForWeek(
  input: ReturnToRunProgressionInput,
  ordinal = 0,
  totalRuns = 3,
): ReturnToRunPrescription {
  const week = Math.max(0, Math.floor(input.weekIndex));
  const isLongExposure = totalRuns >= 3 && ordinal === totalRuns - 1;
  const completed = sanitizeCompletedMinutes(input.recentCompletedRunMinutes);

  if (completed.length >= 3) {
    const representative = median(completed.slice(-3));
    const startIndex = firstEstablishedStepAfter(representative);
    return prescriptionFromEstablishedStep(
      startIndex + week,
      isLongExposure,
      week,
    );
  }

  if (input.recentBoneStress) {
    if (week < CONSERVATIVE_WALK_RUN.length) {
      return prescriptionFromStep(CONSERVATIVE_WALK_RUN[week]!, week, false);
    }

    const continuousWeek = week - CONSERVATIVE_WALK_RUN.length;
    const easyMinutes = Math.min(55, 30 + continuousWeek * 5);
    const longMinutes = Math.min(90, 35 + continuousWeek * 10);
    return continuousPrescription(
      isLongExposure ? longMinutes : easyMinutes,
      week,
      isLongExposure,
    );
  }

  return prescriptionFromEstablishedStep(week, isLongExposure, week);
}

export function applyReturnToRunProgression(
  plan: WholeAthleteWeekPlan,
  input: ReturnToRunProgressionInput,
): WholeAthleteWeekPlan {
  const generatedRuns = plan.sessions
    .filter((session) =>
      session.discipline === 'run'
      && session.planningCommitment === 'generated')
    .sort((left, right) =>
      left.date.localeCompare(right.date) || left.id.localeCompare(right.id));

  if (!generatedRuns.length) return plan;

  const prescriptions = new Map(
    generatedRuns.map((session, ordinal) => [
      session.id,
      returnToRunPrescriptionForWeek(input, ordinal, generatedRuns.length),
    ]),
  );

  const beforeMinutes = totalMinutes(plan.sessions);

  let sessions = plan.sessions.map((session) => {
    const prescription = prescriptions.get(session.id);
    if (!prescription) return session;

    const protocol = prescription.mode === 'walk_run'
      ? `${prescription.repeats} × ${prescription.runMinutes} min easy run / ${prescription.walkMinutes} min walk`
      : `${prescription.elapsedMinutes} min continuous easy running`;

    return {
      ...session,
      durationMinutes: prescription.elapsedMinutes,
      intensity: 'easy' as const,
      keySession: false,
      rationale: unique([
        ...session.rationale,
        `Return-to-run protocol: ${protocol}.`,
        `${prescription.runningMinutes} min of running exposure; ${prescription.elapsedMinutes} min elapsed.`,
        prescription.longExposure
          ? 'This is the longest easy run exposure of the week; duration grows before speed.'
          : 'Return-to-run frequency stays at three exposures while dose progresses gradually.',
        'Forecast progression assumes the current step remains symptom-free; clinician/PT restrictions, injury-site symptoms, and the athlete check-in override automatic progression.',
      ]),
    };
  });

  const afterRunMinutes = totalMinutes(sessions);
  const approvedCeiling = Math.max(plan.targetMinutes, beforeMinutes);
  let overflow = Math.max(0, afterRunMinutes - approvedCeiling);

  if (overflow > 0) {
    const reducible = sessions
      .filter(isReducibleBike)
      .sort((left, right) => right.durationMinutes - left.durationMinutes);

    for (const candidate of reducible) {
      if (overflow <= 0) break;
      const floor = 45;
      const available = Math.max(0, candidate.durationMinutes - floor);
      if (!available) continue;
      const reduction = Math.min(overflow, available);
      sessions = sessions.map((session) =>
        session.id === candidate.id
          ? {
              ...session,
              durationMinutes: session.durationMinutes - reduction,
              rationale: unique([
                ...session.rationale,
                'Bike support time was reduced so progressing return-to-run exposure stays inside the approved weekly load.',
              ]),
            }
          : session);
      overflow -= reduction;
    }
  }

  const afterMinutes = totalMinutes(sessions);
  const delta = afterMinutes - beforeMinutes;
  const generatedBefore = generatedMinutes(plan.sessions);
  const generatedAfter = generatedMinutes(sessions);

  return {
    ...plan,
    sessions,
    plannedMinutes: Math.max(0, plan.plannedMinutes + delta),
    generatedMinutes: Math.max(
      0,
      plan.generatedMinutes + (generatedAfter - generatedBefore),
    ),
    disciplineSummary: refreshRunSummary(plan.disciplineSummary, sessions),
    warnings: overflow > 0
      ? unique([
          ...plan.warnings,
          'Return-to-run progression could not be fully reconciled inside the approved weekly load without reducing protected/key work.',
        ])
      : plan.warnings,
  };
}

function prescriptionFromEstablishedStep(
  rawIndex: number,
  isLongExposure: boolean,
  protocolWeek: number,
): ReturnToRunPrescription {
  const index = Math.max(0, Math.floor(rawIndex));
  const step = ESTABLISHED_RETURN[Math.min(index, ESTABLISHED_RETURN.length - 1)]!;

  if (step.mode === 'walk_run') {
    return prescriptionFromStep(step, protocolWeek, false);
  }

  const easyMinutes = step.elapsedMinutes;
  const longMinutes = Math.min(120, easyMinutes + Math.max(10, (index - 5) * 5));
  return continuousPrescription(
    isLongExposure ? longMinutes : easyMinutes,
    protocolWeek,
    isLongExposure,
  );
}

function prescriptionFromStep(
  step: ReturnToRunStep,
  protocolWeek: number,
  longExposure: boolean,
): ReturnToRunPrescription {
  if (step.mode === 'continuous') {
    return continuousPrescription(step.elapsedMinutes, protocolWeek, longExposure);
  }
  return walkRunPrescription(
    step.repeats,
    step.runMinutes,
    step.walkMinutes,
    protocolWeek,
    longExposure,
  );
}

function firstEstablishedStepAfter(minutes: number): number {
  const index = ESTABLISHED_RETURN.findIndex((step) => step.elapsedMinutes > minutes);
  return index >= 0 ? index : ESTABLISHED_RETURN.length - 1;
}

function sanitizeCompletedMinutes(values: number[] | undefined): number[] {
  return (values ?? [])
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.max(1, Math.round(value)));
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function walkRunStep(
  repeats: number,
  runMinutes: number,
  walkMinutes: number,
): ReturnToRunStep {
  return {
    mode: 'walk_run',
    repeats,
    runMinutes,
    walkMinutes,
    elapsedMinutes: repeats * (runMinutes + walkMinutes),
  };
}

function continuousStep(minutes: number): ReturnToRunStep {
  return {
    mode: 'continuous',
    repeats: 1,
    runMinutes: minutes,
    walkMinutes: 0,
    elapsedMinutes: minutes,
  };
}

function walkRunPrescription(
  repeats: number,
  runMinutes: number,
  walkMinutes: number,
  protocolWeek: number,
  longExposure: boolean,
): ReturnToRunPrescription {
  const runningMinutes = repeats * runMinutes;
  const elapsedMinutes = repeats * (runMinutes + walkMinutes);
  return {
    mode: 'walk_run',
    repeats,
    runMinutes,
    walkMinutes,
    runningMinutes,
    elapsedMinutes,
    protocolWeek,
    longExposure,
  };
}

function continuousPrescription(
  minutes: number,
  protocolWeek: number,
  longExposure: boolean,
): ReturnToRunPrescription {
  return {
    mode: 'continuous',
    repeats: 1,
    runMinutes: minutes,
    walkMinutes: 0,
    runningMinutes: minutes,
    elapsedMinutes: minutes,
    protocolWeek,
    longExposure,
  };
}

function isReducibleBike(session: WholeAthletePlannedSession): boolean {
  if (session.discipline !== 'bike') return false;
  if (session.planningCommitment !== 'generated') return false;
  if (session.keySession) return false;
  if (session.intensity !== 'easy') return false;
  if (/\blong\b/i.test(session.title)) return false;
  return session.durationMinutes > 45;
}

function totalMinutes(sessions: WholeAthletePlannedSession[]): number {
  return sessions.reduce(
    (total, session) => total + Math.max(0, session.durationMinutes),
    0,
  );
}

function generatedMinutes(sessions: WholeAthletePlannedSession[]): number {
  return sessions
    .filter((session) => session.planningCommitment === 'generated')
    .reduce(
      (total, session) => total + Math.max(0, session.durationMinutes),
      0,
    );
}

function refreshRunSummary(
  summary: WholeAthleteWeekPlan['disciplineSummary'],
  sessions: WholeAthletePlannedSession[],
): WholeAthleteWeekPlan['disciplineSummary'] {
  const runSessions = sessions.filter((session) => session.discipline === 'run');
  const runMinutes = runSessions.reduce(
    (total, session) => total + Math.max(0, session.durationMinutes),
    0,
  );

  return summary.map((item) => item.discipline === 'run'
    ? { ...item, sessions: runSessions.length, minutes: runMinutes }
    : item);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
