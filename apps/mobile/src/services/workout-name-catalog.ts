export type WorkoutNameDiscipline = 'swim' | 'bike' | 'run' | 'strength';
export type WorkoutNameIntensity = 'easy' | 'moderate' | 'hard';
export type WorkoutNamePhase = 'offseason' | 'base' | 'build' | 'peak' | 'taper' | 'race_week' | 'rebuild';
export type WorkoutNameIntent =
  | 'recovery'
  | 'easy'
  | 'technique'
  | 'aerobic'
  | 'fartlek'
  | 'tempo'
  | 'threshold'
  | 'intervals'
  | 'long'
  | 'progressive'
  | 'brick'
  | 'race_specific'
  | 'return_to_run'
  | 'swim_support'
  | 'posterior_durability'
  | 'single_leg_durability'
  | 'maintenance'
  | 'general_strength';

export interface WorkoutNamingContext {
  discipline: WorkoutNameDiscipline;
  intents: WorkoutNameIntent[];
  intensity?: WorkoutNameIntensity;
  durationMinutes?: number;
  phase?: WorkoutNamePhase;
  triathlon?: boolean;
  weeksToRace?: number;
  raceName?: string;
  raceLocation?: string;
  environment?: 'pool' | 'open_water' | 'trainer' | 'outdoor' | 'track' | 'trail' | 'gym';
  seedKey: string;
  recentNames?: string[];
}

export interface WorkoutNameEntry {
  name: string;
  disciplines: WorkoutNameDiscipline[];
  intents?: WorkoutNameIntent[];
  intensities?: WorkoutNameIntensity[];
  phases?: WorkoutNamePhase[];
  minMinutes?: number;
  maxMinutes?: number;
  triathlonOnly?: boolean;
  environments?: WorkoutNamingContext['environment'][];
}

// Keep this catalog deliberately human-curated. Names are athlete-facing product copy,
// while physiology remains encoded in the planner/prescription layer.
export const SWIM_WORKOUT_NAMES: WorkoutNameEntry[] = [
  n('Black Line Therapy', 'swim', ['easy', 'aerobic']),
  n('Quiet Hands', 'swim', ['technique', 'easy']),
  n('Catch of the Day', 'swim', ['technique']),
  n('No Splash Zone', 'swim', ['technique', 'easy']),
  n('Long & Loose', 'swim', ['easy', 'aerobic']),
  n('Lane Rope Zen', 'swim', ['easy', 'recovery']),
  n('Form Before Fire', 'swim', ['technique']),
  n('Easy Chlorine', 'swim', ['recovery', 'easy']),
  n('Chlorine Miles', 'swim', ['aerobic', 'long']),
  n('The Long Black Line', 'swim', ['long', 'aerobic']),
  n('Hold Your Water', 'swim', ['aerobic']),
  n('Wall to Wall', 'swim', ['aerobic']),
  n('Endless Lanes', 'swim', ['long', 'aerobic']),
  n('Blue Collar Swim', 'swim', ['aerobic']),
  n('Cruise the Lane', 'swim', ['aerobic', 'easy']),
  n('Pace & Patience', 'swim', ['aerobic', 'long']),
  n('Deep Endurance', 'swim', ['long']),
  n('Fast 50s, Good Decisions', 'swim', ['intervals', 'threshold']),
  n('Paddles & Problems', 'swim', ['intervals', 'threshold']),
  n('Kick Start', 'swim', ['technique', 'intervals']),
  n('Descend & Deliver', 'swim', ['progressive', 'threshold']),
  n('Broken Water', 'swim', ['threshold', 'intervals']),
  n('Fast Hands', 'swim', ['threshold', 'intervals']),
  n('Send the 100s', 'swim', ['threshold', 'intervals']),
  n('Smooth Is Fast', 'swim', ['technique', 'threshold']),
  n('Red Flags, Green Light', 'swim', ['intervals', 'threshold']),
  n('Change of Pace', 'swim', ['fartlek']),
  n('Lane Line Fartlek', 'swim', ['fartlek']),
  n('No Wall Rest', 'swim', ['fartlek', 'aerobic']),
  n('Fast Down, Easy Back', 'swim', ['fartlek', 'intervals']),
  n('Negative Split Club', 'swim', ['progressive', 'aerobic']),
  n('Build Within', 'swim', ['progressive', 'aerobic']),
  n('Catch & Cruise', 'swim', ['technique', 'aerobic']),
  n('Drill, Swim, Repeat', 'swim', ['technique']),
  n('Flags to Flags', 'swim', ['intervals']),
  n('Easy Speed', 'swim', ['fartlek', 'aerobic']),
  n('Long Water', 'swim', ['long']),
  n('Blue Hour', 'swim', ['easy', 'aerobic']),
  n('Pool Miles', 'swim', ['long', 'aerobic']),
  n('Last One Fast', 'swim', ['progressive', 'intervals']),
  n('First Out of the Water', 'swim', ['threshold', 'race_specific']),
  n('Goggles On, Brain Off', 'swim', ['easy', 'recovery']),
  n('Buoyancy Business', 'swim', ['technique', 'aerobic']),
  n('Feet on the Toes', 'swim', ['race_specific', 'aerobic']),
];

