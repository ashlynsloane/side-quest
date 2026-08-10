import type {
  EnduranceActivity,
  PlannedCompletedMatch,
  PlannedStrengthSession,
  TrainingCalendarEvent,
} from '@circuit/domain';
import type { SportIconKind } from '@/components/sport-icon';
import type { WorkoutNameIntent, WorkoutNamePhase } from './workout-name-catalog';
import { selectHumanWorkoutName } from './workout-name-personality';
import type { TrainingHistoryItem } from './training-history';

export interface TrainingSignal {
  id: string;
  title: string;
  detail: string;
  tone: 'neutral' | 'good' | 'attention';
  route: '/training-history' | '/weekly-review' | '/insights' | '/adaptive-plan';
}

export interface EnduranceNamingHints {
  phase?: WorkoutNamePhase;
  triathlon?: boolean;
  weeksToRace?: number;
  raceName?: string;
  raceLocation?: string;
  recentNames?: string[];
}

export interface StrengthNamingHints {
  recentNames?: string[];
}

const WORKOUT_NAME_COOLDOWN_DAYS = 30;

type CooldownDiscipline = 'swim' | 'bike' | 'run' | 'strength';
type NameHistoryItem = { discipline: CooldownDiscipline; date: string; name: string };
type NameAssignmentItem =
  | { kind: 'endurance'; id: string; date: string; discipline: 'swim' | 'bike' | 'run'; event: TrainingCalendarEvent }
  | { kind: 'strength'; id: string; date: string; discipline: 'strength'; session: PlannedStrengthSession };

const runtimeNameAssignments = new Map<string, NameHistoryItem>();

export function workoutNameAssignmentKey(kind: 'endurance' | 'strength', id: string): string {
  return `${kind}:${id}`;
}

/**
 * Assigns the visible names for the whole generated block in chronological order.
 * Names stay stable for a specific session, while a name used by the same sport is
 * quarantined for 30 days whenever the catalog has another eligible option.
 */
export function buildWorkoutNameAssignments(
  events: TrainingCalendarEvent[],
  strength: PlannedStrengthSession[],
): Map<string, string> {
  const assignments = new Map<string, string>();
  const history: NameHistoryItem[] = [];
  const items: NameAssignmentItem[] = [
    ...events
      .filter((event): event is TrainingCalendarEvent & { discipline: 'swim' | 'bike' | 'run' } => event.discipline === 'swim' || event.discipline === 'bike' || event.discipline === 'run')
      .map((event) => ({
        kind: 'endurance' as const,
        id: event.id,
        date: event.startAt.slice(0, 10),
        discipline: event.discipline,
        event,
      })),
    ...strength.map((session) => ({
      kind: 'strength' as const,
      id: session.id,
      date: session.date,
      discipline: 'strength' as const,
      session,
    })),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.discipline.localeCompare(right.discipline) || left.id.localeCompare(right.id));

  for (const item of items) {
    const recentNames = cooldownNames(history, item.discipline, item.date);
    const name = item.kind === 'endurance'
      ? generatedEnduranceDisplayName(item.event, { recentNames })
      : plannedStrengthDisplayName(item.session, { recentNames });
    const key = workoutNameAssignmentKey(item.kind, item.id);
    assignments.set(key, name);
    history.push({ discipline: item.discipline, date: item.date, name });
    runtimeNameAssignments.set(key, { discipline: item.discipline, date: item.date, name });
  }
  return assignments;
}

export function conciseSessionLabel(input: { discipline?: string; name?: string; title?: string; trainer?: boolean }): string {
  const raw = (input.name ?? input.title ?? '').trim();
  const discipline = input.discipline;
  if (discipline === 'swim' || discipline === 'bike' || discipline === 'run') {
    const cleaned = cleanGeneratedTitle(raw);
    if (cleaned && isExpressiveWorkoutTitle(cleaned, discipline)) return cleaned;
    const text = cleaned.toLowerCase();
    if (discipline === 'swim') {
      if (/open water/.test(text)) return 'Open-water swim';
      if (/quality|threshold|interval|fast/.test(text)) return 'Fast & Smooth';
      if (/technique|drill/.test(text)) return 'Feel for the Water';
      if (/endurance|long/.test(text)) return 'Long Water';
      return 'Smooth Operator';
    }
    if (discipline === 'bike') {
      if (input.trainer || /virtual|trainer/.test(text)) return 'Trainer Time';
      if (/recovery|flush/.test(text)) return 'Leg Flush';
      if (/quality|threshold|interval/.test(text)) return 'Cruise Control';
      if (/tempo/.test(text)) return 'Tempo Engine';
      if (/long/.test(text)) return 'Long Haul';
      return 'Coffee Ride';
    }
    if (/return.?to.?run|run.?walk/.test(text)) return 'Run / Walk Rebuild';
    if (/recovery|shakeout/.test(text)) return 'Shakeout';
    if (/quality|interval/.test(text)) return 'Fast Feet';
    if (/tempo|threshold|10k/.test(text)) return 'Tempo Control';
    if (/long/.test(text)) return 'Long Miles';
    return 'Easy Miles';
  }
  if (discipline === 'strength') return 'Strength';
  if (discipline === 'hiit') return 'HIIT';
  return raw.replace(/^(swim|bike|run|other|x-train)\s*:\s*/i, '') || 'Training';
}

