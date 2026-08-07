export type PainExperienceKind =
  | 'training_exertion'
  | 'post_exercise_soreness'
  | 'menstrual'
  | 'focal_musculoskeletal'
  | 'systemic'
  | 'unknown';

export type PainFunctionalInterference =
  | 'none'
  | 'noticeable'
  | 'modified_session'
  | 'stopped_session'
  | 'daily_activity'
  | 'rest_or_night';

export type PainProtectionLevel = 'expected' | 'monitor' | 'modify' | 'protect';
export type PainRatingPattern = 'insufficient' | 'numbers_run_low' | 'mixed_or_typical' | 'numbers_run_high';
export type TrainingHeadspaceSignal = 'neutral' | 'stressed' | 'frustrated' | 'angry' | 'overwhelmed';
export type MenstrualSymptom = 'cramps' | 'fatigue' | 'headache' | 'gi' | 'heavy_flow' | 'sleep' | 'mood';
export type CycleTrainingAdjustment = 'shorter' | 'easier' | 'indoor_bike' | 'avoid_swim' | 'reduce_run_intensity' | 'rest';

export interface PainContextReport {
  kind: PainExperienceKind;
  score0to10?: number;
  focal: boolean;
  newOrUnfamiliar: boolean;
  worsening: boolean;
  functionalInterference: PainFunctionalInterference;
  affectedArea: 'lower_body' | 'upper_body' | 'general' | 'unknown';
  stoppedSession: boolean;
  signals: string[];
}

export interface PainContextObservation extends PainContextReport {
  id: string;
  occurredAt: string;
  discipline?: 'swim' | 'bike' | 'run' | 'strength';
}

export interface PainCalibration {
  sampleCount: number;
  ratingPattern: PainRatingPattern;
  lowNumberHighImpactRate: number;
  highNumberLowImpactRate: number;
  confidence: 'low' | 'moderate' | 'high';
  explanations: string[];
}

export interface PainContextAssessment {
  level: PainProtectionLevel;
  report: PainContextReport;
  calibration?: PainCalibration;
  explanations: string[];
}

export interface MenstrualContextSignal {
  active: boolean;
  symptoms: MenstrualSymptom[];
  preferredAdjustments: CycleTrainingAdjustment[];
  functionalInterference: PainFunctionalInterference;
  signals: string[];
}

export interface CycleSymptomObservation {
  id: string;
  occurredAt: string;
  daysFromPeriodStart: number;
  symptoms: MenstrualSymptom[];
  affectedTraining: boolean;
  selectedAdjustments: CycleTrainingAdjustment[];
}

export interface CycleTrainingForecastInput {
  daysUntilPredictedPeriod: number;
  predictionConfidence: 'low' | 'moderate' | 'high';
  observations: CycleSymptomObservation[];
  activeSymptoms?: MenstrualContextSignal;
}

export interface CycleTrainingForecast {
  mode: 'context_only' | 'offer_preemptive_options' | 'active_symptom_adjustment';
  confidence: 'low' | 'moderate' | 'high';
  likelySymptoms: MenstrualSymptom[];
  suggestedAdjustments: CycleTrainingAdjustment[];
  explanations: string[];
}

export interface AthleteContextSignals {
  pain?: PainContextReport;
  menstrual?: MenstrualContextSignal;
  headspace: TrainingHeadspaceSignal;
  compensatoryTrainingIntent: boolean;
  requestedLargeTrainingLoad: boolean;
  signals: string[];
}

export interface ProtectiveTrainingRequestInput {
  now: string;
  recentPain: PainContextObservation[];
  requestedDiscipline?: 'swim' | 'bike' | 'run' | 'strength';
  requestedDurationMinutes?: number;
  requestedIntensity?: 'recovery' | 'easy' | 'moderate' | 'hard' | 'max';
  requestedLargeTrainingLoad?: boolean;
  compensatoryTrainingIntent?: boolean;
  headspace?: TrainingHeadspaceSignal;
}

