import type { PerformanceGoal } from '@circuit/domain';
import { getGoalSpecificProfile } from './goal-specific-coaching';
import { recommendStrengthDose, type AthleteCapacityProfile } from './capacity';
import {
  generateMultisportWeek,
  type MultisportWeekPlan,
  type MultisportWeekRequest,
  type PlannedMultisportSession,
} from './multisport';

export type EnergyAvailabilityState = 'unknown' | 'adequate' | 'at_risk' | 'recovery_priority';
export type MentalEnergyState = 'normal' | 'limited' | 'depleted';
export type LifeStressState = 'normal' | 'high' | 'overwhelming';

export interface MultisportGovernanceContext {
  capacity?: AthleteCapacityProfile;
  energyAvailability?: EnergyAvailabilityState;
  menstrualRecoveryPriority?: boolean;
  mentalEnergy?: MentalEnergyState;
  lifeStress?: LifeStressState;
  athleteRequestedRest?: boolean;
  clinicianDefinedReturnToRun?: boolean;
}

export interface MultisportGovernanceDecision {
  runMode: 'normal' | 'reduced' | 'protocol_only' | 'disabled';
  maxGeneratedRunSessions: number;
  maxGeneratedRunMinutes: number;
  minimumHoursBetweenGeneratedRuns: number;
  maxHardDays: 1 | 2 | 3 | 4;
  minimumCompleteRestDays: 0 | 1 | 2;
  progressionAllowed: boolean;
  preserveFixedSessions: true;
  allowCompensatoryExercise: false;
  reasons: string[];
  safeguards: string[];
}

export interface GovernedMultisportWeekPlan extends MultisportWeekPlan {
  governance: MultisportGovernanceDecision;
}

export function decideMultisportGovernance(
  goal: PerformanceGoal,
  context: MultisportGovernanceContext,
): MultisportGovernanceDecision {
  const reasons: string[] = [];
  const safeguards = [
    'Fixed athlete or coach commitments are preserved unless the athlete explicitly changes them.',
    'Missed volume is never automatically added back as compensatory exercise.',
    'Pain, injury, life stress, mental health, and recovery constraints override progression.',
    'Run progression, lower-body strength progression, and plyometric progression are not advanced together.',
  ];

  const capacity = context.capacity ?? goal.capacityProfile;
  const runStatus = capacity?.runStatus ?? 'normal';
  const recentBoneStress = capacity?.boneStressInjuryHistory === 'recent_or_current';
  const noRunBaseline = (capacity?.maxRunMilesLast12Weeks ?? 0) <= 0;

  let runMode: MultisportGovernanceDecision['runMode'] = 'normal';
  let maxGeneratedRunSessions = 3;
  let maxGeneratedRunMinutes = 75;
  let minimumHoursBetweenGeneratedRuns = 24;

  if (runStatus === 'not_running') {
    runMode = 'disabled';
    maxGeneratedRunSessions = 0;
    maxGeneratedRunMinutes = 0;
    reasons.push('Running is currently disabled by the athlete capacity profile.');
  } else if (runStatus === 'return_to_run') {
    const requiresProtocol = recentBoneStress || noRunBaseline;
    if (requiresProtocol && !context.clinicianDefinedReturnToRun) {
      runMode = 'protocol_only';
      maxGeneratedRunSessions = 0;
      maxGeneratedRunMinutes = 0;
      minimumHoursBetweenGeneratedRuns = 48;
      reasons.push('Return-to-run requires an explicit progression because recent bone-stress history or a missing run baseline makes generic run generation unsafe.');
      safeguards.push('Side Quest may preserve a clinician- or athlete-defined return-to-run session, but it does not invent one from a generic weekly target.');
    } else {
      runMode = 'reduced';
      maxGeneratedRunSessions = 2;
      maxGeneratedRunMinutes = 30;
      minimumHoursBetweenGeneratedRuns = 48;
      reasons.push('Return-to-run uses short, separated exposures rather than normal endurance-run prescriptions.');
    }
  } else if (runStatus === 'reduced') {
    runMode = 'reduced';
    maxGeneratedRunSessions = 2;
    maxGeneratedRunMinutes = 40;
    minimumHoursBetweenGeneratedRuns = 48;
    reasons.push('Reduced running status limits frequency and single-session duration.');
  }

  let maxHardDays: 1 | 2 | 3 | 4 = 3;
  if (capacity) {
    const strengthDose = recommendStrengthDose(capacity, goal.type, goal.weeksUntilEvent);
    maxHardDays = strengthDose.maxTotalHardDays;
    safeguards.push(...strengthDose.safeguards);
  }

  let minimumCompleteRestDays: 0 | 1 | 2 = 0;
  let progressionAllowed = true;
  const recoveryPriority = context.energyAvailability === 'recovery_priority' || context.menstrualRecoveryPriority === true;
  const energyAtRisk = context.energyAvailability === 'at_risk';
  const depleted = context.mentalEnergy === 'depleted' || context.lifeStress === 'overwhelming' || context.athleteRequestedRest === true;
  const strained = context.mentalEnergy === 'limited' || context.lifeStress === 'high';

  if (recoveryPriority) {
    progressionAllowed = false;
    maxHardDays = Math.min(maxHardDays, 2) as 1 | 2;
    minimumCompleteRestDays = 1;
    reasons.push('Energy-availability or menstrual-recovery priority suppresses automatic training progression.');
    safeguards.push('Training is not increased to compensate for missed work while health recovery is the higher-priority objective.');
  } else if (energyAtRisk) {
    progressionAllowed = false;
    minimumCompleteRestDays = 1;
    reasons.push('Possible low energy availability prevents automatic progression until the athlete is adequately supported.');
  }

  if (depleted) {
    progressionAllowed = false;
    maxHardDays = 1;
    minimumCompleteRestDays = 2;
    reasons.push('Overwhelming life stress, depleted mental energy, or an explicit rest request moves the week into recovery-first planning.');
  } else if (strained) {
    progressionAllowed = false;
    maxHardDays = Math.min(maxHardDays, 2) as 1 | 2;
    minimumCompleteRestDays = Math.max(minimumCompleteRestDays, 1) as 1 | 2;
    reasons.push('High life stress or limited mental energy favors consolidation rather than progression.');
  }

  const profile = goalSpecificProfile(goal);
  safeguards.push(...profile.safeguards);

  return {
    runMode,
    maxGeneratedRunSessions,
    maxGeneratedRunMinutes,
    minimumHoursBetweenGeneratedRuns,
    maxHardDays,
    minimumCompleteRestDays,
    progressionAllowed,
    preserveFixedSessions: true,
    allowCompensatoryExercise: false,
    reasons: unique(reasons),
    safeguards: unique(safeguards),
  };
}

