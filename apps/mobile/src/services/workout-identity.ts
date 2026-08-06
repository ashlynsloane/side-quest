import type { GeneratedWorkout } from '@circuit/domain';

const FIRST = ['Hotel Staircase','Dumbbell Diplomacy','Bench and Bells','The Forty-Minute Detour','No Barbell, No Problem','Posterior Chain Side Quest','Strength Safari','The Equipment Shuffle','Full-Body Field Trip','Circuit Breaker','The Useful Chaos','Sweat Equity','The Long Way Around','Controlled Mayhem','The Side Quest Special'];
const SECOND = ['Heist','Protocol','Expedition','Contingency','Shuffle','Detour','Diplomacy','Field Test','Mission','Circuit','Side Quest','Plan B','Adventure','Rebellion','Rendezvous'];

export function generateWorkoutNameCandidates(workout: GeneratedWorkout, count = 4): string[] {
  const seed = hash(workout.randomSeed || workout.id);
  const equipment = equipmentPhrase(workout);
  const focus = focusPhrase(workout);
  const structural = structurePhrase(workout);
  const candidates = [
    equipment,
    focus,
    structural,
    `${FIRST[seed % FIRST.length]} ${SECOND[(seed >>> 4) % SECOND.length]}`,
    `${workout.request.workMinutes}-Minute ${SECOND[(seed >>> 8) % SECOND.length]}`,
  ].filter(Boolean) as string[];
  return [...new Set(candidates)].slice(0, count);
}

export function applyCreativeWorkoutName(workout: GeneratedWorkout): GeneratedWorkout {
  if (!isGenericWorkoutName(workout.name)) return workout;
  return { ...workout, name: generateWorkoutNameCandidates(workout, 1)[0] ?? workout.name };
}

export function isGenericWorkoutName(value: string): boolean {
  return /minute .*strength|full[- ]body strength|generated workout|side quest workout|strength-cardio/i.test(value);
}

function equipmentPhrase(workout: GeneratedWorkout): string {
  const equipment = workout.requiredEquipment.filter((item) => item !== 'bodyweight');
  if (!equipment.length) return 'Bodyweight Plot Twist';
  if (equipment.length === 1 && equipment[0] === 'dumbbell') return 'Dumbbell Diplomacy';
  if (equipment.includes('bench') && equipment.includes('dumbbell')) return 'Bench, Bells and Bad Decisions';
  if (equipment.includes('kettlebell')) return 'Kettlebell Side Quest';
  if (equipment.includes('barbell')) return 'Barbell Business';
  if (workout.request.minimizeEquipmentChanges) return 'One-Corner Gym Mission';
  return 'The Equipment Shuffle';
}
function focusPhrase(workout: GeneratedWorkout): string {
  const regions = workout.targetRegions;
  if (regions.includes('glutes') || regions.includes('hamstrings')) return 'Posterior Chain Side Quest';
  if (regions.includes('upper_back') || regions.includes('lats')) return 'Pulling Strings';
  if (regions.includes('core_anterior') || regions.includes('core_rotation')) return 'Core Curriculum';
  if (regions.includes('quadriceps')) return 'Quad Council';
  return 'Full-Body Field Trip';
}
function structurePhrase(workout: GeneratedWorkout): string {
  const stationMinutes = workout.stations.map((station) => Math.round(station.durationSeconds / 60));
  if (stationMinutes.every((minutes) => minutes === 12)) return 'Twelve-Minute Trouble';
  if (workout.request.workMinutes <= 24) return 'The Quick Detour';
  if (workout.request.workMinutes >= 48) return 'The Long Way Around';
  return 'Controlled Mayhem';
}
function hash(value: string): number { let result=2166136261; for(let index=0; index<value.length; index+=1){ result ^= value.charCodeAt(index); result = Math.imul(result,16777619); } return result>>>0; }
