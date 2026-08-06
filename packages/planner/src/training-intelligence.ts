import type {
  BodyRegion,
  EnduranceActivity,
  EnduranceDiscipline,
  EnduranceLoadAssessment,
  EquipmentId,
  PlannedStrengthSession,
  StrengthAdjustmentProposal,
  StrengthPlanningPriority,
  TrainingAdjustmentConfidence,
  TrainingBlockPlan,
  TrainingCalendarEvent,
  TrainingIntelligencePreferences,
  TrainingIntelligenceSnapshot,
  TrainingPhase,
  WorkoutStation,
} from '@circuit/domain';

export interface AssessEnduranceLoadsInput {
  activities: EnduranceActivity[];
  lookbackDays?: number;
  useStravaRelativeEffort?: boolean;
  now?: string;
}

export interface BuildTrainingIntelligenceInput {
  block: TrainingBlockPlan;
  activities: EnduranceActivity[];
  calendarEvents?: TrainingCalendarEvent[];
  preferences?: TrainingIntelligencePreferences;
  returningFromInjury?: boolean;
  activePainRestriction?: boolean;
  today?: string;
  now?: string;
}

export interface ApplyStrengthAdjustmentResult {
  block: TrainingBlockPlan;
  applied: boolean;
  message: string;
}

const DEFAULT_PREFERENCES: TrainingIntelligencePreferences = {
  mode: 'auto_high_confidence',
  lookbackDays: 28,
  useStravaRelativeEffort: true,
  updatedAt: new Date(0).toISOString(),
};

const SPORT_REGIONS: Record<EnduranceDiscipline, BodyRegion[]> = {
  swim: ['lats', 'shoulders', 'upper_back', 'triceps', 'chest', 'core_rotation', 'core_anterior'],
  bike: ['quadriceps', 'glutes', 'hamstrings', 'hip_flexors', 'gastrocnemius', 'soleus', 'core_anterior'],
  run: ['glutes', 'quadriceps', 'hamstrings', 'gastrocnemius', 'soleus', 'feet_ankles', 'hip_abductors', 'core_anterior'],
};

const COMPLEMENTARY_REGIONS: Record<EnduranceDiscipline, BodyRegion[]> = {
  swim: ['upper_back', 'core_rotation', 'core_lateral', 'lower_back'],
  bike: ['hamstrings', 'glutes', 'hip_abductors', 'core_lateral', 'upper_back'],
  run: ['hamstrings', 'hip_abductors', 'soleus', 'tibialis_anterior', 'core_lateral'],
};

export function defaultTrainingIntelligencePreferences(now = new Date().toISOString()): TrainingIntelligencePreferences {
  return { ...DEFAULT_PREFERENCES, updatedAt: now };
}