export function generateGovernedMultisportWeek(
  request: MultisportWeekRequest,
  context: MultisportGovernanceContext = {},
): GovernedMultisportWeekPlan {
  const governance = decideMultisportGovernance(request.goal, context);
  const raw = generateMultisportWeek({
    ...request,
    health: {
      ...request.health,
      runStatus: governance.runMode === 'disabled' || governance.runMode === 'protocol_only'
        ? 'not_running'
        : governance.runMode === 'reduced'
          ? 'return_to_run'
          : request.health.runStatus,
      maxHardDaysPerWeek: governance.maxHardDays,
    },
  });

  let sessions = raw.sessions.map((session) => governSession(session, governance));
  sessions = enforceRunSpacing(sessions, governance);
  sessions = enforceHardDayLimit(sessions, governance);
  sessions = ensureCompleteRestDays(sessions, governance.minimumCompleteRestDays);
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const warnings = [...raw.warnings];
  if (governance.runMode === 'protocol_only') {
    warnings.push('Running is protocol-only this week. Side Quest will not create a generic return-to-run workout.');
  }
  if (!governance.progressionAllowed) {
    warnings.push('Automatic progression is paused by higher-priority health, recovery, or life-context constraints.');
  }

  return {
    ...raw,
    sessions,
    warnings: unique(warnings),
    decisions: unique([...raw.decisions, ...governance.reasons]),
    governance,
  };
}

function governSession(
  session: PlannedMultisportSession,
  governance: MultisportGovernanceDecision,
): PlannedMultisportSession {
  if (session.ownership === 'fixed') return session;

  if (session.discipline === 'run') {
    return {
      ...session,
      durationMinutes: Math.min(session.durationMinutes, governance.maxGeneratedRunMinutes),
      intensity: governance.runMode === 'reduced' ? 'easy' : session.intensity,
      priority: governance.runMode === 'reduced' ? 'support' : session.priority,
      rationale: [
        ...session.rationale,
        ...(governance.runMode === 'reduced'
          ? ['Run duration and intensity are capped by the active return-to-run/reduced-running policy.']
          : []),
      ],
    };
  }

  if (!governance.progressionAllowed && session.intensity === 'hard') {
    return {
      ...session,
      intensity: 'moderate',
      priority: session.priority === 'key' ? 'key' : 'support',
      rationale: [...session.rationale, 'Intensity was reduced because progression is currently suppressed by a higher-priority health or recovery constraint.'],
    };
  }

  return session;
}

