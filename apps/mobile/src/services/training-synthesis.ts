import type {
  EnduranceActivity,
  PlannedCompletedMatch,
  PlannedStrengthSession,
  TrainingCalendarEvent,
} from '@circuit/domain';
import type { SportIconKind } from '@/components/sport-icon';
import type { TrainingHistoryItem } from './training-history';

export interface TrainingSignal {
  id: string;
  title: string;
  detail: string;
  tone: 'neutral' | 'good' | 'attention';
  route: '/training-history' | '/weekly-review' | '/insights' | '/adaptive-plan';
}

export function conciseSessionLabel(input: { discipline?: string; name?: string; title?: string; trainer?: boolean }): string {
  const raw = (input.name ?? input.title ?? '').trim();
  const discipline = input.discipline;
  if (discipline === 'swim') return /open water/i.test(raw) ? 'Open-water swim' : 'Swim';
  if (discipline === 'bike') return input.trainer || /virtual|trainer/i.test(raw) ? 'Trainer ride' : 'Ride';
  if (discipline === 'run') return /trail/i.test(raw) ? 'Trail run' : 'Run';
  if (discipline === 'strength') return 'Strength';
  if (discipline === 'hiit') return 'HIIT';
  return raw.replace(/^(swim|bike|run|other|x-train)\s*:\s*/i, '') || 'Training';
}

/**
 * Athlete-facing identity for a generated endurance session. Internal planner
 * titles remain semantic so prescription inference stays stable; the product
 * can still sound like a coach instead of exposing planner taxonomy.
 */
export function generatedEnduranceDisplayName(event: TrainingCalendarEvent): string {
  if (event.discipline !== 'swim' && event.discipline !== 'bike' && event.discipline !== 'run') {
    return conciseSessionLabel({ discipline: event.discipline, title: event.title });
  }

  const raw = cleanGeneratedTitle(event.title);
  if (isExpressiveWorkoutTitle(raw, event.discipline)) return raw;

  const durationMinutes = eventDurationMinutes(event);
  const intensity = generatedIntensity(event);
  const text = `${raw} ${event.description ?? ''}`.toLowerCase();

  if (event.discipline === 'bike') {
    if (/recovery|flush/.test(text)) return 'Leg Flush';
    if (intensity === 'hard' || /quality|interval|threshold|tempo|vo2/.test(text)) {
      if (/threshold/.test(text)) return 'Threshold Business';
      if (/tempo/.test(text)) return 'Tempo Engine';
      return 'Cruise Control';
    }
    if (/long/.test(text) || durationMinutes >= 150) return 'Long Haul';
    if (durationMinutes <= 65) return 'Coffee Ride';
    if (durationMinutes <= 110) return 'T-Shirt Ride';
    return 'Easy Does It';
  }

  if (event.discipline === 'swim') {
    if (/technique|drill/.test(text)) return 'Feel for the Water';
    if (intensity === 'hard' || /quality|threshold|fast|sprint/.test(text)) return 'Fast & Smooth';
    if (/long|endurance/.test(text) || durationMinutes >= 60) return 'Long Water';
    if (intensity === 'moderate') return 'Steady Blue';
    return 'Smooth Operator';
  }

  if (/return-to-run|return to run|run.?walk/.test(text)) return 'Run / Walk Rebuild';
  if (/recovery|shakeout/.test(text)) return 'Shakeout';
  if (intensity === 'hard' || /quality|interval|threshold|tempo|10k|5k/.test(text)) {
    if (/tempo|threshold|10k/.test(text)) return 'Tempo Control';
    return 'Fast Feet';
  }
  if (/long/.test(text) || durationMinutes >= 75) return 'Long Miles';
  return 'Easy Miles';
}

/**
 * Stable strength identity derived from workout composition. If the same
 * generated workout returns later, it receives the same athlete-facing name.
 */
export function plannedStrengthDisplayName(session: PlannedStrengthSession): string {
  const names = session.purpose === 'swim_support'
    ? ['Catch & Core', 'Poolside Pull', 'Swim Strong', 'Lats & Lines']
    : session.purpose === 'posterior_durability'
      ? ['Chain Reaction', 'Hinge & Hold', 'Backside Business', 'Posterior Power']
      : session.purpose === 'single_leg_durability'
        ? ['Single-Leg Armor', 'One-Leg Engine', 'Stability + Drive', 'Strong on One']
        : session.purpose === 'maintenance'
          ? ['Hold the Line', 'Strength Tune-Up', 'Keep It Sharp', 'Durability Circuit']
          : ['Engine Room', 'All Systems Go', 'Base Camp Strength', 'Built to Last'];

  const fingerprint = session.workout.stations
    .flatMap((station) => [station.purpose, ...station.exercises.map((exercise) => exercise.exerciseSnapshot.name)])
    .join('|');
  return names[stableIndex(fingerprint || session.workout.name || session.title, names.length)]!;
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

function stableIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, length);
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