export const BIKE_WORKOUT_NAMES: WorkoutNameEntry[] = [
  n('Coffee Ride', 'bike', ['easy', 'recovery'], undefined, undefined, 80),
  n('T-Shirt Ride', 'bike', ['easy', 'aerobic'], undefined, 55, 120),
  n('Pocket Full of Snacks', 'bike', ['long', 'aerobic'], undefined, 120),
  n('Small Ring Energy', 'bike', ['recovery', 'easy']),
  n('No Heroics', 'bike', ['easy', 'aerobic']),
  n('Just Turn the Pedals', 'bike', ['recovery', 'easy']),
  n('Watts Up', 'bike', ['threshold', 'intervals']),
  n('Big Gear Tuesday', 'bike', ['threshold', 'tempo']),
  n('Aero Bar Office Hours', 'bike', ['tempo', 'threshold', 'race_specific']),
  n('Trainer Dungeon', 'bike', ['threshold', 'intervals'], ['hard'], undefined, undefined, ['trainer']),
  n('Fan on High', 'bike', ['threshold', 'intervals'], ['hard'], undefined, undefined, ['trainer']),
  n('Two Bottles Minimum', 'bike', ['long'], undefined, 150),
  n('The Long Way Home', 'bike', ['long', 'aerobic'], undefined, 150),
  n('All-Day Legs', 'bike', ['long'], undefined, 180),
  n('Ride Bikes, Eat Snacks', 'bike', ['long', 'aerobic'], undefined, 150),
  n('Cadence Games', 'bike', ['fartlek', 'aerobic']),
  n('Threshold Tax', 'bike', ['threshold']),
  n('Free Speed', 'bike', ['tempo', 'race_specific']),
  n('One More Hill', 'bike', ['threshold', 'intervals']),
  n('Leg Flush', 'bike', ['recovery']),
  n('Big Ring Business', 'bike', ['tempo', 'threshold']),
  n('Headwind Homework', 'bike', ['tempo', 'threshold']),
  n('Chainring Therapy', 'bike', ['aerobic', 'easy']),
  n('Easy Money', 'bike', ['easy', 'aerobic']),
  n('Sunday Spin', 'bike', ['recovery', 'easy']),
  n('Rolling Office Hours', 'bike', ['aerobic', 'tempo']),
  n('Cadence Casino', 'bike', ['fartlek']),
  n('Tempo Sandwich', 'bike', ['tempo']),
  n('Over / Under the Radar', 'bike', ['threshold', 'intervals']),
  n('Hold the Watts', 'bike', ['threshold']),
  n('Steady State of Mind', 'bike', ['aerobic', 'tempo']),
  n('Cruise Control', 'bike', ['tempo', 'threshold']),
  n('Diesel Engine', 'bike', ['long', 'aerobic']),
  n('False Flat', 'bike', ['tempo', 'threshold']),
  n('Easy Does It', 'bike', ['easy']),
  n('Morning Roll', 'bike', ['easy', 'aerobic']),
  n('Long Haul', 'bike', ['long']),
  n('The Snack Loop', 'bike', ['long', 'aerobic']),
  n('Progressive Pressure', 'bike', ['progressive', 'tempo']),
  n('Strong Finish Spin', 'bike', ['progressive', 'aerobic']),
  n('Aero & Chill', 'bike', ['easy', 'race_specific']),
  n('Bottle, Gel, Repeat', 'bike', ['long', 'race_specific']),
  n('Watts Before Brunch', 'bike', ['threshold', 'tempo']),
  n('Spin First, Questions Later', 'bike', ['easy', 'aerobic']),
];