/**
 * Athlete-facing identity for a generated endurance session. Internal planner
 * titles remain semantic so prescription inference stays stable; athlete copy
 * comes from a larger curated catalog. A specific calendar event keeps a stable
 * title, while the same workout shape on a later date can rotate to a new name.
 */
export function generatedEnduranceDisplayName(event: TrainingCalendarEvent, hints: EnduranceNamingHints = {}): string {
  if (event.discipline !== 'swim' && event.discipline !== 'bike' && event.discipline !== 'run') {
    return conciseSessionLabel({ discipline: event.discipline, title: event.title });
  }

  const date = event.startAt.slice(0, 10);
  const assignmentKey = workoutNameAssignmentKey('endurance', event.id);
  if (hints.recentNames === undefined) {
    const cached = runtimeNameAssignments.get(assignmentKey);
    if (cached) return cached.name;
  }

  const raw = cleanGeneratedTitle(event.title);
  const durationMinutes = eventDurationMinutes(event);
  const intensity = generatedIntensity(event);
  const text = `${raw} ${event.description ?? ''}`.toLowerCase();
  const intents = generatedNameIntents(event.discipline, text, intensity, durationMinutes);
  const recentNames = hints.recentNames ?? cooldownNames([...runtimeNameAssignments.values()], event.discipline, date);

  const name = selectHumanWorkoutName({
    discipline: event.discipline,
    intents,
    intensity,
    durationMinutes,
    phase: hints.phase,
    triathlon: hints.triathlon,
    weeksToRace: hints.weeksToRace,
    raceName: hints.raceName,
    raceLocation: hints.raceLocation,
    environment: generatedEnvironment(event.discipline, text),
    seedKey: `${event.id}|${date}|${event.discipline}|${raw}|${durationMinutes}|${intensity}`,
    recentNames,
  });
  runtimeNameAssignments.set(assignmentKey, { discipline: event.discipline, date, name });
  return name;
}

/**
 * Strength names are tied to the specific planned session plus composition.
 * That keeps a rendered session stable without naming every recurring circuit
 * exactly the same thing for an entire block.
 */
export function plannedStrengthDisplayName(session: PlannedStrengthSession, hints: StrengthNamingHints = {}): string {
  const assignmentKey = workoutNameAssignmentKey('strength', session.id);
  if (hints.recentNames === undefined) {
    const cached = runtimeNameAssignments.get(assignmentKey);
    if (cached) return cached.name;
  }

  const intent: WorkoutNameIntent = session.purpose === 'swim_support'
    ? 'swim_support'
    : session.purpose === 'posterior_durability'
      ? 'posterior_durability'
      : session.purpose === 'single_leg_durability'
        ? 'single_leg_durability'
        : session.purpose === 'maintenance'
          ? 'maintenance'
          : 'general_strength';

  const fingerprint = session.workout.stations
    .flatMap((station) => [station.purpose, ...station.exercises.map((exercise) => exercise.exerciseSnapshot.name)])
    .join('|');
  const recentNames = hints.recentNames ?? cooldownNames([...runtimeNameAssignments.values()], 'strength', session.date);

  const name = selectHumanWorkoutName({
    discipline: 'strength',
    intents: [intent],
    durationMinutes: Math.max(1, Math.round(session.workout.estimatedElapsedSeconds / 60)),
    seedKey: `${session.id}|${session.date}|${fingerprint || session.workout.name || session.title}`,
    recentNames,
  });
  runtimeNameAssignments.set(assignmentKey, { discipline: 'strength', date: session.date, name });
  return name;
}