export interface ProtectiveTrainingRequestDecision {
  action: 'allow' | 'hold_escalation' | 'protect';
  confidence: 'low' | 'moderate' | 'high';
  recentPainEventId?: string;
  maximumSuggestedDurationMinutes?: number;
  maximumSuggestedIntensity?: 'recovery' | 'easy' | 'moderate';
  explanations: string[];
}

const FUNCTION_RANK: Record<PainFunctionalInterference, number> = {
  none: 0,
  noticeable: 1,
  modified_session: 2,
  stopped_session: 3,
  daily_activity: 4,
  rest_or_night: 5,
};

export function interpretAthleteContextMessage(message: string): AthleteContextSignals {
  const text = message.trim().toLowerCase();
  const signals: string[] = [];
  const headspace = parseHeadspace(text);
  if (headspace !== 'neutral') signals.push(`Headspace: ${headspace}`);

  const compensatoryTrainingIntent = /\b(make\s*up|make\s+up\s+for|earn\s+back|punish|compensat|prove\s+(?:i|myself)|double\s+up|extra\s+because|because\s+i\s+missed)\b/.test(text);
  const requestedLargeTrainingLoad = /\b(century|100\s*(?:mi|mile|miles)|very\s+long\s+ride|long\s+hard\s+(?:ride|run)|double\s+workout|two\s+workouts|extra\s+long)\b/.test(text);
  if (compensatoryTrainingIntent) signals.push('Compensatory training intent');
  if (requestedLargeTrainingLoad) signals.push('Large training request');

  const menstrual = parseMenstrualContext(text);
  if (menstrual?.active) signals.push(...menstrual.signals);

  const pain = parsePainContext(text, menstrual);
  if (pain) signals.push(...pain.signals);

  return {
    pain,
    menstrual,
    headspace,
    compensatoryTrainingIntent,
    requestedLargeTrainingLoad,
    signals: unique(signals),
  };
}

export function buildPainCalibration(observations: PainContextObservation[]): PainCalibration {
  const scored = observations.filter((item) => typeof item.score0to10 === 'number');
  const lowNumberHighImpact = scored.filter((item) =>
    (item.score0to10 ?? 10) <= 4 && FUNCTION_RANK[item.functionalInterference] >= FUNCTION_RANK.modified_session,
  ).length;
  const highNumberLowImpact = scored.filter((item) =>
    (item.score0to10 ?? 0) >= 6 && FUNCTION_RANK[item.functionalInterference] <= FUNCTION_RANK.noticeable,
  ).length;
  const lowNumberHighImpactRate = scored.length ? lowNumberHighImpact / scored.length : 0;
  const highNumberLowImpactRate = scored.length ? highNumberLowImpact / scored.length : 0;
  const sampleCount = scored.length;
  const ratingPattern: PainRatingPattern = sampleCount < 3
    ? 'insufficient'
    : lowNumberHighImpactRate >= 0.34
      ? 'numbers_run_low'
      : highNumberLowImpactRate >= 0.34
        ? 'numbers_run_high'
        : 'mixed_or_typical';
  const confidence = sampleCount >= 8 ? 'high' : sampleCount >= 3 ? 'moderate' : 'low';
  const explanations = [
    `${sampleCount} scored pain observation${sampleCount === 1 ? '' : 's'} available for calibration.`,
  ];
  if (ratingPattern === 'numbers_run_low') explanations.push('This athlete has repeatedly used relatively low pain numbers even when symptoms changed function; functional impact should carry more weight than the number.');
  if (ratingPattern === 'numbers_run_high') explanations.push('This athlete has repeatedly used relatively high pain numbers with limited functional interference; the number remains useful but should be interpreted alongside function and pain type.');
  if (ratingPattern === 'mixed_or_typical') explanations.push('Pain numbers and functional impact have not shown a strong systematic mismatch.');
  if (ratingPattern === 'insufficient') explanations.push('There is not enough history to personalize how the numeric pain scale is interpreted.');
  explanations.push('Personal pain-scale calibration may change interpretation of the number, but it never downgrades focal, worsening, or function-limiting warning signals.');
  return { sampleCount, ratingPattern, lowNumberHighImpactRate, highNumberLowImpactRate, confidence, explanations };
}