export const RUN_WORKOUT_NAMES: WorkoutNameEntry[] = [
  n('Easy Peasy Miles', 'run', ['easy']),
  n('Conversational Pace', 'run', ['easy', 'aerobic']),
  n('No Watch Watching', 'run', ['easy', 'recovery']),
  n('Shake the Legs Out', 'run', ['recovery', 'easy']),
  n('Cruise Miles', 'run', ['aerobic', 'easy']),
  n('Out & Back', 'run', ['aerobic', 'easy']),
  n('Long Run, Short Shorts', 'run', ['long']),
  n('Snack Miles', 'run', ['long', 'aerobic']),
  n('Time on Feet', 'run', ['long']),
  n('Fast-ish', 'run', ['fartlek', 'tempo']),
  n('Controlled Chaos', 'run', ['fartlek', 'intervals']),
  n('Track Snacks', 'run', ['intervals']),
  n('Finish With Something Left', 'run', ['aerobic', 'progressive']),
  n('See You at the Turnaround', 'run', ['long', 'aerobic']),
  n('Morning Miles', 'run', ['easy', 'aerobic']),
  n('Soft Launch', 'run', ['easy', 'recovery']),
  n('Negative Split Club', 'run', ['progressive', 'tempo']),
  n('Fast Finish', 'run', ['progressive', 'tempo']),
  n('Cruise Control', 'run', ['tempo']),
  n('Tempo Tuesday', 'run', ['tempo']),
  n('Threshold-ish', 'run', ['threshold', 'tempo']),
  n('Broken Repeats', 'run', ['intervals']),
  n('Fartlek Roulette', 'run', ['fartlek']),
  n('Change of Pace', 'run', ['fartlek']),
  n('Quick Feet, Quiet Brain', 'run', ['intervals', 'fartlek']),
  n('One More Rep', 'run', ['intervals']),
  n('The Steady One', 'run', ['aerobic']),
  n('Rolling Rhythm', 'run', ['aerobic', 'fartlek']),
  n('Easy Miles', 'run', ['easy']),
  n('Long Miles', 'run', ['long']),
  n('Halfway Home', 'run', ['long', 'aerobic']),
  n('Road to Nowhere', 'run', ['easy', 'aerobic']),
  n('Keep It Honest', 'run', ['tempo', 'threshold']),
  n('10K Business', 'run', ['threshold', 'intervals']),
  n('Track Tax', 'run', ['intervals']),
  n('The Quick Detour', 'run', ['fartlek', 'intervals']),
  n('Back on Your Feet', 'run', ['return_to_run', 'easy']),
  n('First Steps Back', 'run', ['return_to_run', 'easy']),
  n('One Run at a Time', 'run', ['return_to_run', 'easy']),
  n('Little Victories', 'run', ['return_to_run', 'easy']),
  n('Run / Walk Rebuild', 'run', ['return_to_run']),
  n('Finish Smooth', 'run', ['progressive', 'aerobic']),
  n('Miles Before Breakfast', 'run', ['easy', 'aerobic']),
  n('Just Some Miles', 'run', ['easy']),
];