function cooldownNames(history: NameHistoryItem[], discipline: CooldownDiscipline, date: string): string[] {
  const current = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(current)) return [];
  return history
    .filter((item) => item.discipline === discipline)
    .filter((item) => {
      const previous = Date.parse(`${item.date}T12:00:00Z`);
      if (!Number.isFinite(previous)) return false;
      const days = (current - previous) / 86_400_000;
      return days >= 0 && days < WORKOUT_NAME_COOLDOWN_DAYS;
    })
    .map((item) => item.name);
}

function generatedNameIntents(
  discipline: 'swim' | 'bike' | 'run',
  text: string,
  intensity: 'easy' | 'moderate' | 'hard',
  durationMinutes: number,
): WorkoutNameIntent[] {
  const intents: WorkoutNameIntent[] = [];
  const add = (intent: WorkoutNameIntent) => { if (!intents.includes(intent)) intents.push(intent); };

  if (/recovery|flush|shakeout|very easy/.test(text)) add('recovery');
  if (/fartlek|change of pace|change-up|cadence change/.test(text)) add('fartlek');
  if (/technique|drill|form|catch/.test(text)) add('technique');
  if (/progressive|negative split|descending|strong finish|build within/.test(text)) add('progressive');
  if (/threshold|10k|cruise control/.test(text)) add('threshold');
  if (/tempo|steady state|sweet spot/.test(text)) add('tempo');
  if (/interval|repeats|vo2|sprint|quality/.test(text)) add('intervals');
  if (/long|endurance|time on feet|long aerobic/.test(text)) add('long');
  if (/race|brick|aero bar|transition/.test(text)) add('race_specific');
  if (/brick|t1|t2/.test(text)) add('brick');

  if (discipline === 'run' && /return.?to.?run|run.?walk|rebuild/.test(text)) add('return_to_run');
  if (/aerobic|steady|easy/.test(text) || intensity !== 'hard') add('aerobic');
  if (intensity === 'easy') add('easy');

  if (discipline === 'bike' && durationMinutes >= 150) add('long');
  if (discipline === 'swim' && durationMinutes >= 60 && !intents.includes('technique')) add('long');
  if (discipline === 'run' && durationMinutes >= 75 && !intents.includes('return_to_run')) add('long');

  if (!intents.length) add(intensity === 'hard' ? 'intervals' : 'aerobic');
  return intents;
}

function generatedEnvironment(
  discipline: 'swim' | 'bike' | 'run',
  text: string,
): 'pool' | 'open_water' | 'trainer' | 'outdoor' | 'track' | 'trail' | undefined {
  if (discipline === 'swim') return /open water|ocean|lake/.test(text) ? 'open_water' : 'pool';
  if (discipline === 'bike') return /trainer|virtual|zwift/.test(text) ? 'trainer' : 'outdoor';
  if (/track|400m|800m|1600m/.test(text)) return 'track';
  if (/trail|dirt|gravel/.test(text)) return 'trail';
  return 'outdoor';
}