export function assessEnduranceLoads({
  activities,
  lookbackDays = 28,
  useStravaRelativeEffort = true,
  now = new Date().toISOString(),
}: AssessEnduranceLoadsInput): EnduranceLoadAssessment[] {
  const cutoff = new Date(new Date(now).getTime() - lookbackDays * 86_400_000).getTime();
  const eligible = activities
    .filter(isEnduranceActivity)
    .filter((activity) => !activity.deletedAt && activity.classification !== 'ignored')
    .filter((activity) => new Date(activity.startAt).getTime() >= cutoff)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));

  return eligible.map((activity) => {
    const history = eligible.filter((candidate) =>
      candidate.id !== activity.id
      && candidate.discipline === activity.discipline
      && candidate.startAt < activity.startAt,
    );
    const durationMinutes = Math.max(1, activity.movingTimeSeconds / 60);
    const durationMedian = median(history.map((candidate) => Math.max(1, candidate.movingTimeSeconds / 60)));
    const durationRatio = durationMedian ? durationMinutes / durationMedian : undefined;
    const usableRelativeEffort = useStravaRelativeEffort ? activity.relativeEffort : undefined;
    const relativeHistory = useStravaRelativeEffort
      ? history.flatMap((candidate) => candidate.relativeEffort === undefined ? [] : [candidate.relativeEffort])
      : [];
    const relativeMedian = median(relativeHistory);
    const relativeEffortRatio = usableRelativeEffort !== undefined && relativeMedian
      ? usableRelativeEffort / relativeMedian
      : undefined;
    const objectiveSignals: string[] = [];
    const stravaSignals: string[] = [];
    const text = `${activity.name} ${activity.sportType ?? ''}`.toLowerCase();
    const discipline = activity.discipline;

    if (durationRatio !== undefined) {
      objectiveSignals.push(`Duration was ${formatRatio(durationRatio)} of the recent ${discipline} median.`);
    } else {
      objectiveSignals.push(`There were not enough prior ${discipline} sessions to calculate a personal duration baseline.`);
    }
    if (activity.distanceMeters !== undefined) objectiveSignals.push(`${formatDistance(activity.distanceMeters, discipline)} recorded.`);
    if (activity.elevationGainMeters !== undefined && activity.elevationGainMeters > 0) {
      objectiveSignals.push(`${Math.round(activity.elevationGainMeters)} m elevation gain recorded.`);
    }
    if (usableRelativeEffort !== undefined) {
      stravaSignals.push(`Strava Relative Effort: ${Math.round(usableRelativeEffort)}.`);
      if (relativeEffortRatio !== undefined) stravaSignals.push(`Relative Effort was ${formatRatio(relativeEffortRatio)} of the recent ${discipline} median.`);
    }
    if (activity.averageHeartRate !== undefined) stravaSignals.push(`Average heart rate: ${Math.round(activity.averageHeartRate)} bpm.`);
    if (activity.weightedAverageWatts !== undefined) stravaSignals.push(`Weighted average power: ${Math.round(activity.weightedAverageWatts)} W.`);
    else if (activity.averageWatts !== undefined) stravaSignals.push(`Average power: ${Math.round(activity.averageWatts)} W.`);
    if (activity.kilojoules !== undefined) stravaSignals.push(`Strava work estimate: ${Math.round(activity.kilojoules)} kJ.`);

    const race = activity.intensity === 'race' || /\brace\b|competition|event|time trial/.test(text);
    const titleHard = activity.intensity === 'hard' || /interval|threshold|tempo|vo2|hill repeat|hard|brick/.test(text);
    const fixedLong = discipline === 'run' ? durationMinutes >= 90 : discipline === 'bike' ? durationMinutes >= 180 : durationMinutes >= 75;
    const relativeLong = (durationRatio ?? 0) >= 1.45;
    const stravaHard = usableRelativeEffort !== undefined
      && (usableRelativeEffort >= 110 || (relativeEffortRatio ?? 0) >= 1.45);
    const objectiveExtreme = isObjectiveExtreme(activity, durationMinutes);
    const relativeExtreme = usableRelativeEffort !== undefined
      && (usableRelativeEffort >= 250 || (history.length >= 3 && (relativeEffortRatio ?? 0) >= 2.5));
    const durationExtreme = history.length >= 3 && (durationRatio ?? 0) >= 2.5 && fixedLong;
    const extremeGuardrail = objectiveExtreme || relativeExtreme || durationExtreme;

    let loadClass: EnduranceLoadAssessment['loadClass'];
    if (race) loadClass = extremeGuardrail ? 'extreme' : 'race';
    else if (extremeGuardrail) loadClass = 'extreme';
    else if (fixedLong || relativeLong) loadClass = 'long';
    else if (titleHard || stravaHard) loadClass = 'hard';
    else if (activity.intensity === 'recovery') loadClass = 'recovery';
    else if (activity.intensity === 'easy') loadClass = 'easy';
    else loadClass = 'moderate';

    let confidence: TrainingAdjustmentConfidence = 'low';
    const independentSignals = [
      usableRelativeEffort !== undefined,
      durationRatio !== undefined,
      activity.distanceMeters !== undefined,
      activity.elevationGainMeters !== undefined && activity.elevationGainMeters > 0,
      race || titleHard,
    ].filter(Boolean).length;
    if (extremeGuardrail || independentSignals >= 3) confidence = 'high';
    else if (independentSignals >= 2 || history.length >= 3) confidence = 'moderate';

    if (extremeGuardrail) objectiveSignals.push('This crosses a high-confidence extreme-load guardrail.');
    if (history.length) objectiveSignals.push(`Compared with ${history.length} earlier ${discipline} session${history.length === 1 ? '' : 's'} in the lookback window.`);

    return {
      id: `load_assessment_${stableHash(`${activity.id}:${lookbackDays}`)}`,
      activityId: activity.id,
      discipline,
      loadClass,
      confidence,
      lookbackDays,
      historyCount: history.length,
      durationMinutes: round1(durationMinutes),
      durationRatio: durationRatio === undefined ? undefined : round2(durationRatio),
      relativeEffort: usableRelativeEffort,
      relativeEffortRatio: relativeEffortRatio === undefined ? undefined : round2(relativeEffortRatio),
      distanceMeters: activity.distanceMeters,
      elevationGainMeters: activity.elevationGainMeters,
      objectiveSignals,
      stravaSignals,
      extremeGuardrail,
      assessedAt: now,
    };
  });
}

