import {
  WORKOUT_NAME_CATALOG,
  type WorkoutNameDiscipline,
  type WorkoutNameEntry,
  type WorkoutNameIntent,
  type WorkoutNamingContext,
} from './workout-name-catalog';
import {
  effectiveWorkoutNamePhase,
  isHolidayNamingWindow,
  workoutNameSeason,
  type WorkoutNameSeason,
} from './workout-name-context';

export interface HumanWorkoutNamingContext extends WorkoutNamingContext {
  workoutDate?: string;
}

type PersonalityWorkoutNameEntry = WorkoutNameEntry & {
  seasons?: WorkoutNameSeason[];
  holidayOnly?: boolean;
  raceWeekOnly?: boolean;
  phaseOnly?: boolean;
  raceKeywords?: string[];
};

const BASE_PLAYFUL_WORKOUT_NAMES: PersonalityWorkoutNameEntry[] = [
  p('Chlorine & Delusion', 'swim', ['easy', 'aerobic']),
  p('Goggles Before Feelings', 'swim', ['easy', 'recovery']),
  p('Counting Tiles Again', 'swim', ['long', 'aerobic']),
  p('Lane 4 Existential Crisis', 'swim', ['aerobic']),
  p('Flip Turns & Questionable Decisions', 'swim', ['technique']),
  p('Why Is the Pool So Cold?', 'swim', ['easy', 'recovery']),
  p('Black Line Fan Club', 'swim', ['long', 'aerobic']),
  p('Main Set? Never Heard of Her', 'swim', ['threshold', 'intervals']),
  p('Just One More 100', 'swim', ['threshold', 'intervals']),
  p('Splash Now, Think Later', 'swim', ['fartlek', 'aerobic']),
  p('Wet Hair, Clear Brain', 'swim', ['easy', 'aerobic']),
  p('Pool Goblin Hours', 'swim', ['aerobic']),

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
  tri('Aero Bars, Zero Thoughts', ['bike'], ['race_specific', 'tempo']),
  p('Cadence Goblin', 'bike', ['fartlek']),
  p('Watts Before Snacks', 'bike', ['threshold', 'intervals']),
  p('Indoor Bike Jail', 'bike', ['threshold', 'intervals'], { environments: ['trainer'] }),

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
  tri('Transition Bag Tetris', ['swim', 'bike', 'run'], ['race_specific'], { phases: ['taper', 'race_week'] }),
  tri('Three Sports, Zero Free Time', ['swim', 'bike', 'run'], ['race_specific']),
  tri('Gels Are a Food Group', ['bike', 'run'], ['long', 'race_specific']),
  tri('Helmet First, Dignity Later', ['bike', 'run'], ['brick', 'race_specific']),
  tri('Bike Legs Are Fake News', ['run'], ['brick', 'race_specific']),
  tri('Run Legs Pending', ['run'], ['brick', 'race_specific']),
  tri('Aero Is a Personality Trait', ['bike'], ['race_specific']),
  tri('Wetsuit Wrestling', ['swim'], ['race_specific']),
  tri('Where Did I Park My Bike?', ['bike', 'run'], ['race_specific']),
  tri('Transition Brain', ['swim', 'bike', 'run'], ['race_specific'], { phases: ['taper', 'race_week'] }),
];