export function assessPainContext(report: PainContextReport, calibration?: PainCalibration): PainContextAssessment {
  const functionRank = FUNCTION_RANK[report.functionalInterference];
  let level: PainProtectionLevel = 'monitor';
  const explanations: string[] = [];

  if (report.kind === 'training_exertion') {
    level = functionRank <= FUNCTION_RANK.noticeable && !report.focal ? 'expected' : 'modify';
    explanations.push('Expected exertional discomfort is not treated as an injury signal by itself.');
  } else if (report.kind === 'post_exercise_soreness') {
    level = functionRank >= FUNCTION_RANK.stopped_session || report.worsening ? 'modify' : 'monitor';
    explanations.push('Post-exercise soreness is interpreted through recovery trajectory and function, not the pain number alone.');
  } else if (report.kind === 'menstrual') {
    level = functionRank >= FUNCTION_RANK.stopped_session ? 'modify' : 'monitor';
    explanations.push('Menstrual symptoms can justify training changes without being treated as a musculoskeletal injury signal.');
  } else if (report.kind === 'systemic') {
    level = 'protect';
    explanations.push('Systemic or illness-like symptoms take priority over planned training load.');
  } else {
    const structuralWarning = report.focal && (
      report.newOrUnfamiliar
      || report.worsening
      || functionRank >= FUNCTION_RANK.modified_session
      || report.stoppedSession
    );
    if (structuralWarning || functionRank >= FUNCTION_RANK.daily_activity) level = 'protect';
    else if (report.focal || functionRank >= FUNCTION_RANK.modified_session) level = 'modify';
    else level = 'monitor';
    explanations.push('Focal musculoskeletal symptoms are weighted by function, novelty, trajectory, and training interruption before numeric intensity.');
  }

  if (typeof report.score0to10 === 'number') {
    explanations.push(`Self-reported intensity: ${report.score0to10}/10.`);
    if (report.score0to10 >= 8 && level === 'monitor') level = 'modify';
    if (calibration?.ratingPattern === 'numbers_run_low') explanations.push('This athlete’s history suggests low numeric ratings can still accompany meaningful functional impact, so the score does not lower the protection level.');
    if (calibration?.ratingPattern === 'numbers_run_high') explanations.push('This athlete’s history suggests numeric ratings may run high relative to function, so function and pain type remain the primary decision inputs.');
  }

  if (report.stoppedSession) explanations.push('The symptom caused a session to stop; that functional consequence is a high-value signal regardless of the numeric score.');
  if (report.worsening) explanations.push('Worsening symptoms increase protection even when the absolute pain number is modest.');

  return { level, report, calibration, explanations: unique(explanations) };
}

export function buildCycleTrainingForecast(input: CycleTrainingForecastInput): CycleTrainingForecast {
  if (input.activeSymptoms?.active) {
    return {
      mode: 'active_symptom_adjustment',
      confidence: 'high',
      likelySymptoms: input.activeSymptoms.symptoms,
      suggestedAdjustments: input.activeSymptoms.preferredAdjustments,
      explanations: [
        'Current symptoms are more informative than cycle phase alone.',
        'Use the athlete’s stated modality and intensity preferences when they fit the rest of the week.',
      ],
    };
  }

  const nearWindow = Math.abs(input.daysUntilPredictedPeriod) <= 2;
  const relevant = input.observations.filter((item) => Math.abs(item.daysFromPeriodStart) <= 2);
  const affected = relevant.filter((item) => item.affectedTraining);
  const establishedPersonalPattern = relevant.length >= 3 && affected.length / relevant.length >= 0.67;
  const likelySymptoms = topValues(relevant.flatMap((item) => item.symptoms), 3);
  const suggestedAdjustments = topValues(affected.flatMap((item) => item.selectedAdjustments), 3);

  if (nearWindow && input.predictionConfidence !== 'low' && establishedPersonalPattern) {
    return {
      mode: 'offer_preemptive_options',
      confidence: input.predictionConfidence === 'high' && relevant.length >= 5 ? 'high' : 'moderate',
      likelySymptoms,
      suggestedAdjustments,
      explanations: [
        `A personal pattern is present across ${relevant.length} observations near the predicted menstrual window.`,
        'Offer lower-stress or preferred-modality options before symptoms arrive, but do not force a reduction solely because of predicted cycle timing.',
      ],
    };
  }

  return {
    mode: 'context_only',
    confidence: input.predictionConfidence === 'high' ? 'moderate' : 'low',
    likelySymptoms,
    suggestedAdjustments: [],
    explanations: [
      'Cycle timing alone is not enough to prescribe a training reduction.',
      establishedPersonalPattern
        ? 'A personal symptom pattern exists, but the predicted window is not close enough or confident enough for a pre-emptive option.'
        : 'Wait for repeated athlete-specific symptom/training observations before anticipating a change.',
    ],
  };
}