export function determineStrengthPlanningPriority({
  phase,
  returningFromInjury = false,
}: {
  phase: TrainingPhase;
  returningFromInjury?: boolean;
}): StrengthPlanningPriority {
  if (returningFromInjury) return 'return_to_strength';
  if (phase === 'offseason') return 'strength_build';
  if (phase === 'peak' || phase === 'taper' || phase === 'race_week') return 'race_specific';
  return 'balanced';
}

export function buildTrainingIntelligence({
  block,
  activities,
  calendarEvents = [],
  preferences = defaultTrainingIntelligencePreferences(),
  returningFromInjury = false,
  activePainRestriction = false,
  today = localDate(new Date()),
  now = new Date().toISOString(),
}: BuildTrainingIntelligenceInput): TrainingIntelligenceSnapshot {
  const activeWeek = block.weeks.find((week) => week.weekStartDate <= today && addDays(week.weekStartDate, 6) >= today)
    ?? block.weeks.find((week) => week.weekStartDate >= today)
    ?? block.weeks.at(-1);
  const phase = activeWeek?.phase ?? 'base';
  const priority = determineStrengthPlanningPriority({ phase, returningFromInjury });
  const assessments = assessEnduranceLoads({
    activities,
    lookbackDays: preferences.lookbackDays,
    useStravaRelativeEffort: preferences.useStravaRelativeEffort,
    now,
  });
  const assessmentByActivity = new Map(assessments.map((assessment) => [assessment.activityId, assessment]));
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const recentCutoff = addDays(today, -3);
  const recentAssessments = assessments.filter((assessment) => {
    const activity = activityById.get(assessment.activityId);
    return activity && activityDate(activity) >= recentCutoff && activityDate(activity) <= today;
  });
  const upcomingSessions = block.weeks.flatMap((week) => week.sessions.map((session) => ({ week, session })))
    .filter(({ session }) => !['completed', 'skipped'].includes(session.completionStatus))
    .filter(({ session }) => session.date >= today && session.date <= addDays(today, 7))
    .sort((left, right) => left.session.date.localeCompare(right.session.date) || left.session.order - right.session.order);
  const proposals: StrengthAdjustmentProposal[] = [];

  for (const { week, session } of upcomingSessions) {
    const sessionPriority = determineStrengthPlanningPriority({ phase: week.phase, returningFromInjury });
    const relevant = recentAssessments
      .map((assessment) => ({ assessment, activity: activityById.get(assessment.activityId)! }))
      .filter(({ activity }) => {
        const gap = dayDifference(activityDate(activity), session.date);
        return gap >= 0 && gap <= 2;
      })
      .sort((left, right) => loadRank(right.assessment.loadClass) - loadRank(left.assessment.loadClass)
        || confidenceRank(right.assessment.confidence) - confidenceRank(left.assessment.confidence));
    const strongest = relevant[0];
    if (!strongest) {
      const easyConflict = findEasyEnduranceBeforeStrength(calendarEvents, session, sessionPriority);
      if (easyConflict) proposals.push(buildProtectStrengthProposal({ session, phase: week.phase, priority: sessionPriority, event: easyConflict, now }));
      continue;
    }

    const gap = dayDifference(activityDate(strongest.activity), session.date);
    const regionProfile = sessionRegionProfile(session);
    const sportRegions = SPORT_REGIONS[strongest.assessment.discipline];
    const preservedStrengthRegions = topRegions(regionProfile, (region) => sportRegions.includes(region), 2);
    const complementaryRegions = topRegions(regionProfile, (region) => COMPLEMENTARY_REGIONS[strongest.assessment.discipline].includes(region), 3);
    const sportOverlap = regionOverlapFraction(regionProfile, sportRegions);
    const triggerActivityIds = relevant.map(({ activity }) => activity.id);
    const assessmentIds = relevant.map(({ assessment }) => assessment.id);
    const common = {
      sessionId: session.id,
      sessionTitle: session.title,
      sessionDate: session.date,
      phase: week.phase,
      priority: sessionPriority,
      triggerActivityIds,
      assessmentIds,
      preservedStrengthRegions,
      complementaryRegions,
      createdAt: now,
      updatedAt: now,
    };

    if (activePainRestriction) {
      proposals.push({
        ...common,
        id: `training_adjustment_${stableHash(`${session.id}:pain:${now.slice(0, 10)}`)}`,
        action: 'minimum_strength',
        confidence: 'high',
        automaticEligible: false,
        status: 'pending',
        headline: 'Use the active pain or restriction plan first',
        explanation: 'Endurance load is context, but active pain or a current restriction has higher precedence. Side Quest proposes the minimum familiar strength dose only after the restriction screen is satisfied.',
        recommendedVariant: 'minimum',
      });
      continue;
    }

    if (strongest.assessment.extremeGuardrail && gap <= 1 && sportOverlap < 0.25 && session.intendedLoad !== 'high') {
      proposals.push({
        ...common,
        id: `training_adjustment_${stableHash(`${session.id}:extreme-low-overlap:${strongest.activity.id}`)}`,
        action: 'keep_strength',
        confidence: 'high',
        automaticEligible: false,
        status: 'pending',
        headline: 'Keep the non-overlapping strength session',
        explanation: `${strongest.activity.name} crossed an extreme-load guardrail, but this strength session has little regional overlap. Keep the session while monitoring whole-body fatigue rather than automatically removing strength.`,
        recommendedVariant: 'full',
      });
      continue;
    }

    if (strongest.assessment.extremeGuardrail && gap <= 1) {
      const suggestedDate = findSafeMoveDate(block, session, strongest.activity, calendarEvents, today);
      proposals.push({
        ...common,
        id: `training_adjustment_${stableHash(`${session.id}:extreme:${strongest.activity.id}`)}`,
        action: suggestedDate ? 'move_strength' : 'minimum_strength',
        confidence: 'high',
        automaticEligible: Boolean(suggestedDate),
        status: 'pending',
        headline: suggestedDate ? 'Protect the next overlapping strength session' : 'Use a minimum strength dose after extreme endurance load',
        explanation: suggestedDate
          ? `${strongest.activity.name} crossed an extreme-load guardrail. The strength session is moved rather than deleted so direct strength remains in the week.`
          : `${strongest.activity.name} crossed an extreme-load guardrail and no clearly safer date was available. Keep a small familiar strength exposure, but avoid a full leg-dominant dose the next day.`,
        recommendedVariant: suggestedDate ? 'full' : 'minimum',
        suggestedDate,
      });
      continue;
    }

    if (strongest.assessment.loadClass === 'race' || strongest.assessment.loadClass === 'long' || strongest.assessment.loadClass === 'hard') {
      const raceSpecific = sessionPriority === 'race_specific';
      const returnContext = sessionPriority === 'return_to_strength';
      const confidence = strongest.assessment.confidence === 'high' ? 'high' : 'moderate';
      proposals.push({
        ...common,
        id: `training_adjustment_${stableHash(`${session.id}:${strongest.assessment.loadClass}:${strongest.activity.id}`)}`,
        action: raceSpecific ? 'reduce_strength_volume' : 'reduce_strength_volume',
        confidence,
        automaticEligible: false,
        status: 'pending',
        headline: raceSpecific ? 'Reduce redundant volume, not all strength' : 'Keep the strength stimulus and trim redundant fatigue',
        explanation: raceSpecific
          ? `${strongest.activity.name} created substantial recent ${strongest.assessment.discipline} demand during a race-specific phase. Side Quest proposes a reduced session that preserves one direct strength exposure for the heavily used regions and keeps complementary support work.`
          : returnContext
            ? `${strongest.activity.name} adds fatigue, but rebuilding controlled strength remains a priority. Side Quest proposes a reduced dose rather than removing the loaded regions from the program.`
            : `${strongest.activity.name} adds meaningful fatigue. Side Quest proposes reducing rounds or stations while preserving direct strength for the sport-loaded regions and complementary support areas.`,
        recommendedVariant: 'reduced',
      });
      continue;
    }

    if ((strongest.assessment.loadClass === 'easy' || strongest.assessment.loadClass === 'recovery')
      && (sessionPriority === 'strength_build' || sessionPriority === 'return_to_strength')) {
      proposals.push({
        ...common,
        id: `training_adjustment_${stableHash(`${session.id}:keep:${strongest.activity.id}`)}`,
        action: 'keep_strength',
        confidence: strongest.assessment.confidence,
        automaticEligible: false,
        status: 'pending',
        headline: 'Keep the planned strength session',
        explanation: `${strongest.activity.name} was easy enough that it should provide context without displacing an important strength exposure in this phase.`,
        recommendedVariant: 'full',
      });
    }
  }

  const automatic = proposals.filter((proposal) => proposal.automaticEligible && proposal.confidence === 'high').length;
  const summary = proposals.length === 0
    ? `No strength change is suggested. ${prioritySummary(priority)}`
    : `${proposals.length} strength-planning recommendation${proposals.length === 1 ? '' : 's'} generated. ${automatic} meet the high-confidence automatic guardrail; all others require athlete approval. ${prioritySummary(priority)}`;

  return {
    generatedAt: now,
    priority,
    phase,
    preferences,
    assessments: assessments.filter((assessment) => assessmentByActivity.has(assessment.activityId)),
    proposals,
    summary,
  };
}