const SEASONAL_WORKOUT_NAMES: PersonalityWorkoutNameEntry[] = [
  seasonal('Pool Deck Season', 'swim', ['easy', 'aerobic'], ['summer']),
  seasonal("Sun's Out, Goggles On", 'swim', ['easy', 'aerobic'], ['summer']),
  seasonal('Open Water Office Hours', 'swim', ['aerobic'], ['summer'], { environments: ['open_water'] }),
  seasonal('Tan Lines & Tailwinds', 'bike', ['easy', 'aerobic'], ['summer']),
  seasonal('Sunscreen Is Aero', 'bike', ['easy', 'aerobic'], ['summer']),
  seasonal('Hot Roads, Cold Bottles', 'bike', ['long', 'aerobic'], ['summer']),
  seasonal('Bibs Before Breakfast', 'bike', ['easy', 'aerobic'], ['summer']),
  seasonal('Shade Is a Training Metric', 'run', ['easy', 'aerobic'], ['summer']),
  seasonal('Early Before It Melts', 'run', ['easy', 'aerobic'], ['summer']),
  seasonal('AC Appreciation Society', 'strength', ['maintenance', 'general_strength'], ['summer']),

  seasonal('Back to the Black Line', 'swim', ['easy', 'aerobic'], ['fall']),
  seasonal('Summer Is Over, Pool Is Forever', 'swim', ['easy', 'aerobic'], ['fall']),
  seasonal('Leaf Peeping Peloton', 'bike', ['easy', 'aerobic'], ['fall']),
  seasonal('Arm Warmer Roulette', 'bike', ['easy', 'aerobic'], ['fall']),
  seasonal('Crunchy Leaves, Quiet Roads', 'bike', ['long', 'aerobic'], ['fall']),
  seasonal('Pumpkin Spice Paceline', 'bike', ['fartlek', 'aerobic'], ['fall']),
  seasonal('Long Sleeves, Short Shorts', 'run', ['easy', 'aerobic'], ['fall']),
  seasonal('Crisp Air Club', 'run', ['easy', 'aerobic'], ['fall']),
  seasonal('Leaf Pile Line Choice', 'run', ['fartlek', 'aerobic'], ['fall']),
  seasonal('Hinge Season', 'strength', ['posterior_durability', 'general_strength'], ['fall']),

  seasonal('Chlorine > Darkness', 'swim', ['easy', 'aerobic'], ['winter']),
  seasonal('Steam Room Motivation', 'swim', ['easy', 'recovery'], ['winter']),
  seasonal('Basement World Champs', 'bike', ['threshold', 'intervals'], ['winter'], { environments: ['trainer'] }),
  seasonal('Garage Grand Tour', 'bike', ['aerobic', 'long'], ['winter'], { environments: ['trainer'] }),
  seasonal('Fan on High', 'bike', ['fartlek', 'tempo'], ['winter'], { environments: ['trainer'] }),
  seasonal('Cold Toes, Good Decisions', 'bike', ['easy', 'aerobic'], ['winter'], { environments: ['outdoor'] }),
  seasonal('Cold Nose Club', 'run', ['easy', 'aerobic'], ['winter']),
  seasonal('Why Is Air Spicy?', 'run', ['easy', 'aerobic'], ['winter']),
  seasonal('Hat Hair Miles', 'run', ['easy', 'aerobic'], ['winter']),
  seasonal('Hibernate, But Make It Strength', 'strength', ['maintenance', 'general_strength'], ['winter']),

  seasonal('First Shorts Day', 'bike', ['easy', 'aerobic'], ['spring']),
  seasonal('Pollen & Pedals', 'bike', ['easy', 'aerobic'], ['spring']),
  seasonal("Sun's Back, Bikes Out", 'bike', ['long', 'aerobic'], ['spring']),
  seasonal('Pollen Threshold', 'run', ['threshold', 'intervals'], ['spring']),
  seasonal('Shorts Weather Audition', 'run', ['easy', 'aerobic'], ['spring']),
  seasonal('Lane Lines Before Daylight', 'swim', ['easy', 'aerobic'], ['spring']),
  seasonal('Spring Cleaning, But Heavy', 'strength', ['general_strength'], ['spring']),

  holiday('Deck the Lanes', 'swim', ['easy', 'aerobic']),
  holiday('Mistletoe Main Set', 'swim', ['intervals', 'aerobic']),
  holiday('Holiday Chlorine', 'swim', ['easy', 'aerobic']),
  holiday('Silent Night, Loud Trainer', 'bike', ['aerobic', 'tempo'], { environments: ['trainer'] }),
  holiday('Reindeer Aerodynamics', 'bike', ['easy', 'aerobic']),
  holiday('Holiday Spin Cycle', 'bike', ['easy', 'aerobic']),
  holiday('Tinsel & Tailwinds', 'bike', ['long', 'aerobic']),
  holiday('Jingle Jog, Unfortunately', 'run', ['easy', 'aerobic']),
  holiday('Silent Night, Loud Shoes', 'run', ['easy', 'aerobic']),
  holiday('Hinge All the Way', 'strength', ['posterior_durability', 'general_strength']),
  holiday('Sleigh Bells & Dumbbells', 'strength', ['general_strength', 'maintenance']),
];

