import type { WholeAthletePlannedSession } from './whole-athlete-week';

export type StrengthStimulus =
  | 'heavy_lower'
  | 'posterior_chain'
  | 'unilateral_control'
  | 'lower_leg_capacity'
  | 'upper_pull'
  | 'upper_push'
  | 'trunk_control'
  | 'general_maintenance';

export interface WeeklyStrengthPrescription {
  emphasis: StrengthStimulus[];
  deEmphasize: StrengthStimulus[];
  lowerBodyDose: 'light' | 'moderate' | 'high';
  gymValue: 'low' | 'moderate' | 'high';
  rationale: string[];
}

export type CoherentStrengthPlannedSession = WholeAthletePlannedSession & {
  strengthPrescription?: WeeklyStrengthPrescription;
};

export function coordinateWeeklyStrengthStimuli(
  sessions: WholeAthletePlannedSession[],
): CoherentStrengthPlannedSession[] {
  const strength = sessions.filter((session) => session.discipline === 'strength');
  if (strength.length === 0) return sessions.map((session) => ({ ...session }));

  const orderedStrength = [...strength].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const used = new Map<StrengthStimulus, number>();
  const prescriptions = new Map<string, WeeklyStrengthPrescription>();

  for (const session of orderedStrength) {
    const nearby = sessions.filter((candidate) =>
      candidate.discipline !== 'strength'
      && candidate.discipline !== 'rest'
      && candidate.discipline !== 'mobility'
      && Math.abs(dayDifference(candidate.date, session.date)) <= 1,
    );
    const sameDay = nearby.filter((candidate) => candidate.date === session.date);
    const hardRunNearby = nearby.some((candidate) => candidate.discipline === 'run' && isDemanding(candidate));
    const hardSwimNearby = nearby.some((candidate) => candidate.discipline === 'swim' && isDemanding(candidate));
    const keyLowerNearby = nearby.some((candidate) =>
      (candidate.discipline === 'run' || candidate.discipline === 'bike')
      && (candidate.keySession || candidate.lowerBodyDemand === 'high' || candidate.recoveryCost >= 4),
    );

    const candidates: StrengthStimulus[] = [];
    if (!keyLowerNearby) candidates.push('heavy_lower');
    if (!hardRunNearby) candidates.push('posterior_chain');
    if (!hardRunNearby) candidates.push('lower_leg_capacity');
    candidates.push('unilateral_control');
    if (!hardSwimNearby) candidates.push('upper_pull');
    candidates.push('upper_push', 'trunk_control', 'general_maintenance');

    const emphasis = unique(candidates)
      .sort((a, b) => stimulusScore(b, used, session, nearby) - stimulusScore(a, used, session, nearby))
      .slice(0, 3);
    emphasis.forEach((stimulus) => used.set(stimulus, (used.get(stimulus) ?? 0) + 1));

    const deEmphasize: StrengthStimulus[] = [];
    if (keyLowerNearby) deEmphasize.push('heavy_lower');
    if (hardRunNearby) deEmphasize.push('lower_leg_capacity');
    if (hardSwimNearby) deEmphasize.push('upper_pull');

    const lowerBodyDose: WeeklyStrengthPrescription['lowerBodyDose'] = keyLowerNearby
      ? 'light'
      : session.intensity === 'hard' || session.intensity === 'max' || session.progressionTarget === 'strength_intensity'
        ? 'high'
        : 'moderate';
    const gymValue: WeeklyStrengthPrescription['gymValue'] = emphasis.includes('heavy_lower')
      || session.progressionTarget === 'strength_intensity'
      ? 'high'
      : emphasis.includes('upper_pull') || emphasis.includes('posterior_chain')
        ? 'moderate'
        : 'low';

    const rationale = [
      keyLowerNearby
        ? 'Nearby key bike/run loading already supplies substantial lower-body stress, so this strength session should complement it rather than stack another heavy lower-body dose.'
        : 'No nearby key lower-body endurance session blocks a meaningful strength stimulus here.',
      hardRunNearby
        ? 'Nearby demanding running reduces the value of additional lower-leg and posterior-chain fatigue.'
        : '',
      hardSwimNearby
        ? 'Nearby demanding swimming reduces redundant high-volume pulling work.'
        : '',
      sameDay.some((candidate) => candidate.discipline === 'swim')
        ? 'Same-day swimming is considered when distributing upper-body pulling and trunk work.'
        : '',
      `Weekly strength role: ${emphasis.map(labelStimulus).join(', ')}.`,
    ].filter(Boolean);

    prescriptions.set(session.id, { emphasis, deEmphasize: unique(deEmphasize), lowerBodyDose, gymValue, rationale });
  }

  return sessions.map((session) => session.discipline === 'strength'
    ? {
        ...session,
        strengthPrescription: prescriptions.get(session.id),
        rationale: [
          ...session.rationale,
          ...(prescriptions.get(session.id)?.rationale ?? []),
        ],
      }
    : { ...session });
}

function stimulusScore(
  stimulus: StrengthStimulus,
  used: Map<StrengthStimulus, number>,
  session: WholeAthletePlannedSession,
  nearby: WholeAthletePlannedSession[],
): number {
  let score = 20 - (used.get(stimulus) ?? 0) * 9;
  if (stimulus === 'heavy_lower' && (session.keySession || session.progressionTarget === 'strength_intensity')) score += 12;
  if (stimulus === 'posterior_chain' && nearby.some((item) => item.discipline === 'bike')) score += 3;
  if (stimulus === 'unilateral_control' && nearby.some((item) => item.discipline === 'run')) score += 3;
  if (stimulus === 'upper_pull' && nearby.some((item) => item.discipline === 'swim')) score -= 5;
  if (stimulus === 'trunk_control') score += 2;
  return score;
}

function isDemanding(session: WholeAthletePlannedSession): boolean {
  return session.keySession
    || session.intensity === 'hard'
    || session.intensity === 'max'
    || session.recoveryCost >= 4;
}

function dayDifference(left: string, right: string): number {
  const leftTime = new Date(`${left}T12:00:00Z`).getTime();
  const rightTime = new Date(`${right}T12:00:00Z`).getTime();
  return Math.round((leftTime - rightTime) / 86_400_000);
}

function labelStimulus(stimulus: StrengthStimulus): string {
  return stimulus.replaceAll('_', ' ');
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