export function applyStrengthAdjustmentProposal(
  block: TrainingBlockPlan,
  proposal: StrengthAdjustmentProposal,
  appliedAt = new Date().toISOString(),
): ApplyStrengthAdjustmentResult {
  let applied = false;
  const weeks = block.weeks.map((week) => ({
    ...week,
    sessions: week.sessions.map((session) => {
      if (session.id !== proposal.sessionId) return session;
      if (proposal.action === 'keep_strength' || proposal.action === 'protect_strength_quality' || proposal.action === 'replace_easy_endurance') {
        applied = true;
        return {
          ...session,
          rationale: `${session.rationale} Training Intelligence: ${proposal.explanation}`,
        };
      }
      if (proposal.action === 'move_strength' && proposal.suggestedDate) {
        applied = true;
        return {
          ...session,
          date: proposal.suggestedDate,
          rationale: `${session.rationale} Training Intelligence moved this session from ${proposal.sessionDate}: ${proposal.explanation}`,
          completionStatus: session.completionStatus === 'planned' ? 'modified' : session.completionStatus,
        };
      }
      if ((proposal.action === 'reduce_strength_volume' || proposal.action === 'minimum_strength') && proposal.recommendedVariant) {
        applied = true;
        const workout = createContextualStrengthVariant(session, proposal);
        return {
          ...session,
          title: proposal.action === 'minimum_strength' ? `Minimum dose: ${session.title}` : `Reduced dose: ${session.title}`,
          workout,
          intendedLoad: proposal.action === 'minimum_strength' ? 'light' : session.intendedLoad === 'high' ? 'moderate' : session.intendedLoad,
          rationale: `${session.rationale} Training Intelligence: ${proposal.explanation}`,
          completionStatus: session.completionStatus === 'planned' ? 'modified' : session.completionStatus,
        };
      }
      return session;
    }),
  }));
  if (!applied) return { block, applied: false, message: 'The proposal did not change the current plan.' };
  return {
    block: {
      ...block,
      id: `${block.id}_intelligence_${stableHash(`${proposal.id}:${appliedAt}`)}`,
      createdAt: appliedAt,
      weeks,
    },
    applied: true,
    message: proposal.action === 'move_strength'
      ? `Moved ${proposal.sessionTitle} to ${proposal.suggestedDate}.`
      : proposal.action === 'keep_strength'
        ? `Kept ${proposal.sessionTitle} at the full planned strength dose.`
        : `Applied the proposed strength adjustment to ${proposal.sessionTitle}.`,
  };
}