const PHASE_WORKOUT_NAMES: PersonalityWorkoutNameEntry[] = [
  phaseName('Fitness, But Casual', ['swim', 'bike', 'run'], ['easy', 'aerobic'], ['offseason']),
  phaseName('No One Is Peaking Today', ['bike', 'run'], ['easy', 'aerobic'], ['offseason']),
  phaseName('Drills & Daydreams', ['swim'], ['technique'], ['offseason']),
  phaseName('Coffee Shop Recon', ['bike'], ['easy', 'aerobic'], ['offseason']),
  phaseName('No Splits, No Problems', ['run'], ['easy', 'aerobic'], ['offseason']),
  phaseName('Gym Era', ['strength'], ['general_strength', 'maintenance'], ['offseason']),
  phaseName('This Is the Part With Work', ['swim', 'bike', 'run'], ['threshold', 'intervals'], ['build', 'peak']),
  phaseName('Slightly More Serious', ['swim', 'bike', 'run'], ['tempo', 'threshold', 'intervals'], ['build', 'peak']),
  phaseName('Do Less, Freak Out More', ['swim', 'bike', 'run'], ['easy', 'aerobic'], ['taper']),
  phaseName('Taper Tantrum', ['swim', 'bike', 'run'], ['easy', 'aerobic'], ['taper']),
  phaseName('Why Do My Legs Feel Weird?', ['bike', 'run'], ['easy', 'aerobic'], ['taper']),
  phaseName('Stop Adding Fitness', ['swim', 'bike', 'run'], ['easy', 'aerobic'], ['taper']),
];

const RACE_WEEK_WORKOUT_NAMES: PersonalityWorkoutNameEntry[] = [
  raceWeek('Do Not Invent New Fitness', ['swim', 'bike', 'run'], ['easy', 'aerobic', 'recovery']),
  raceWeek('Taper Brain', ['swim', 'bike', 'run'], ['easy', 'aerobic']),
  raceWeek('Fresh Legs, Weird Feelings', ['bike', 'run'], ['easy', 'aerobic']),
  raceWeek('Nothing New, Seriously', ['swim', 'bike', 'run'], ['easy', 'aerobic']),
  raceWeek('Packet Pickup Brain', ['swim', 'bike', 'run'], ['easy', 'aerobic']),
  raceWeek('Where Did I Put My Goggles?', ['swim'], ['easy', 'technique']),
  raceWeek('Just Enough Chlorine', ['swim'], ['easy', 'aerobic']),
  raceWeek('Bottle Placement Rehearsal', ['bike'], ['easy', 'aerobic']),
  raceWeek('Aero Bars, No Heroics', ['bike'], ['easy', 'aerobic']),
  raceWeek('Race Shoes, Briefly', ['run'], ['easy', 'aerobic']),
  raceWeek('Tiny Legs Reminder', ['run'], ['easy', 'aerobic']),
  raceWeek('Touch Weights, Leave', ['strength'], ['maintenance', 'general_strength']),
  raceWeek('Just Enough Gym', ['strength'], ['maintenance', 'general_strength']),
  tri('Timing Chip Whereabouts', ['swim', 'bike', 'run'], ['race_specific'], { phases: ['race_week'], raceWeekOnly: true }),
  tri('Race Kit, Real Problems', ['swim', 'bike', 'run'], ['race_specific'], { phases: ['race_week'], raceWeekOnly: true }),
];

const RACE_THEME_WORKOUT_NAMES: PersonalityWorkoutNameEntry[] = [
  raceTheme('Pacific Pull', 'swim', ['easy', 'aerobic'], ['oceanside', 'san diego', 'southern california']),
  raceTheme('Pier Pressure', 'swim', ['threshold', 'intervals'], ['oceanside', 'san diego']),
  raceTheme('Marine Layer Main Set', 'swim', ['aerobic', 'intervals'], ['oceanside', 'san diego']),
  raceTheme('Coast Highway Office Hours', 'bike', ['tempo', 'aerobic'], ['oceanside', 'san diego']),
  raceTheme('SoCal Aero Club', 'bike', ['race_specific', 'tempo'], ['oceanside', 'san diego'], { triathlonOnly: true }),
  raceTheme('Pacific Coast Problems', 'bike', ['long', 'aerobic'], ['oceanside', 'san diego']),
  raceTheme('Boardwalk Legs', 'run', ['easy', 'aerobic'], ['oceanside', 'san diego']),
  raceTheme('Marine Layer Miles', 'run', ['easy', 'aerobic'], ['oceanside', 'san diego']),
  raceTheme('Azure Water', 'swim', ['easy', 'aerobic'], ['nice', "côte d'azur", 'cote d azur', 'riviera']),
  raceTheme('Mediterranean Main Set', 'swim', ['intervals', 'aerobic'], ['nice', 'mediterranean', 'riviera']),
  raceTheme('Riviera Laps', 'swim', ['easy', 'aerobic'], ['nice', 'riviera']),
  raceTheme('Corniche Cruise', 'bike', ['long', 'aerobic'], ['nice', 'riviera', 'côte d’azur', 'cote d azur']),
  raceTheme('Bonjour, Quads', 'bike', ['threshold', 'intervals'], ['nice', 'france', 'riviera']),
  raceTheme('Riviera Roll', 'bike', ['easy', 'aerobic'], ['nice', 'riviera']),
  raceTheme('Promenade Legs', 'run', ['easy', 'aerobic'], ['nice', 'promenade', 'riviera']),
  raceTheme("Côte d'Azur Shuffle", 'run', ['easy', 'aerobic'], ['nice', "côte d'azur", 'cote d azur', 'riviera']),
];

