import type {
  EnduranceGoal,
  GoalSpecificCoachingInput,
  GoalSpecificCoachingResult,
  GoalSpecificFinding,
  GoalSpecificProfile,
  IntelligentTrainingSession,
  TrainingObjective,
} from '@circuit/domain';

const COMMON_SAFEGUARDS = [
  'Goal heuristics never override pain, illness, injury restrictions, or return-to-sport safeguards.',
  'The planner does not prescribe compensatory exercise or replace missed volume automatically.',
  'Low-confidence adaptation estimates cannot independently trigger a major plan change.',
  'All calendar-changing recommendations require athlete approval.',
];

const PROFILES: Record<EnduranceGoal, GoalSpecificProfile> = {
  sprint_triathlon: {
    goal: 'sprint_triathlon', label: 'Sprint triathlon',
    primaryObjectives: ['vo2_max', 'lactate_threshold', 'technique', 'race_specific'],
    disciplinePriorities: [
      { discipline: 'swim', priority: 82, minimumWeeklySessions: 2, preferredWeeklySessions: 3, rationale: 'Frequent technique exposure supports short-course swim performance.' },
      { discipline: 'bike', priority: 88, minimumWeeklySessions: 2, preferredWeeklySessions: 3, rationale: 'Bike power and transition readiness are central.' },
      { discipline: 'run', priority: 88, minimumWeeklySessions: 2, preferredWeeklySessions: 3, rationale: 'Short-course running benefits from frequency and speed economy.' },
      { discipline: 'strength', priority: 62, minimumWeeklySessions: 1, preferredWeeklySessions: 2, rationale: 'Maintain force production without crowding key intensity.' },
    ], keySessionTypes: ['short brick', 'race-pace intervals', 'swim technique'], raceSpecificityWindowWeeks: 6, taperWindowWeeks: 1,
    strengthRules: ['Preserve one primary strength exposure through build.', 'Reduce soreness-producing lower-body volume in race week.'], safeguards: COMMON_SAFEGUARDS,
  },
  olympic_triathlon: {
    goal: 'olympic_triathlon', label: 'Olympic triathlon',
    primaryObjectives: ['lactate_threshold', 'aerobic_base', 'technique', 'race_specific'],
    disciplinePriorities: [
      { discipline: 'swim', priority: 84, minimumWeeklySessions: 2, preferredWeeklySessions: 3, rationale: 'Technique and threshold swimming both matter.' },
      { discipline: 'bike', priority: 92, minimumWeeklySessions: 2, preferredWeeklySessions: 3, rationale: 'Sustained bike power drives overall performance.' },
      { discipline: 'run', priority: 90, minimumWeeklySessions: 2, preferredWeeklySessions: 3, rationale: 'Run durability and threshold economy are required.' },
      { discipline: 'strength', priority: 66, minimumWeeklySessions: 1, preferredWeeklySessions: 2, rationale: 'Strength supports durability and economy.' },
    ], keySessionTypes: ['threshold bike', 'brick run', 'race-pace swim'], raceSpecificityWindowWeeks: 8, taperWindowWeeks: 1,
    strengthRules: ['Keep strength meaningful in base and early build.', 'Consolidate lower-body load around key bike/run days.'], safeguards: COMMON_SAFEGUARDS,
  },
  half_ironman: {
    goal: 'half_ironman', label: 'Half Ironman 70.3',
    primaryObjectives: ['aerobic_base', 'lactate_threshold', 'muscular_endurance', 'race_specific'],
    disciplinePriorities: [
      { discipline: 'swim', priority: 82, minimumWeeklySessions: 2, preferredWeeklySessions: 3, rationale: 'Consistent technique and endurance reduce race-day cost.' },
      { discipline: 'bike', priority: 100, minimumWeeklySessions: 3, preferredWeeklySessions: 4, rationale: 'Bike durability and fueling practice dominate race specificity.' },
      { discipline: 'run', priority: 92, minimumWeeklySessions: 2, preferredWeeklySessions: 3, rationale: 'Run durability must be developed without compromising bone or tissue health.' },
      { discipline: 'strength', priority: 74, minimumWeeklySessions: 1, preferredWeeklySessions: 2, rationale: 'Strength remains a protected durability input until late peak.' },
    ], keySessionTypes: ['long ride with fueling', 'race-pace brick', 'long aerobic swim'], raceSpecificityWindowWeeks: 10, taperWindowWeeks: 2, longSessionDiscipline: 'bike',
    strengthRules: ['Preserve direct strength after ordinary swim, bike, or run load.', 'Reduce heavy quadriceps work only when race proximity or capacity conflict supports it.', 'Do not use endurance volume as a substitute for strength.'], safeguards: COMMON_SAFEGUARDS,
  },
  full_ironman: {
    goal: 'full_ironman', label: 'Full Ironman',
    primaryObjectives: ['aerobic_base', 'muscular_endurance', 'race_specific', 'recovery'],
    disciplinePriorities: [
      { discipline: 'swim', priority: 82, minimumWeeklySessions: 2, preferredWeeklySessions: 3, rationale: 'Efficiency preserves energy for the bike and run.' },
      { discipline: 'bike', priority: 100, minimumWeeklySessions: 3, preferredWeeklySessions: 4, rationale: 'Long-duration bike durability is the largest training demand.' },
      { discipline: 'run', priority: 90, minimumWeeklySessions: 2, preferredWeeklySessions: 4, rationale: 'Frequency is favored over excessive single-run load.' },
      { discipline: 'strength', priority: 68, minimumWeeklySessions: 1, preferredWeeklySessions: 2, rationale: 'Maintenance supports durability under high volume.' },
    ], keySessionTypes: ['long fueled ride', 'durability brick', 'steady long run'], raceSpecificityWindowWeeks: 14, taperWindowWeeks: 3, longSessionDiscipline: 'bike',
    strengthRules: ['Shift from development to maintenance as race specificity rises.', 'Avoid high-soreness novelty during peak volume.'], safeguards: COMMON_SAFEGUARDS,
  },
  road_10k: {
    goal: 'road_10k', label: 'Road 10K',
    primaryObjectives: ['vo2_max', 'lactate_threshold', 'neuromuscular_speed', 'aerobic_base'],
    disciplinePriorities: [
      { discipline: 'run', priority: 100, minimumWeeklySessions: 3, preferredWeeklySessions: 5, rationale: 'Run frequency, economy, and specific intensity are primary.' },
      { discipline: 'strength', priority: 76, minimumWeeklySessions: 1, preferredWeeklySessions: 2, rationale: 'Strength and power support economy and resilience.' },
      { discipline: 'bike', priority: 40, rationale: 'Cycling can provide supplemental aerobic work.' },
      { discipline: 'swim', priority: 35, rationale: 'Swimming can support aerobic recovery without replacing run specificity.' },
    ], keySessionTypes: ['threshold intervals', '10K-pace work', 'strides'], raceSpecificityWindowWeeks: 8, taperWindowWeeks: 1, longSessionDiscipline: 'run',
    strengthRules: ['Protect strength early in the cycle.', 'Avoid heavy lower-body lifting immediately before key run intensity.'], safeguards: COMMON_SAFEGUARDS,
  },
  half_marathon: {
    goal: 'half_marathon', label: 'Half marathon',
    primaryObjectives: ['aerobic_base', 'lactate_threshold', 'muscular_endurance', 'race_specific'],
    disciplinePriorities: [
      { discipline: 'run', priority: 100, minimumWeeklySessions: 3, preferredWeeklySessions: 5, rationale: 'Durability and threshold economy are decisive.' },
      { discipline: 'strength', priority: 74, minimumWeeklySessions: 1, preferredWeeklySessions: 2, rationale: 'Strength supports economy and tissue capacity.' },
      { discipline: 'bike', priority: 42, rationale: 'Cycling may add low-impact aerobic volume.' },
    ], keySessionTypes: ['long run', 'threshold run', 'race-pace progression'], raceSpecificityWindowWeeks: 10, taperWindowWeeks: 2, longSessionDiscipline: 'run',
    strengthRules: ['Maintain strength until late peak.', 'Consolidate lifting away from long-run and threshold priorities.'], safeguards: COMMON_SAFEGUARDS,
  },
  marathon: {
    goal: 'marathon', label: 'Marathon',
    primaryObjectives: ['aerobic_base', 'muscular_endurance', 'race_specific', 'recovery'],
    disciplinePriorities: [
      { discipline: 'run', priority: 100, minimumWeeklySessions: 3, preferredWeeklySessions: 5, rationale: 'Durability and marathon-specific fueling are central.' },
      { discipline: 'strength', priority: 70, minimumWeeklySessions: 1, preferredWeeklySessions: 2, rationale: 'Strength supports durability but must not degrade long-run quality.' },
      { discipline: 'bike', priority: 38, rationale: 'Cycling can supplement aerobic work when appropriate.' },
    ], keySessionTypes: ['long run with fueling', 'marathon-pace work', 'medium-long run'], raceSpecificityWindowWeeks: 12, taperWindowWeeks: 3, longSessionDiscipline: 'run',
    strengthRules: ['Retain one maintenance exposure during peak.', 'Reduce eccentric novelty and failure training near long runs.'], safeguards: COMMON_SAFEGUARDS,
  },
  trail_100k: {
    goal: 'trail_100k', label: 'Trail 100K',
    primaryObjectives: ['aerobic_base', 'muscular_endurance', 'race_specific', 'injury_prevention'],
    disciplinePriorities: [
      { discipline: 'run', priority: 100, minimumWeeklySessions: 3, preferredWeeklySessions: 5, rationale: 'Terrain-specific durability and time on feet are primary.' },
      { discipline: 'strength', priority: 82, minimumWeeklySessions: 1, preferredWeeklySessions: 2, rationale: 'Strength supports climbing, descending, and tissue resilience.' },
      { discipline: 'mobility', priority: 54, minimumWeeklySessions: 1, rationale: 'Mobility supports terrain tolerance without replacing strength.' },
    ], keySessionTypes: ['terrain long run', 'climbing session', 'downhill durability'], raceSpecificityWindowWeeks: 14, taperWindowWeeks: 2, longSessionDiscipline: 'terrain',
    strengthRules: ['Prioritize unilateral strength, calf capacity, and trunk durability.', 'Do not stack high downhill load with high-soreness strength.'], safeguards: COMMON_SAFEGUARDS,
  },
  swim_run: {
    goal: 'swim_run', label: 'Swim-run',
    primaryObjectives: ['aerobic_base', 'race_specific', 'technique', 'muscular_endurance'],
    disciplinePriorities: [
      { discipline: 'swim', priority: 100, minimumWeeklySessions: 3, preferredWeeklySessions: 4, rationale: 'Open-water efficiency and repeated swim transitions are primary.' },
      { discipline: 'run', priority: 96, minimumWeeklySessions: 3, preferredWeeklySessions: 4, rationale: 'Trail durability and repeated transitions are required.' },
      { discipline: 'strength', priority: 78, minimumWeeklySessions: 1, preferredWeeklySessions: 2, rationale: 'Upper-body, trunk, and terrain strength support both disciplines.' },
    ], keySessionTypes: ['swim-run brick', 'open-water technique', 'trail durability'], raceSpecificityWindowWeeks: 10, taperWindowWeeks: 2, longSessionDiscipline: 'brick',
    strengthRules: ['Preserve shoulder and pulling strength without compromising swim quality.', 'Include trail-specific single-leg and trunk work.'], safeguards: COMMON_SAFEGUARDS,
  },
  general_endurance: {
    goal: 'general_endurance', label: 'General endurance',
    primaryObjectives: ['aerobic_base', 'max_strength', 'technique', 'recovery'],
    disciplinePriorities: [
      { discipline: 'strength', priority: 80, minimumWeeklySessions: 2, preferredWeeklySessions: 3, rationale: 'General strength remains a first-class objective.' },
      { discipline: 'bike', priority: 65, rationale: 'Aerobic work can be distributed across preferred disciplines.' },
      { discipline: 'run', priority: 65, rationale: 'Aerobic work can be distributed across preferred disciplines.' },
      { discipline: 'swim', priority: 65, rationale: 'Aerobic work can be distributed across preferred disciplines.' },
    ], keySessionTypes: ['long aerobic session', 'primary strength session', 'technique session'], raceSpecificityWindowWeeks: 4, taperWindowWeeks: 1,
    strengthRules: ['Do not subordinate strength to arbitrary endurance volume.', 'Use athlete preference to distribute aerobic work.'], safeguards: COMMON_SAFEGUARDS,
  },
};