function createContextualStrengthVariant(session: PlannedStrengthSession, proposal: StrengthAdjustmentProposal) {
  const workout = session.workout;
  const targetFraction = proposal.recommendedVariant === 'minimum' ? 0.32 : 0.64;
  const targetSeconds = Math.max(proposal.recommendedVariant === 'minimum' ? 8 * 60 : 16 * 60, Math.round(workout.totalWorkSeconds * targetFraction / 240) * 240);
  const selected: WorkoutStation[] = [];
  const candidates = workout.stations.map((station) => ({ station, profile: stationRegionProfile(station) }));
  const preserve = bestStation(candidates, proposal.preservedStrengthRegions, selected);
  if (preserve) selected.push(preserve);
  const complement = bestStation(candidates, proposal.complementaryRegions, selected);
  if (complement && selected.reduce((sum, station) => sum + station.durationSeconds, 0) < targetSeconds) selected.push(complement);
  for (const candidate of candidates.sort((left, right) => stationTotal(right.station) - stationTotal(left.station))) {
    if (selected.some((station) => station.id === candidate.station.id)) continue;
    if (selected.reduce((sum, station) => sum + station.durationSeconds, 0) >= targetSeconds) break;
    selected.push(candidate.station);
  }
  if (selected.length === 0 && workout.stations[0]) selected.push(workout.stations[0]);
  const stations = selected
    .sort((left, right) => left.order - right.order)
    .map((station, index) => ({
      ...station,
      id: `${station.id}_intelligence_${proposal.recommendedVariant}`,
      order: index + 1,
      exercises: station.exercises.map((exercise) => ({
        ...exercise,
        adaptationNote: `${exercise.adaptationNote ? `${exercise.adaptationNote} ` : ''}Kept as part of a ${proposal.recommendedVariant} context-aware strength dose; sport load did not replace direct strength.`,
      })),
    }));
  const totalWorkSeconds = stations.reduce((sum, station) => sum + station.durationSeconds, 0);
  const totalRestSeconds = Math.max(0, stations.length - 1) * workout.request.restSeconds;
  const equipment = collectSelectedEquipment(stations);
  return {
    ...workout,
    id: `${workout.id}_intelligence_${proposal.recommendedVariant}_${stableHash(proposal.id)}`,
    name: `${proposal.recommendedVariant === 'minimum' ? 'Minimum effective' : 'Reduced'}: ${workout.name}`,
    createdAt: proposal.updatedAt,
    request: { ...workout.request, workMinutes: Math.round(totalWorkSeconds / 60) },
    stations,
    totalWorkSeconds,
    totalRestSeconds,
    estimatedElapsedSeconds: totalWorkSeconds + totalRestSeconds,
    requiredEquipment: equipment,
    variantLevel: proposal.recommendedVariant,
    variantOfWorkoutId: workout.variantOfWorkoutId ?? workout.id,
    variantLabel: proposal.recommendedVariant === 'minimum' ? 'Minimum effective session' : 'Reduced session',
  };
}