export const PLAYFUL_WORKOUT_NAMES: PersonalityWorkoutNameEntry[] = [
  ...BASE_PLAYFUL_WORKOUT_NAMES,
  ...SEASONAL_WORKOUT_NAMES,
  ...PHASE_WORKOUT_NAMES,
  ...RACE_WEEK_WORKOUT_NAMES,
  ...RACE_THEME_WORKOUT_NAMES,
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
const STRUCTURE_LOCKED_INTENTS = new Set<WorkoutNameIntent>(['return_to_run', 'brick', 'technique', 'fartlek', 'progressive', 'threshold']);
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

export function selectHumanWorkoutName(context: HumanWorkoutNamingContext): string {
  const recent = new Set((context.recentNames ?? []).map((value) => value.toLowerCase()));
  const dominant = dominantIntent(context);
  const season = context.workoutDate ? workoutNameSeason(context.workoutDate) : undefined;
  const holiday = context.workoutDate ? isHolidayNamingWindow(context.workoutDate) : false;
  const effectivePhase = effectiveWorkoutNamePhase(context.phase, context.weeksToRace);
  const raceText = `${context.raceName ?? ''} ${context.raceLocation ?? ''}`.toLowerCase();
  const catalog = WORKOUT_NAME_CATALOG as PersonalityWorkoutNameEntry[];

  const eligible = [...PLAYFUL_WORKOUT_NAMES, ...catalog]
    .filter((entry) => !SERIOUS_OR_STALE_NAMES.has(entry.name))
    .filter((entry) => entry.disciplines.includes(context.discipline))
    .filter((entry) => !entry.triathlonOnly || context.triathlon)
    .filter((entry) => !entry.minMinutes || (context.durationMinutes ?? 0) >= entry.minMinutes)
    .filter((entry) => !entry.maxMinutes || (context.durationMinutes ?? Number.POSITIVE_INFINITY) <= entry.maxMinutes)
    .filter((entry) => passesHardDurationGate(entry, context))
    .filter((entry) => passesIntensitySemantics(entry, context))
    .filter((entry) => passesStructureSemantics(entry, context))
    .filter((entry) => passesRaceSemantics(entry, context))
    .filter((entry) => !entry.environments?.length || !context.environment || entry.environments.includes(context.environment))
    .filter((entry) => !entry.seasons?.length || Boolean(season && entry.seasons.includes(season)))
    .filter((entry) => !entry.holidayOnly || holiday)
    .filter((entry) => !entry.phaseOnly || Boolean(effectivePhase && entry.phases?.includes(effectivePhase)))
    .filter((entry) => !entry.raceWeekOnly || effectivePhase === 'race_week')
    .filter((entry) => !entry.raceKeywords?.length || entry.raceKeywords.some((keyword) => raceText.includes(keyword)));

  const dominantPool = dominant ? eligible.filter((entry) => entry.intents?.includes(dominant)) : [];
  const candidates = dominantPool.length >= 3 ? dominantPool : eligible;
  const freshCandidates = candidates.filter((entry) => !recent.has(entry.name.toLowerCase()));
  const selectionPool = freshCandidates.length ? freshCandidates : candidates;
  const scored = selectionPool
    .map((entry) => ({ entry, score: humanScore(entry, context, recent, dominant, season, holiday, effectivePhase, raceText) }))
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

function passesStructureSemantics(entry: WorkoutNameEntry, context: WorkoutNamingContext): boolean {
  const locked = (entry.intents ?? []).filter((intent) => STRUCTURE_LOCKED_INTENTS.has(intent));
  return locked.every((intent) => context.intents.includes(intent));
}

function passesRaceSemantics(entry: WorkoutNameEntry, context: WorkoutNamingContext): boolean {
  if (!entry.intents?.includes('race_specific')) return true;
  return Boolean(context.triathlon || context.weeksToRace != null || context.raceName || context.raceLocation);
}

function minimumLongMinutes(discipline: WorkoutNameDiscipline): number {
  if (discipline === 'bike') return 120;
  if (discipline === 'run') return 75;
  if (discipline === 'swim') return 60;
  return 0;
}

function humanScore(
  entry: PersonalityWorkoutNameEntry,
  context: HumanWorkoutNamingContext,
  recent: Set<string>,
  dominant: WorkoutNameIntent | undefined,
  season: WorkoutNameSeason | undefined,
  holiday: boolean,
  effectivePhase: ReturnType<typeof effectiveWorkoutNamePhase>,
  raceText: string,
): number {
  let score = 0;
  const matches = entry.intents?.filter((intent) => context.intents.includes(intent)).length ?? 0;
  score += matches * 5;
  if (dominant && entry.intents?.includes(dominant)) score += 7;
  if (PLAYFUL_NAMES.has(entry.name)) score += 5;
  if (entry.intensities?.includes(context.intensity ?? 'easy')) score += 2;
  if (entry.phases?.includes(effectivePhase ?? context.phase ?? 'base')) score += 6;
  if (entry.seasons?.includes(season ?? 'summer')) score += 4;
  if (entry.holidayOnly && holiday) score += 8;
  if (entry.raceWeekOnly && effectivePhase === 'race_week') score += 10;
  if (entry.raceKeywords?.some((keyword) => raceText.includes(keyword))) score += 12;
  if (entry.triathlonOnly && context.triathlon) score += 3;
  if (recent.has(entry.name.toLowerCase())) score -= 20;
  return score;
}

function p(
  name: string,
  discipline: WorkoutNameDiscipline,
  intents: WorkoutNameIntent[],
  options: Omit<PersonalityWorkoutNameEntry, 'name' | 'disciplines' | 'intents'> = {},
): PersonalityWorkoutNameEntry {
  return { name, disciplines: [discipline], intents, ...options };
}
function tri(
  name: string,
  disciplines: WorkoutNameDiscipline[],
  intents: WorkoutNameIntent[],
  options: Omit<PersonalityWorkoutNameEntry, 'name' | 'disciplines' | 'intents' | 'triathlonOnly'> = {},
): PersonalityWorkoutNameEntry {
  return { name, disciplines, intents, triathlonOnly: true, ...options };
}
function seasonal(
  name: string,
  discipline: WorkoutNameDiscipline,
  intents: WorkoutNameIntent[],
  seasons: WorkoutNameSeason[],
  options: Omit<PersonalityWorkoutNameEntry, 'name' | 'disciplines' | 'intents' | 'seasons'> = {},
): PersonalityWorkoutNameEntry {
  return { name, disciplines: [discipline], intents, seasons, ...options };
}
function holiday(
  name: string,
  discipline: WorkoutNameDiscipline,
  intents: WorkoutNameIntent[],
  options: Omit<PersonalityWorkoutNameEntry, 'name' | 'disciplines' | 'intents' | 'holidayOnly'> = {},
): PersonalityWorkoutNameEntry {
  return { name, disciplines: [discipline], intents, holidayOnly: true, ...options };
}
function phaseName(
  name: string,
  disciplines: WorkoutNameDiscipline[],
  intents: WorkoutNameIntent[],
  phases: NonNullable<WorkoutNameEntry['phases']>,
): PersonalityWorkoutNameEntry {
  return { name, disciplines, intents, phases, phaseOnly: true };
}
function raceWeek(
  name: string,
  disciplines: WorkoutNameDiscipline[],
  intents: WorkoutNameIntent[],
): PersonalityWorkoutNameEntry {
  return { name, disciplines, intents, phases: ['race_week'], raceWeekOnly: true, phaseOnly: true };
}
function raceTheme(
  name: string,
  discipline: WorkoutNameDiscipline,
  intents: WorkoutNameIntent[],
  raceKeywords: string[],
  options: Omit<PersonalityWorkoutNameEntry, 'name' | 'disciplines' | 'intents' | 'raceKeywords'> = {},
): PersonalityWorkoutNameEntry {
  return { name, disciplines: [discipline], intents, raceKeywords, ...options };
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