function cleanGeneratedTitle(value: string): string {
  return value
    .replace(/^(Swim|Bike|Run)\s*[·:—-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExpressiveWorkoutTitle(value: string, discipline: 'swim' | 'bike' | 'run'): boolean {
  if (!value) return false;
  if (/[·—]/.test(value)) return true;
  const normalized = value.toLowerCase().replace(/[^a-z0-9+ ]/g, '').replace(/\s+/g, ' ').trim();
  const generic = discipline === 'swim'
    ? ['swim', 'swim quality', 'swim endurance', 'aerobic swim', 'aerobic + technique swim', 'aerobic technique swim']
    : discipline === 'bike'
      ? ['bike', 'ride', 'bike quality', 'aerobic ride', 'long endurance ride', 'long ride']
      : ['run', 'run quality', 'easy aerobic run', 'long aerobic run', 'easy return to run', 'return to run'];
  return !generic.includes(normalized);
}

function eventDurationMinutes(event: TrainingCalendarEvent): number {
  const descriptionMinutes = event.description?.match(/Side Quest generated · (\d+) min/i)?.[1];
  if (descriptionMinutes) return Math.max(1, Number(descriptionMinutes));
  const start = Date.parse(event.startAt);
  const end = event.endAt ? Date.parse(event.endAt) : Number.NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return Math.max(1, Math.round((end - start) / 60_000));
  return 60;
}

function generatedIntensity(event: TrainingCalendarEvent): 'easy' | 'moderate' | 'hard' {
  const encoded = event.description?.match(/Side Quest generated · \d+ min · ([a-z_]+)/i)?.[1]?.toLowerCase();
  if (encoded === 'hard' || encoded === 'max') return 'hard';
  if (encoded === 'moderate') return 'moderate';
  if (encoded === 'easy' || encoded === 'recovery') return 'easy';
  const text = `${event.title} ${event.description ?? ''}`.toLowerCase();
  if (/quality|interval|threshold|tempo|vo2|race|max/.test(text)) return 'hard';
  if (/moderate|steady/.test(text)) return 'moderate';
  return 'easy';
}

export function sportKind(discipline?: string): SportIconKind {
  if (discipline === 'swim' || discipline === 'bike' || discipline === 'run' || discipline === 'strength' || discipline === 'hiit') return discipline;
  return 'other';
}

export function sessionMeaning(activity: EnduranceActivity, match?: PlannedCompletedMatch): string {
  if (match?.status === 'ambiguous') return 'Review whether this replaced a planned session.';
  if (match?.status === 'matched') return 'Counted toward the planned session; no duplicate work added.';
  if (activity.discipline === 'hiit' || activity.discipline === 'strength') return 'Adds direct strength or conditioning load for the next planning decision.';
  if (activity.intensity === 'hard' || activity.intensity === 'race') return 'Hard training load; protect recovery before the next key session.';
  if (activity.discipline === 'run') return 'Adds impact exposure that should inform lower-body strength placement.';
  if (activity.discipline === 'swim') return 'Adds swim frequency without automatically displacing strength.';
  if (activity.discipline === 'bike') return 'Adds cycling load that should inform lower-body recovery.';
  return 'Recorded as context; no automatic plan change is required.';
}

export function buildTrainingSignals(items: TrainingHistoryItem[]): TrainingSignal[] {
  const recent = items.filter((item) => Date.parse(item.occurredAt) >= Date.now() - 14 * 86400000);
  const reviewCount = recent.filter((item) => item.needsReview).length;
  const strengthCount = recent.filter((item) => item.kind === 'strength' || (item.kind === 'endurance' && (item.activity.discipline === 'strength' || item.activity.discipline === 'hiit'))).length;
  const hardEndurance = recent.filter((item) => item.kind === 'endurance' && (item.activity.intensity === 'hard' || item.activity.intensity === 'race')).length;
  const runCount = recent.filter((item) => item.kind === 'endurance' && item.activity.discipline === 'run').length;
  const swimCount = recent.filter((item) => item.kind === 'endurance' && item.activity.discipline === 'swim').length;
  const signals: TrainingSignal[] = [];

  if (reviewCount > 0) signals.push({ id: 'review', title: `${reviewCount} record${reviewCount === 1 ? '' : 's'} need context`, detail: 'Confirm matches or classify external strength so future recommendations use the right load.', tone: 'attention', route: '/training-history' });
  if (strengthCount === 0) signals.push({ id: 'strength', title: 'No recent direct strength recorded', detail: 'Side Quest can preserve a minimum effective strength dose when you build or adjust the week.', tone: 'neutral', route: '/insights' });
  else signals.push({ id: 'strength', title: 'Strength is represented in recent training', detail: `${strengthCount} direct strength or HIIT session${strengthCount === 1 ? '' : 's'} in the last 14 days.`, tone: 'good', route: '/insights' });
  if (hardEndurance >= 3) signals.push({ id: 'hard', title: 'Several hard endurance sessions are close together', detail: 'Review spacing before adding another high-load strength or intensity day.', tone: 'attention', route: '/weekly-review' });
  else signals.push({ id: 'hard', title: 'Hard-session density is not elevated', detail: 'There is no automatic reason to remove strength based on recent intensity alone.', tone: 'good', route: '/weekly-review' });
  if (runCount === 0) signals.push({ id: 'run', title: 'No recent running detected', detail: 'Run capacity should be treated as unknown or rebuilding rather than inferred from older fitness.', tone: 'neutral', route: '/weekly-review' });
  if (swimCount > 0) signals.push({ id: 'swim', title: 'Swim frequency is established recently', detail: `${swimCount} swim session${swimCount === 1 ? '' : 's'} in the last 14 days.`, tone: 'good', route: '/weekly-review' });
  return signals.slice(0, 4);
}

export function eventMeaning(event: TrainingCalendarEvent): string {
  if (event.discipline === 'strength') return 'Strength priority';
  if (event.discipline === 'run') return 'Impact load';
  if (event.discipline === 'bike') return 'Lower-body endurance';
  if (event.discipline === 'swim') return 'Technical / aerobic';
  return 'Flexible training';
}