function buildProtectStrengthProposal({
  session,
  phase,
  priority,
  event,
  now,
}: {
  session: PlannedStrengthSession;
  phase: TrainingPhase;
  priority: StrengthPlanningPriority;
  event: TrainingCalendarEvent;
  now: string;
}): StrengthAdjustmentProposal {
  const profile = sessionRegionProfile(session);
  return {
    id: `training_adjustment_${stableHash(`${session.id}:protect:${event.id}`)}`,
    sessionId: session.id,
    sessionTitle: session.title,
    sessionDate: session.date,
    phase,
    priority,
    action: 'replace_easy_endurance',
    confidence: 'moderate',
    automaticEligible: false,
    status: 'pending',
    triggerActivityIds: [],
    assessmentIds: [],
    headline: 'Protect strength quality from optional easy endurance',
    explanation: `${event.title} appears to be an easy or recovery endurance session near this strength workout. In ${priorityLabel(priority)} mode, Side Quest suggests shortening, moving, or skipping the optional easy session before reducing strength.`,
    preservedStrengthRegions: topRegions(profile, () => true, 2),
    complementaryRegions: [],
    recommendedVariant: 'full',
    createdAt: now,
    updatedAt: now,
  };
}

function findEasyEnduranceBeforeStrength(
  events: TrainingCalendarEvent[],
  session: PlannedStrengthSession,
  priority: StrengthPlanningPriority,
): TrainingCalendarEvent | undefined {
  if (priority !== 'strength_build' && priority !== 'return_to_strength') return undefined;
  return events.find((event) => {
    if (event.discipline !== 'swim' && event.discipline !== 'bike' && event.discipline !== 'run') return false;
    if (eventDate(event) !== session.date) return false;
    return /easy|recovery|zone 1|zone 2|aerobic|technique|drill|optional/.test(`${event.title} ${event.description ?? ''}`.toLowerCase());
  });
}

