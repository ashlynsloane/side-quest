import {
  WORKOUT_NAME_CATALOG,
  type WorkoutNameDiscipline,
  type WorkoutNameEntry,
  type WorkoutNameIntent,
  type WorkoutNamingContext,
} from './workout-name-catalog';

/**
 * Extra athlete-facing names that deliberately lean playful, specific, and a
 * little dumb. This is product voice, not prescription logic.
 */
export const PLAYFUL_WORKOUT_NAMES: WorkoutNameEntry[] = [
  // Swim
  p('Chlorine & Delusion', 'swim', ['easy', 'aerobic']),
  p('Goggles Before Feelings', 'swim', ['easy', 'recovery']),
  p('Counting Tiles Again', 'swim', ['long', 'aerobic']),
  p('Lane 4 Existential Crisis', 'swim', ['aerobic']),
  p('Flip Turns & Questionable Decisions', 'swim', ['technique']),
  p('Why Is the Pool So Cold?', 'swim', ['easy', 'recovery']),
  p('Black Line Fan Club', 'swim', ['long', 'aerobic']),
  p('Main Set? Never Heard of Her', 'swim', ['intervals', 'threshold']),
  p('Just One More 100', 'swim', ['intervals', 'threshold']),
  p('Splash Now, Think Later', 'swim', ['fartlek', 'aerobic']),
  p('Wet Hair, Clear Brain', 'swim', ['easy', 'aerobic']),
  p('Pool Goblin Hours', 'swim', ['aerobic', 'long']),

  // Bike
  p('Zone 2 & Vibes', 'bike', ['easy', 'aerobic']),
  p('Pedal Now, Brunch Later', 'bike', ['easy', 'aerobic']),
  p('Ride Bikes, Avoid Emails', 'bike', ['easy', 'aerobic']),
  p('Helmet Hair Hour', 'bike', ['easy', 'aerobic']),
  p('Legs Go Brrrr', 'bike', ['easy', 'aerobic']),
  p('Absolutely No KOMs', 'bike', ['recovery', 'easy']),
  p('Snack Acquisition Ride', 'bike', ['long', 'aerobic']),
  p('Three Hours of Snacks', 'bike', ['long', 'aerobic']),
  p('The Snack Pocket Tour', 'bike', ['long', 'aerobic']),
  p('Bib Shorts Business Casual', 'bike', ['long', 'aerobic']),
  p('Aero Bars, Zero Thoughts', 'bike', ['race_specific', 'tempo']),
  p('Cadence Goblin', 'bike', ['fartlek']),
  p('Watts Before Snacks', 'bike', ['threshold', 'intervals']),
  p('Indoor Bike Jail', 'bike', ['threshold', 'intervals'], ['trainer']),

  // Run
  p('No Pace, Just Vibes', 'run', ['easy', 'aerobic']),
  p('Shoes On, Brain Off', 'run', ['easy', 'aerobic']),
  p('The Silly Little Run', 'run', ['easy', 'aerobic']),
  p('Jogging for Administrative Purposes', 'run', ['easy', 'aerobic']),
  p('Out for a Trot', 'run', ['easy', 'aerobic']),
  p('Miles & Mild Regret', 'run', ['easy', 'aerobic']),
  p('Tiny Run Club', 'run', ['return_to_run', 'easy']),
  p('Running-ish', 'run', ['return_to_run', 'easy']),
  p('Return of the Jog', 'run', ['return_to_run', 'easy']),
  p('Jogging With Supervision', 'run', ['return_to_run', 'easy']),
  p('Twenty Minutes of Character Development', 'run', ['return_to_run', 'easy']),
  p('Feet, Please Behave', 'run', ['return_to_run', 'easy']),
  p('The Comeback Shuffle', 'run', ['return_to_run', 'easy']),
  p('A Very Small Run', 'run', ['return_to_run', 'easy']),
  p('Back Outside, Casually', 'run', ['return_to_run', 'easy']),
  p('Run / Walk / Do Not Panic', 'run', ['return_to_run', 'easy']),

  // Strength
  p('Pick Things Up, Put Them Down', 'strength', ['general_strength']),
  p('Leg Day, But Responsible', 'strength', ['maintenance', 'posterior_durability']),
  p('Hinge Responsibly', 'strength', ['posterior_durability']),
  p('Glutes Have Entered the Chat', 'strength', ['posterior_durability', 'single_leg_durability']),
  p('Pull Day for Pool People', 'strength', ['swim_support']),
  p('Anti-Noodle Arms', 'strength', ['swim_support']),
  p('The Maintenance Department', 'strength', ['maintenance']),
  p('Strong-ish', 'strength', ['maintenance', 'general_strength']),
  p('Core Values', 'strength', ['swim_support', 'general_strength']),
  p('Tiny Gym Side Quest', 'strength', ['general_strength']),

  // Triathlon-specific voice. Race-location packs can layer on later.
  tri('Goggles, Gears & Bad Ideas', ['swim', 'bike', 'run', 'strength'], ['race_specific']),
  tri('Three Sports, One Personality', ['swim', 'bike', 'run', 'strength'], ['race_specific']),
  tri('Because One Sport Was Too Easy', ['swim', 'bike', 'run'], ['race_specific']),
  tri('Triathlete Math', ['swim', 'bike', 'run'], ['race_specific']),
  tri('T1 Panic Practice', ['bike'], ['race_specific']),
  tri('T2: Where Did My Legs Go?', ['bike', 'run'], ['brick', 'race_specific']),
  tri('Wet, Then Wheely', ['swim', 'bike'], ['race_specific']),
  tri('Brick Happens', ['bike', 'run'], ['brick', 'race_specific']),
  tri('Why Are My Shoes Wet?', ['swim', 'bike', 'run'], ['race_specific']),
  tri('Nutrition Is the Fourth Sport', ['bike', 'run'], ['long', 'race_specific']),
  tri('Transition Bag Tetris', ['swim', 'bike', 'run'], ['race_specific']),
  tri('Three Sports, Zero Free Time', ['swim', 'bike', 'run'], ['race_specific']),
  tri('Gels Are a Food Group', ['bike', 'run'], ['long', 'race_specific']),
  tri('Helmet First, Dignity Later', ['bike', 'run'], ['brick', 'race_specific']),
  tri('Bike Legs Are Fake News', ['run'], ['brick', 'race_specific']),
  tri('Run Legs Pending', ['run'], ['brick', 'race_specific']),
  tri('Aero Is a Personality Trait', ['bike'], ['race_specific']),
  tri('Wetsuit Wrestling', ['swim'], ['race_specific']),
  tri('Where Did I Park My Bike?', ['bike', 'run'], ['race_specific']),
  tri('Transition Brain', ['swim', 'bike', 'run'], ['race_specific']),
];