export const STRENGTH_WORKOUT_NAMES: WorkoutNameEntry[] = [
  n('Lats & Lines', 'strength', ['swim_support']),
  n('Catch & Core', 'strength', ['swim_support']),
  n('Poolside Pull', 'strength', ['swim_support']),
  n('Lats for Laps', 'strength', ['swim_support']),
  n('Shoulders for Swimming', 'strength', ['swim_support']),
  n('Pull, Brace, Repeat', 'strength', ['swim_support']),
  n('Dryland Detour', 'strength', ['swim_support']),
  n('Strong Catch', 'strength', ['swim_support']),
  n('Backside Business', 'strength', ['posterior_durability']),
  n('Hinge & Hold', 'strength', ['posterior_durability']),
  n('Chain Reaction', 'strength', ['posterior_durability']),
  n('Keep the Bolts Tight', 'strength', ['posterior_durability', 'maintenance']),
  n('The Unsexy Stuff', 'strength', ['posterior_durability', 'maintenance']),
  n('Hips, Hams & Homework', 'strength', ['posterior_durability']),
  n('Back Pocket Strength', 'strength', ['posterior_durability']),
  n('Hinge Day Side Quest', 'strength', ['posterior_durability']),
  n('One Leg at a Time', 'strength', ['single_leg_durability']),
  n('Wobble Work', 'strength', ['single_leg_durability']),
  n("Runner's Insurance", 'strength', ['single_leg_durability']),
  n('Single-Leg Side Quest', 'strength', ['single_leg_durability']),
  n('Calves Have Entered the Chat', 'strength', ['single_leg_durability']),
  n('Stability Tax', 'strength', ['single_leg_durability']),
  n('One-Sided Business', 'strength', ['single_leg_durability']),
  n('Balance the Books', 'strength', ['single_leg_durability']),
  n('Hold the Line', 'strength', ['maintenance']),
  n('Strength Tune-Up', 'strength', ['maintenance']),
  n('Keep It Sharp', 'strength', ['maintenance']),
  n('Just Enough Strength', 'strength', ['maintenance']),
  n('Maintenance Mode', 'strength', ['maintenance']),
  n('Grease the Gears', 'strength', ['maintenance']),
  n('Keep the Chassis Happy', 'strength', ['maintenance']),
  n('Durability Deposit', 'strength', ['maintenance']),
  n('Engine Room', 'strength', ['general_strength']),
  n('Not Another Cardio Day', 'strength', ['general_strength']),
  n('Strong Enough to Tri', 'strength', ['general_strength']),
  n('Lift Now, Thank Yourself Later', 'strength', ['general_strength']),
  n('The Useful Stuff', 'strength', ['general_strength']),
  n('Gym Side Quest', 'strength', ['general_strength']),
  n('Strength Without Drama', 'strength', ['general_strength']),
  n('Whole-Body Maintenance', 'strength', ['general_strength', 'maintenance']),
  n('Move Heavy-ish Things', 'strength', ['general_strength']),
  n('Athlete Hardware', 'strength', ['general_strength']),
  n('Chassis Work', 'strength', ['general_strength']),
  n('Built for the Next Session', 'strength', ['general_strength']),
];

export const TRIATHLON_WORKOUT_NAMES: WorkoutNameEntry[] = [
  tri('Brick by Brick', ['bike', 'run'], ['brick', 'race_specific']),
  tri('T1 Legs', ['bike'], ['race_specific']),
  tri('T2 Preview', ['bike', 'run'], ['brick', 'race_specific']),
  tri('Aero Then Go', ['bike', 'run'], ['brick', 'race_specific']),
  tri('Third Discipline Energy', ['run'], ['race_specific']),
  tri('Wet Hair, Bike Helmet', ['swim', 'bike'], ['race_specific']),
  tri('Bike Legs → Run Legs', ['bike', 'run'], ['brick', 'race_specific']),
  tri('Find Your Running Legs', ['run'], ['brick', 'race_specific']),
  tri('Three-Sport Problems', ['swim', 'bike', 'run', 'strength'], ['race_specific']),
  tri('Long Course Business', ['bike', 'run', 'swim'], ['long', 'race_specific']),
  tri('The Fourth Discipline', ['bike', 'run'], ['long', 'race_specific']),
  tri('Zip, Clip & Go', ['bike', 'run'], ['brick', 'race_specific']),
  tri('Aero to Asphalt', ['bike', 'run'], ['brick', 'race_specific']),
  tri('Lane Lines to Bike Lines', ['swim', 'bike'], ['race_specific']),
  tri('Fresh Legs Are Overrated', ['bike', 'run'], ['brick', 'race_specific']),
  tri("One Sport Wasn't Enough", ['swim', 'bike', 'run', 'strength'], ['race_specific']),
  tri('Race Kit Rehearsal', ['bike', 'run'], ['race_specific']),
  tri('Transition Practice', ['bike', 'run'], ['brick', 'race_specific']),
  tri('Goggles to Gears', ['swim', 'bike'], ['race_specific']),
  tri('Aero & Asphalt', ['bike', 'run'], ['race_specific']),
  tri('Long Course Legs', ['bike', 'run'], ['long', 'race_specific']),
  tri('Fuel the Machine', ['bike', 'run'], ['long', 'race_specific']),
  tri('Race Pace, No Drama', ['swim', 'bike', 'run'], ['race_specific'], ['build', 'peak']),
  tri('Dress Rehearsal', ['swim', 'bike', 'run'], ['race_specific'], ['peak']),
  tri('Keep the Fuse Lit', ['swim', 'bike', 'run'], ['race_specific'], ['taper', 'race_week']),
  tri('Sharp, Not Tired', ['swim', 'bike', 'run'], ['race_specific'], ['taper', 'race_week']),
  tri('Just Enough', ['swim', 'bike', 'run', 'strength'], ['maintenance', 'race_specific'], ['taper', 'race_week']),
  tri('Race Legs Loading', ['bike', 'run'], ['race_specific'], ['build', 'peak']),
  tri('One More Long One', ['bike', 'run'], ['long', 'race_specific'], ['peak']),
  tri('Save It for Sunday', ['swim', 'bike', 'run'], ['easy', 'race_specific'], ['race_week']),
  tri('Swim. Bike. Side Quest.', ['swim', 'bike', 'run', 'strength'], ['race_specific']),
  tri('Long Course Side Quest', ['swim', 'bike', 'run', 'strength'], ['race_specific']),
];