function findSafeMoveDate(
  block: TrainingBlockPlan,
  session: PlannedStrengthSession,
  activity: EnduranceActivity,
  events: TrainingCalendarEvent[],
  today: string,
): string | undefined {
  const week = block.weeks.find((candidate) => candidate.sessions.some((item) => item.id === session.id));
  if (!week) return undefined;
  const occupied = new Set(week.sessions.filter((item) => item.id !== session.id && item.completionStatus !== 'skipped').map((item) => item.date));
  const weekEnd = addDays(week.weekStartDate, 6);
  for (let offset = 1; offset <= 4; offset += 1) {
    const date = addDays(session.date, offset);
    if (date < today || date > weekEnd || occupied.has(date)) continue;
    if (block.goal.eventDate && date >= block.goal.eventDate) continue;
    const sameDay = events.filter((event) => eventDate(event) === date);
    if (sameDay.some((event) => event.discipline === 'rest')) continue;
    if (sameDay.some((event) => event.discipline === activity.discipline && /long|hard|interval|race|threshold|tempo/.test(`${event.title} ${event.description ?? ''}`.toLowerCase()))) continue;
    return date;
  }
  return undefined;
}

function sessionRegionProfile(session: PlannedStrengthSession): Map<BodyRegion, number> {
  const map = new Map<BodyRegion, number>();
  for (const station of session.workout.stations) {
    for (const item of station.exercises) {
      for (const load of item.exerciseSnapshot.bodyRegions) {
        const role = load.role === 'primary' ? 1 : load.role === 'secondary' ? 0.65 : 0.4;
        map.set(load.region, (map.get(load.region) ?? 0) + load.load * role * station.durationSeconds / 60);
      }
    }
  }
  return map;
}

function stationRegionProfile(station: WorkoutStation): Map<BodyRegion, number> {
  const map = new Map<BodyRegion, number>();
  for (const item of station.exercises) {
    for (const load of item.exerciseSnapshot.bodyRegions) {
      const role = load.role === 'primary' ? 1 : load.role === 'secondary' ? 0.65 : 0.4;
      map.set(load.region, (map.get(load.region) ?? 0) + load.load * role);
    }
  }
  return map;
}

function bestStation(
  candidates: Array<{ station: WorkoutStation; profile: Map<BodyRegion, number> }>,
  regions: BodyRegion[],
  selected: WorkoutStation[],
): WorkoutStation | undefined {
  if (regions.length === 0) return undefined;
  return candidates
    .filter(({ station }) => !selected.some((item) => item.id === station.id))
    .map(({ station, profile }) => ({ station, score: regions.reduce((sum, region) => sum + (profile.get(region) ?? 0), 0) }))
    .sort((left, right) => right.score - left.score)[0]?.station;
}