export function evaluateProtectiveTrainingRequest(input: ProtectiveTrainingRequestInput): ProtectiveTrainingRequestDecision {
  const now = new Date(input.now).getTime();
  const recent = input.recentPain
    .map((event) => ({ event, ageHours: (now - new Date(event.occurredAt).getTime()) / 3_600_000 }))
    .filter(({ ageHours }) => ageHours >= 0 && ageHours <= 48)
    .map(({ event }) => ({ event, assessment: assessPainContext(event) }))
    .filter(({ assessment }) => assessment.level === 'protect' || assessment.report.stoppedSession)
    .sort((left, right) => new Date(right.event.occurredAt).getTime() - new Date(left.event.occurredAt).getTime());

  const trigger = recent[0];
  if (!trigger) {
    return { action: 'allow', confidence: 'moderate', explanations: ['No recent function-limiting pain event conflicts with the requested training load.'] };
  }

  const requestIsEscalation = Boolean(
    input.requestedLargeTrainingLoad
    || input.compensatoryTrainingIntent
    || input.requestedIntensity === 'hard'
    || input.requestedIntensity === 'max'
    || (input.requestedDurationMinutes ?? 0) >= 120,
  );
  const lowerBodyRequest = input.requestedDiscipline === 'bike' || input.requestedDiscipline === 'run' || input.requestedDiscipline === 'strength';
  const lowerBodyPain = trigger.event.affectedArea === 'lower_body';
  const explanations = [
    `A recent ${trigger.event.kind.replaceAll('_', ' ')} symptom changed or stopped training within the last 48 hours.`,
  ];

  if (input.compensatoryTrainingIntent) explanations.push('The requested session appears partly compensatory; missed training should not be repaid with a larger load before the limiting symptom has been re-evaluated.');
  if (input.headspace && input.headspace !== 'neutral') explanations.push(`Current ${input.headspace} headspace is acknowledged, but emotion does not override the recent functional training signal.`);

  if (requestIsEscalation && (!lowerBodyPain || lowerBodyRequest)) {
    explanations.push('A long or hard escalation immediately after function-limiting pain adds load before there is evidence that normal training tolerance has returned.');
    return {
      action: 'protect',
      confidence: 'high',
      recentPainEventId: trigger.event.id,
      maximumSuggestedDurationMinutes: 45,
      maximumSuggestedIntensity: 'easy',
      explanations,
    };
  }

  explanations.push('Hold progression and use the next session as a tolerance check rather than a compensatory workout.');
  return {
    action: 'hold_escalation',
    confidence: 'high',
    recentPainEventId: trigger.event.id,
    maximumSuggestedDurationMinutes: 60,
    maximumSuggestedIntensity: 'moderate',
    explanations,
  };
}