export const WORKOUT_NAME_CATALOG: WorkoutNameEntry[] = [
  ...SWIM_WORKOUT_NAMES,
  ...BIKE_WORKOUT_NAMES,
  ...RUN_WORKOUT_NAMES,
  ...STRENGTH_WORKOUT_NAMES,
  ...TRIATHLON_WORKOUT_NAMES,
];

/**
 * Deterministically selects a human-facing name. Repeating the same workout
 * identity produces the same title. Future race-theme packs can be appended
 * through extraEntries without changing the planner or persistence model.
 */
export function selectWorkoutName(context: WorkoutNamingContext, extraEntries: WorkoutNameEntry[] = []): string {
  const recent = new Set((context.recentNames ?? []).map((value) => value.toLowerCase()));
  const candidates = [...WORKOUT_NAME_CATALOG, ...extraEntries]
    .filter((entry) => entry.disciplines.includes(context.discipline))
    .filter((entry) => !entry.triathlonOnly || context.triathlon)
    .filter((entry) => !entry.minMinutes || (context.durationMinutes ?? 0) >= entry.minMinutes)
    .filter((entry) => !entry.maxMinutes || (context.durationMinutes ?? Number.POSITIVE_INFINITY) <= entry.maxMinutes)
    .filter((entry) => !entry.environments?.length || !context.environment || entry.environments.includes(context.environment))
    .map((entry) => ({ entry, score: scoreEntry(entry, context, recent) }))
    .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name));

  if (!candidates.length) return fallbackName(context.discipline);
  const bestScore = candidates[0]!.score;
  const shortlist = candidates.filter((candidate) => candidate.score >= bestScore - 1).slice(0, 12);
  return shortlist[stableIndex(context.seedKey, shortlist.length)]?.entry.name ?? candidates[0]!.entry.name;
}

export function workoutNameCatalogCounts(): Record<WorkoutNameDiscipline | 'triathlon', number> {
  return {
    swim: SWIM_WORKOUT_NAMES.length,
    bike: BIKE_WORKOUT_NAMES.length,
    run: RUN_WORKOUT_NAMES.length,
    strength: STRENGTH_WORKOUT_NAMES.length,
    triathlon: TRIATHLON_WORKOUT_NAMES.length,
  };
}

function scoreEntry(entry: WorkoutNameEntry, context: WorkoutNamingContext, recent: Set<string>): number {
  let score = 0;
  const intentMatches = entry.intents?.filter((intent) => context.intents.includes(intent)).length ?? 0;
  score += intentMatches * 5;
  if (!entry.intents?.length) score += 1;
  if (entry.intensities?.includes(context.intensity ?? 'easy')) score += 3;
  if (entry.phases?.includes(context.phase ?? 'base')) score += 2;
  if (entry.triathlonOnly && context.triathlon) score += context.weeksToRace != null && context.weeksToRace <= 6 ? 3 : 1;
  if (recent.has(entry.name.toLowerCase())) score -= 8;
  return score;
}

function n(
  name: string,
  discipline: WorkoutNameDiscipline,
  intents?: WorkoutNameIntent[],
  intensities?: WorkoutNameIntensity[],
  minMinutes?: number,
  maxMinutes?: number,
  environments?: WorkoutNamingContext['environment'][],
): WorkoutNameEntry {
  return { name, disciplines: [discipline], intents, intensities, minMinutes, maxMinutes, environments };
}

function tri(
  name: string,
  disciplines: WorkoutNameDiscipline[],
  intents?: WorkoutNameIntent[],
  phases?: WorkoutNamePhase[],
): WorkoutNameEntry {
  return { name, disciplines, intents, phases, triathlonOnly: true };
}

function fallbackName(discipline: WorkoutNameDiscipline): string {
  if (discipline === 'swim') return 'Pool Miles';
  if (discipline === 'bike') return 'Coffee Ride';
  if (discipline === 'run') return 'Easy Miles';
  return 'Gym Side Quest';
}

function stableIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, length);
}