function topRegions(
  profile: Map<BodyRegion, number>,
  predicate: (region: BodyRegion) => boolean,
  count: number,
): BodyRegion[] {
  return [...profile.entries()].filter(([region]) => predicate(region)).sort((left, right) => right[1] - left[1]).slice(0, count).map(([region]) => region);
}

function stationTotal(station: WorkoutStation): number {
  return station.exercises.reduce((sum, item) => sum + item.exerciseSnapshot.bodyRegions.reduce((inner, load) => inner + load.load, 0), 0);
}

function regionOverlapFraction(profile: Map<BodyRegion, number>, regions: BodyRegion[]): number {
  const total = [...profile.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  const overlap = regions.reduce((sum, region) => sum + (profile.get(region) ?? 0), 0);
  return overlap / total;
}

function collectSelectedEquipment(stations: WorkoutStation[]): EquipmentId[] {
  const equipment = new Set<EquipmentId>();
  for (const station of stations) {
    for (const item of station.exercises) {
      const option = item.exerciseSnapshot.equipmentOptions.find((candidate) => candidate.id === item.equipmentOptionId);
      for (const equipmentItem of option?.items ?? []) equipment.add(equipmentItem.equipmentId);
    }
  }
  return [...equipment];
}

function isObjectiveExtreme(activity: EnduranceActivity, durationMinutes: number): boolean {
  if (activity.discipline === 'run') return (activity.distanceMeters ?? 0) >= 48_280 || durationMinutes >= 240;
  if (activity.discipline === 'bike') return (activity.distanceMeters ?? 0) >= 160_900 || durationMinutes >= 360;
  if (activity.discipline === 'swim') return (activity.distanceMeters ?? 0) >= 8_000 || durationMinutes >= 150;
  return false;
}

function isEnduranceActivity(activity: EnduranceActivity): activity is EnduranceActivity & { discipline: EnduranceDiscipline } {
  return activity.discipline === 'swim' || activity.discipline === 'bike' || activity.discipline === 'run';
}

function loadRank(value: EnduranceLoadAssessment['loadClass']): number {
  if (value === 'extreme') return 7;
  if (value === 'race') return 6;
  if (value === 'long') return 5;
  if (value === 'hard') return 4;
  if (value === 'moderate') return 3;
  if (value === 'easy') return 2;
  return 1;
}

function confidenceRank(value: TrainingAdjustmentConfidence): number {
  return value === 'high' ? 3 : value === 'moderate' ? 2 : 1;
}

function prioritySummary(value: StrengthPlanningPriority): string {
  if (value === 'strength_build') return 'Offseason strength is protected; easy endurance should not automatically displace it.';
  if (value === 'return_to_strength') return 'Controlled return-to-strength work is protected unless pain or a restriction takes precedence.';
  if (value === 'race_specific') return 'Race-specific endurance has greater scheduling priority, while strength is maintained rather than abandoned.';
  return 'Strength and endurance are balanced; sport load changes dose only when the overlap is meaningful.';
}

function priorityLabel(value: StrengthPlanningPriority): string {
  return value.replaceAll('_', ' ');
}

function activityDate(activity: EnduranceActivity): string {
  return activity.startLocal?.slice(0, 10) ?? localDate(new Date(activity.startAt));
}

function eventDate(event: TrainingCalendarEvent): string {
  return localDate(new Date(event.startAt));
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function formatRatio(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDistance(meters: number, discipline: EnduranceDiscipline): string {
  if (discipline === 'swim') return `${Math.round(meters)} m`;
  return `${(meters / 1_609.344).toFixed(meters >= 16_093 ? 1 : 2)} mi`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDifference(left: string, right: string): number {
  return Math.round((new Date(`${right}T12:00:00.000Z`).getTime() - new Date(`${left}T12:00:00.000Z`).getTime()) / 86_400_000);
}

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function round1(value: number): number { return Math.round(value * 10) / 10; }
function round2(value: number): number { return Math.round(value * 100) / 100; }

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