function parsePainContext(text: string, menstrual?: MenstrualContextSignal): PainContextReport | undefined {
  const score0to10 = parsePainScore(text);
  const lowerBody = /\b(legs?|quads?|quadriceps|hamstrings?|calves?|calf|glutes?|hips?|knees?|ankles?|feet|foot|shins?)\b/.test(text);
  const upperBody = /\b(arms?|shoulders?|back|chest|lats?|biceps|triceps|wrists?|hands?|elbows?)\b/.test(text);
  const affectedArea = lowerBody ? 'lower_body' as const : upperBody ? 'upper_body' as const : 'unknown' as const;
  const illness = /\b(sick|ill|fever|flu|chills|vomit|vomiting|infection)\b/.test(text);
  const exertion = /\b(muscles?\s+burning|legs?\s+burning|burn\s+from\s+(?:pushing|intervals?|effort)|lungs?\s+burning|normal\s+workout\s+burn|pushing\s+(?:hard|myself))\b/.test(text);
  const soreness = /\b(doms|delayed\s+onset|muscle\s+soreness|sore|achy|aching|stiff|stiffness)\b/.test(text);
  const painLanguage = /\b(pain|painful|hurt|hurts|hurting|sharp|twinge|niggle|injur|injured|injury)\b/.test(text);
  const focalLanguage = /\b(sharp|one\s+spot|specific\s+spot|localized|focal|one\s+(?:knee|foot|ankle|hip|shoulder|side))\b/.test(text) || painLanguage && (lowerBody || upperBody);
  const stoppedSession = /\b(had\s+to\s+(?:stop|quit)|stopped\s+(?:the\s+)?workout|quit\s+(?:the\s+)?workout|ended\s+(?:the\s+)?workout|cut\s+(?:it|the\s+workout)\s+short|couldn['’]?t\s+finish|could\s+not\s+finish|aborted)\b/.test(text);
  const modifiedSession = /\b(changed\s+(?:my\s+)?form|altered\s+(?:my\s+)?stride|limped|limping|backed\s+off\s+because|had\s+to\s+modify)\b/.test(text);
  const dailyActivity = /\b(hurts?\s+to\s+walk|can['’]?t\s+walk|cannot\s+walk|stairs\s+hurt|affecting\s+(?:daily|normal)\s+activity|limping\s+around)\b/.test(text);
  const restOrNight = /\b(hurts?\s+at\s+rest|resting\s+pain|wakes?\s+me\s+up|night\s+pain|hurts?\s+lying\s+down)\b/.test(text);
  const worsening = /\b(worse|worsening|getting\s+worse|more\s+painful|increasing)\b/.test(text);
  const newOrUnfamiliar = /\b(new\s+pain|never\s+felt|unfamiliar|different\s+pain|sudden)\b/.test(text);

  let functionalInterference: PainFunctionalInterference = 'none';
  if (restOrNight) functionalInterference = 'rest_or_night';
  else if (dailyActivity) functionalInterference = 'daily_activity';
  else if (stoppedSession) functionalInterference = 'stopped_session';
  else if (modifiedSession) functionalInterference = 'modified_session';
  else if (painLanguage || soreness || menstrual?.active || exertion) functionalInterference = 'noticeable';

  let kind: PainExperienceKind | undefined;
  if (illness) kind = 'systemic';
  else if (menstrual?.active && (painLanguage || menstrual.symptoms.includes('cramps'))) kind = 'menstrual';
  else if (exertion && !focalLanguage) kind = 'training_exertion';
  else if (soreness && !focalLanguage) kind = 'post_exercise_soreness';
  else if (painLanguage || focalLanguage) kind = focalLanguage ? 'focal_musculoskeletal' : 'unknown';
  else if (typeof score0to10 === 'number') kind = 'unknown';
  if (!kind) return undefined;

  const signals = [`Pain context: ${kind.replaceAll('_', ' ')}`];
  if (typeof score0to10 === 'number') signals.push(`${score0to10}/10 self-report`);
  if (stoppedSession) signals.push('Stopped session');
  else if (functionalInterference !== 'none') signals.push(`Functional impact: ${functionalInterference.replaceAll('_', ' ')}`);
  if (worsening) signals.push('Worsening');
  if (newOrUnfamiliar) signals.push('New or unfamiliar');

  return {
    kind,
    score0to10,
    focal: focalLanguage,
    newOrUnfamiliar,
    worsening,
    functionalInterference,
    affectedArea: kind === 'systemic' || kind === 'menstrual' ? 'general' : affectedArea,
    stoppedSession,
    signals,
  };
}

function parseMenstrualContext(text: string): MenstrualContextSignal | undefined {
  const cycleLanguage = /\b(period|menstrual|menstruat|pms|cycle\s+cramps?|period\s+cramps?|on\s+my\s+cycle|bleeding)\b/.test(text);
  if (!cycleLanguage) return undefined;
  const symptoms: MenstrualSymptom[] = [];
  if (/\b(cramp|cramps|cramping)\b/.test(text)) symptoms.push('cramps');
  if (/\b(tired|fatigue|fatigued|low\s+energy|drained)\b/.test(text)) symptoms.push('fatigue');
  if (/\b(headache|migraine)\b/.test(text)) symptoms.push('headache');
  if (/\b(nausea|nauseous|stomach|gi|diarrhea|diarrhoea|bloat|bloated)\b/.test(text)) symptoms.push('gi');
  if (/\b(heavy\s+flow|heavy\s+bleeding)\b/.test(text)) symptoms.push('heavy_flow');
  if (/\b(bad\s+sleep|poor\s+sleep|sleep\s+disrupt)\b/.test(text)) symptoms.push('sleep');
  if (/\b(irritable|mood|emotional)\b/.test(text)) symptoms.push('mood');

  const preferredAdjustments: CycleTrainingAdjustment[] = [];
  if (/\b(indoor|inside|trainer)\b/.test(text) && /\b(bike|ride|cycling)\b/.test(text)) preferredAdjustments.push('indoor_bike');
  if (/\b(shorter|shorten|less\s+time|cut\s+short)\b/.test(text)) preferredAdjustments.push('shorter');
  if (/\b(easier|easy|back\s+off|lower\s+intensity)\b/.test(text)) preferredAdjustments.push('easier');
  if (/\b(don['’]?t\s+want\s+to\s+swim|do\s+not\s+want\s+to\s+swim|skip\s+the\s+swim|avoid\s+swim)\b/.test(text)) preferredAdjustments.push('avoid_swim');
  if (/\b(run\s+(?:easier|easy|less\s+hard)|not\s+run\s+as\s+hard|reduce\s+run\s+intensity)\b/.test(text)) preferredAdjustments.push('reduce_run_intensity');
  if (/\b(rest|day\s+off|skip\s+training)\b/.test(text)) preferredAdjustments.push('rest');

  let functionalInterference: PainFunctionalInterference = 'noticeable';
  if (/\b(had\s+to\s+(?:stop|quit)|couldn['’]?t\s+finish|could\s+not\s+finish)\b/.test(text)) functionalInterference = 'stopped_session';
  else if (/\b(had\s+to\s+modify|changed\s+the\s+workout|backed\s+off\s+because)\b/.test(text)) functionalInterference = 'modified_session';

  return {
    active: true,
    symptoms: unique(symptoms),
    preferredAdjustments: unique(preferredAdjustments),
    functionalInterference,
    signals: [
      'Menstrual-cycle symptoms',
      ...symptoms.map((symptom) => `Cycle symptom: ${symptom.replaceAll('_', ' ')}`),
      ...preferredAdjustments.map((adjustment) => `Cycle preference: ${adjustment.replaceAll('_', ' ')}`),
    ],
  };
}

function parseHeadspace(text: string): TrainingHeadspaceSignal {
  if (/\b(overwhelmed|too\s+much|cannot\s+cope|can['’]?t\s+cope)\b/.test(text)) return 'overwhelmed';
  if (/\b(angry|mad|furious|pissed|rage)\b/.test(text)) return 'angry';
  if (/\b(frustrated|annoyed|discouraged|upset)\b/.test(text)) return 'frustrated';
  if (/\b(stressed|stressful|life\s+event|rough\s+day|rough\s+week)\b/.test(text)) return 'stressed';
  return 'neutral';
}

function parsePainScore(text: string): number | undefined {
  const slash = text.match(/\b(10|[0-9](?:\.\d+)?)\s*\/\s*10\b/);
  if (slash?.[1]) return clamp(Number(slash[1]), 0, 10);
  const outOf = text.match(/\b(10|[0-9](?:\.\d+)?)\s*(?:out\s+of)\s*10\b/);
  if (outOf?.[1]) return clamp(Number(outOf[1]), 0, 10);
  return undefined;
}

function topValues<T extends string>(values: T[], max: number): T[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, max)
    .map(([value]) => value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