const SERIOUS_OR_STALE_NAMES = new Set([
  'Swim. Bike. Side Quest.',
  'Give It Everything',
  'Give it everything',
  'All Systems Go',
  'Built to Last',
  'Race Pace, No Drama',
  'Race Legs Loading',
  'Keep the Fuse Lit',
]);

const PLAYFUL_NAMES = new Set(PLAYFUL_WORKOUT_NAMES.map((entry) => entry.name));
const HARD_QUALITY_INTENTS = new Set<WorkoutNameIntent>(['fartlek', 'tempo', 'threshold', 'intervals', 'progressive', 'brick', 'race_specific']);
const HARD_DURATION_GATES = new Map<string, { min?: number; max?: number }>([
  ['Coffee Ride', { max: 75 }],
  ['T-Shirt Ride', { min: 45, max: 75 }],
  ['Helmet Hair Hour', { min: 45, max: 75 }],
  ['Absolutely No KOMs', { max: 90 }],
  ['Pocket Full of Snacks', { min: 120 }],
  ['Snack Acquisition Ride', { min: 120 }],
  ['The Snack Pocket Tour', { min: 120 }],
  ['The Snack Loop', { min: 120 }],
  ['Bib Shorts Business Casual', { min: 150 }],
  ['Two Bottles Minimum', { min: 150 }],
  ['The Long Way Home', { min: 150 }],
  ['Ride Bikes, Eat Snacks', { min: 150 }],
  ['Long Haul', { min: 150 }],
  ['Bottle, Gel, Repeat', { min: 150 }],
  ['All-Day Legs', { min: 180 }],
  ['Three Hours of Snacks', { min: 180 }],
  ['Tiny Run Club', { max: 30 }],
  ['A Very Small Run', { max: 30 }],
  ['Twenty Minutes of Character Development', { min: 18, max: 25 }],
]);

/**
 * Selects an athlete-facing name with three product rules:
 * 1) specific session identity beats generic easy/aerobic language;
 * 2) playful copy gets a meaningful preference over coaching-poster copy;
 * 3) names that imply a dose or effort are ineligible when the workout does not match it.
 */
export function selectHumanWorkoutName(context: WorkoutNamingContext): string {
  const recent = new Set((context.recentNames ?? []).map((value) => value.toLowerCase()));
  const dominant = dominantIntent(context);
  const eligible = [...PLAYFUL_WORKOUT_NAMES, ...WORKOUT_NAME_CATALOG]
    .filter((entry) => !SERIOUS_OR_STALE_NAMES.has(entry.name))
    .filter((entry) => entry.disciplines.includes(context.discipline))
    .filter((entry) => !entry.triathlonOnly || context.triathlon)
    .filter((entry) => !entry.minMinutes || (context.durationMinutes ?? 0) >= entry.minMinutes)
    .filter((entry) => !entry.maxMinutes || (context.durationMinutes ?? Number.POSITIVE_INFINITY) <= entry.maxMinutes)
    .filter((entry) => passesHardDurationGate(entry, context))
    .filter((entry) => passesIntensitySemantics(entry, context))
    .filter((entry) => !entry.environments?.length || !context.environment || entry.environments.includes(context.environment));

  const dominantPool = dominant
    ? eligible.filter((entry) => entry.intents?.includes(dominant))
    : [];
  const candidates = dominantPool.length >= 3 ? dominantPool : eligible;
  const freshCandidates = candidates.filter((entry) => !recent.has(entry.name.toLowerCase()));
  const selectionPool = freshCandidates.length ? freshCandidates : candidates;

  const scored = selectionPool
    .map((entry) => ({ entry, score: humanScore(entry, context, recent, dominant) }))
    .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name));

  if (!scored.length) return fallbackName(context.discipline);
  const bestScore = scored[0]!.score;
  const shortlist = scored.filter((candidate) => candidate.score >= bestScore - 2).slice(0, 16);
  return shortlist[stableIndex(context.seedKey, shortlist.length)]?.entry.name ?? scored[0]!.entry.name;
}