function enforceRunSpacing(
  sessions: PlannedMultisportSession[],
  governance: MultisportGovernanceDecision,
): PlannedMultisportSession[] {
  if (governance.maxGeneratedRunSessions <= 0) {
    return sessions.filter((session) => session.discipline !== 'run' || session.ownership === 'fixed');
  }

  const fixedRuns = sessions.filter((session) => session.discipline === 'run' && session.ownership === 'fixed');
  const generatedRuns = sessions
    .filter((session) => session.discipline === 'run' && session.ownership !== 'fixed')
    .sort((a, b) => a.date.localeCompare(b.date));
  const kept: PlannedMultisportSession[] = [];

  for (const candidate of generatedRuns) {
    if (kept.length >= governance.maxGeneratedRunSessions) break;
    const otherRuns = [...fixedRuns, ...kept];
    const tooClose = otherRuns.some((other) => hoursBetweenDates(other.date, candidate.date) < governance.minimumHoursBetweenGeneratedRuns);
    if (!tooClose) kept.push(candidate);
  }

  const keepIds = new Set(kept.map((session) => session.id));
  return sessions.filter((session) => session.discipline !== 'run' || session.ownership === 'fixed' || keepIds.has(session.id));
}

function enforceHardDayLimit(
  sessions: PlannedMultisportSession[],
  governance: MultisportGovernanceDecision,
): PlannedMultisportSession[] {
  const hardDates = [...new Set(sessions.filter((session) => session.intensity === 'hard').map((session) => session.date))].sort();
  if (hardDates.length <= governance.maxHardDays) return sessions;
  const protectedDates = new Set(
    sessions.filter((session) => session.ownership === 'fixed' && session.intensity === 'hard').map((session) => session.date),
  );
  const allowed = new Set<string>([...protectedDates]);
  for (const date of hardDates) {
    if (allowed.has(date)) continue;
    if (allowed.size >= governance.maxHardDays) break;
    allowed.add(date);
  }
  return sessions.map((session) => {
    if (session.intensity !== 'hard' || allowed.has(session.date) || session.ownership === 'fixed') return session;
    return {
      ...session,
      intensity: 'moderate',
      rationale: [...session.rationale, 'Intensity was reduced to respect the weekly hard-day ceiling.'],
    };
  });
}

function ensureCompleteRestDays(
  sessions: PlannedMultisportSession[],
  minimumRestDays: 0 | 1 | 2,
): PlannedMultisportSession[] {
  if (minimumRestDays === 0) return sessions;
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
  const fixedDays = new Set(sessions.filter((session) => session.ownership === 'fixed').map((session) => session.day));
  const occupied = new Set(sessions.filter((session) => session.discipline !== 'rest' && session.discipline !== 'recovery').map((session) => session.day));
  const currentRestDays = days.filter((day) => !occupied.has(day)).length;
  if (currentRestDays >= minimumRestDays) return sessions;

  const removableDays = days
    .filter((day) => !fixedDays.has(day))
    .map((day) => ({
      day,
      sessions: sessions.filter((session) => session.day === day && session.ownership !== 'fixed'),
    }))
    .filter((entry) => entry.sessions.length > 0)
    .sort((a, b) => dayBurden(a.sessions) - dayBurden(b.sessions));

  const removeDays = new Set<string>();
  let needed = minimumRestDays - currentRestDays;
  for (const entry of removableDays) {
    if (needed <= 0) break;
    removeDays.add(entry.day);
    needed -= 1;
  }

  return sessions.filter((session) => session.ownership === 'fixed' || !removeDays.has(session.day));
}

function dayBurden(sessions: PlannedMultisportSession[]): number {
  return sessions.reduce((score, session) => score + session.durationMinutes * (session.intensity === 'hard' ? 2 : session.intensity === 'moderate' ? 1.4 : 1), 0);
}

function goalSpecificProfile(goal: PerformanceGoal) {
  const map: Record<PerformanceGoal['type'], Parameters<typeof getGoalSpecificProfile>[0]> = {
    triathlon_sprint: 'sprint_triathlon',
    triathlon_olympic: 'olympic_triathlon',
    ironman_70_3: 'half_ironman',
    ironman_full: 'full_ironman',
    swimrun: 'swim_run',
    road_10k: 'road_10k',
    road_half_marathon: 'half_marathon',
    road_marathon: 'marathon',
    trail_50k: 'trail_100k',
    trail_100k: 'trail_100k',
    swim_speed: 'general_endurance',
    general_offseason: 'general_endurance',
  };
  return getGoalSpecificProfile(map[goal.type]);
}

function hoursBetweenDates(left: string, right: string): number {
  return Math.abs(new Date(`${left}T12:00:00Z`).getTime() - new Date(`${right}T12:00:00Z`).getTime()) / 3_600_000;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