function normalizedDiscipline(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('swim')) return 'swim';
  if (lower.includes('bike') || lower.includes('ride') || lower.includes('cycle')) return 'bike';
  if (lower.includes('run') || lower.includes('trail')) return 'run';
  if (lower.includes('strength') || lower.includes('lift') || lower.includes('side quest')) return 'strength';
  if (lower.includes('mobility')) return 'mobility';
  if (lower.includes('recover') || lower.includes('rest')) return 'recovery';
  return lower;
}

function countDiscipline(sessions: IntelligentTrainingSession[], discipline: string): number {
  return sessions.filter((session) => normalizedDiscipline(session.discipline) === discipline).length;
}

function findingsFor(input: GoalSpecificCoachingInput, profile: GoalSpecificProfile): GoalSpecificFinding[] {
  const findings: GoalSpecificFinding[] = [];
  for (const priority of profile.disciplinePriorities) {
    const count = countDiscipline(input.sessions, priority.discipline);
    if (priority.minimumWeeklySessions !== undefined && count < priority.minimumWeeklySessions) {
      const safetyException = priority.discipline === 'run' && (input.currentlyRunning === false || input.returnToRun === true);
      findings.push({
        findingId: `discipline:${priority.discipline}`,
        severity: safetyException ? 'info' : 'important',
        category: safetyException ? 'safety' : 'discipline_balance',
        message: safetyException
          ? `Run frequency is intentionally not enforced during a no-running or return-to-run period.`
          : `${profile.label} normally benefits from at least ${priority.minimumWeeklySessions} ${priority.discipline} sessions in this phase.`,
        affectedSessionIds: [],
        reasons: [priority.rationale, safetyException ? 'Current athlete status overrides generic goal frequency.' : `${count} are currently scheduled.`],
      });
    }
  }
  const keySessions = input.sessions.filter((session) => session.role === 'key' || session.role === 'event');
  if (keySessions.length === 0) {
    findings.push({
      findingId: 'key-session:none', severity: 'watch', category: 'key_session',
      message: 'No key or event session is identified for this planning window.', affectedSessionIds: [],
      reasons: [`The ${profile.label} profile uses key-session protection to preserve the most goal-relevant work.`],
    });
  }
  if (input.weeksUntilEvent !== undefined && input.weeksUntilEvent <= profile.raceSpecificityWindowWeeks) {
    const specific = input.sessions.filter((session) => session.objective === 'race_specific');
    if (specific.length === 0) {
      findings.push({
        findingId: 'specificity:missing', severity: 'important', category: 'specificity',
        message: `Race-specific work is expected inside the final ${profile.raceSpecificityWindowWeeks} weeks, subject to readiness and injury constraints.`,
        affectedSessionIds: [], reasons: ['No race-specific session is currently identified.'],
      });
    }
  }
  const strengthCount = countDiscipline(input.sessions, 'strength');
  const strengthPriority = profile.disciplinePriorities.find((item) => item.discipline === 'strength');
  if (strengthPriority?.minimumWeeklySessions && strengthCount < strengthPriority.minimumWeeklySessions && input.currentPhase !== 'race_week') {
    findings.push({
      findingId: 'strength:underrepresented', severity: 'watch', category: 'strength',
      message: 'Direct strength is underrepresented for this goal and phase.', affectedSessionIds: [],
      reasons: [...profile.strengthRules, `${strengthCount} direct strength sessions are scheduled.`],
    });
  }
  return findings;
}