export function dominantWorkoutNameIntent(context: WorkoutNamingContext): WorkoutNameIntent | undefined {
  return dominantIntent(context);
}

function dominantIntent(context: WorkoutNamingContext): WorkoutNameIntent | undefined {
  const has = (intent: WorkoutNameIntent) => context.intents.includes(intent);

  if (has('return_to_run')) return 'return_to_run';
  if (has('brick')) return 'brick';
  if (has('recovery')) return 'recovery';
  if (context.triathlon && has('race_specific')) return 'race_specific';
  if (has('technique')) return 'technique';
  if (has('threshold')) return 'threshold';
  if (has('intervals') && context.intensity === 'hard') return 'intervals';
  if (has('fartlek')) return 'fartlek';
  if (has('progressive')) return 'progressive';

  const duration = context.durationMinutes ?? 0;
  if ((has('long') && duration >= minimumLongMinutes(context.discipline))
    || (context.discipline === 'bike' && duration >= 150)
    || (context.discipline === 'run' && duration >= 75)) return 'long';
  if (has('tempo')) return 'tempo';
  if (has('intervals')) return 'intervals';
  if (has('easy')) return 'easy';
  if (has('aerobic')) return 'aerobic';
  return context.intents[0];
}

function passesHardDurationGate(entry: WorkoutNameEntry, context: WorkoutNamingContext): boolean {
  const duration = context.durationMinutes ?? 0;
  const explicit = HARD_DURATION_GATES.get(entry.name);
  if (explicit?.min != null && duration < explicit.min) return false;
  if (explicit?.max != null && duration > explicit.max) return false;
  if (entry.intents?.includes('long') && duration < minimumLongMinutes(context.discipline)) return false;
  return true;
}

function passesIntensitySemantics(entry: WorkoutNameEntry, context: WorkoutNamingContext): boolean {
  const intents = entry.intents ?? [];
  if (context.intensity === 'hard') {
    if (entry.intensities?.length && !entry.intensities.includes('hard')) return false;
    if (intents.length && !intents.some((intent) => HARD_QUALITY_INTENTS.has(intent))) return false;
  }
  if (context.intensity === 'moderate' && intents.length && intents.every((intent) => intent === 'easy' || intent === 'recovery')) return false;
  return true;
}

function minimumLongMinutes(discipline: WorkoutNameDiscipline): number {
  if (discipline === 'bike') return 120;
  if (discipline === 'run') return 75;
  if (discipline === 'swim') return 50;
  return 0;
}

function humanScore(
  entry: WorkoutNameEntry,
  context: WorkoutNamingContext,
  recent: Set<string>,
  dominant?: WorkoutNameIntent,
): number {
  let score = 0;
  const matches = entry.intents?.filter((intent) => context.intents.includes(intent)).length ?? 0;
  score += matches * 5;
  if (dominant && entry.intents?.includes(dominant)) score += 7;
  if (PLAYFUL_NAMES.has(entry.name)) score += 5;
  if (entry.intensities?.includes(context.intensity ?? 'easy')) score += 2;
  if (entry.phases?.includes(context.phase ?? 'base')) score += 2;
  if (entry.triathlonOnly && context.triathlon) score += 3;
  if (recent.has(entry.name.toLowerCase())) score -= 20;
  return score;
}

function p(
  name: string,
  discipline: WorkoutNameDiscipline,
  intents: WorkoutNameIntent[],
  environments?: WorkoutNamingContext['environment'][],
): WorkoutNameEntry {
  return { name, disciplines: [discipline], intents, environments };
}

function tri(
  name: string,
  disciplines: WorkoutNameDiscipline[],
  intents: WorkoutNameIntent[],
): WorkoutNameEntry {
  return { name, disciplines, intents, triathlonOnly: true };
}

function fallbackName(discipline: WorkoutNameDiscipline): string {
  if (discipline === 'swim') return 'Chlorine & Delusion';
  if (discipline === 'bike') return 'Zone 2 & Vibes';
  if (discipline === 'run') return 'The Silly Little Run';
  return 'Pick Things Up, Put Them Down';
}

function stableIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, length);
}