export function getGoalSpecificProfile(goal: EnduranceGoal): GoalSpecificProfile {
  return PROFILES[goal];
}

export function evaluateGoalSpecificCoaching(input: GoalSpecificCoachingInput): GoalSpecificCoachingResult {
  const profile = PROFILES[input.goal];
  const protectedSessionIds = input.sessions
    .filter((session) => session.role === 'event' || session.role === 'key' || profile.primaryObjectives.includes(session.objective))
    .map((session) => session.sessionId);
  const adaptationOrder: TrainingObjective[] = [...profile.primaryObjectives];
  if (input.adaptation?.mostAtRiskObjective && !adaptationOrder.includes(input.adaptation.mostAtRiskObjective)) {
    adaptationOrder.push(input.adaptation.mostAtRiskObjective);
  }
  return {
    generatedAt: input.generatedAt,
    goal: input.goal,
    profile,
    findings: findingsFor(input, profile),
    protectedSessionIds,
    suggestedObjectiveOrder: adaptationOrder,
    coachSummary: [
      `${profile.label} coaching prioritizes ${profile.primaryObjectives.join(', ')}.`,
      `Key session archetypes: ${profile.keySessionTypes.join(', ')}.`,
      input.weeksUntilEvent === undefined
        ? 'Race proximity was not supplied, so specificity and taper decisions remain conservative.'
        : `${input.weeksUntilEvent} weeks remain; the profile uses a ${profile.raceSpecificityWindowWeeks}-week specificity window and ${profile.taperWindowWeeks}-week taper window.`,
    ],
    requiresAthleteApproval: true,
    safeguards: [...profile.safeguards, ...profile.strengthRules],
  };
}
