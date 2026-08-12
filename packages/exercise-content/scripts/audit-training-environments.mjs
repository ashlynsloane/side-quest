import { readFile } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);
const exercises = JSON.parse(await readFile(new URL('./data/exercises.json', ROOT), 'utf8'));
const equipment = JSON.parse(await readFile(new URL('./data/equipment.json', ROOT), 'utf8'));

const DEFAULT_HOME = [
  'bodyweight',
  'dumbbell',
  'kettlebell',
  'bench',
  'bosu',
  'slider',
  'medicine_ball',
  'mini_band',
  'stability_ball',
];

const GYM_SIGNAL = new Set([
  'barbell',
  'weight_plate',
  'trap_bar',
  'cable_machine',
  'leg_press',
  'pullup_bar',
]);

const HOME_SPECIALTY = new Set([
  'bosu',
  'slider',
  'stability_ball',
  'mini_band',
  'medicine_ball',
]);

function parseCsvArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  return raw ? raw.split(',').map((item) => item.trim()).filter(Boolean) : fallback;
}

const homeIds = parseCsvArg('home', DEFAULT_HOME);
const home = new Set(homeIds);
const knownIds = new Set(equipment.map((item) => item.id));
for (const id of home) {
  if (!knownIds.has(id)) throw new Error(`Unknown home equipment id: ${id}`);
}

function requiredIds(option) {
  return option.items
    .filter((item) => !item.optional && item.equipmentId !== 'bodyweight')
    .map((item) => item.equipmentId);
}

function optionFits(option, available) {
  return option.items.every((item) => item.optional || item.equipmentId === 'bodyweight' || available.has(item.equipmentId));
}

function hasGymOption(exercise) {
  return exercise.equipmentOptions.some((option) => requiredIds(option).some((id) => GYM_SIGNAL.has(id)));
}

function hasHomeSpecialtyOption(exercise) {
  return exercise.equipmentOptions.some((option) => requiredIds(option).some((id) => HOME_SPECIALTY.has(id)));
}

function classify(exercise) {
  const homeCapable = exercise.equipmentOptions.some((option) => optionFits(option, home));
  const gymOption = hasGymOption(exercise);

  if (!homeCapable) return gymOption ? 'gym_dependent' : 'not_available_at_home';
  if (gymOption) return 'gym_advantaged';
  if (hasHomeSpecialtyOption(exercise)) return 'home_specialty';
  return 'home_equivalent';
}

const active = exercises.filter((exercise) => exercise.status === 'active' && exercise.defaultEnabled);
const groups = new Map();
for (const exercise of active) {
  const bucket = classify(exercise);
  const list = groups.get(bucket) ?? [];
  list.push(exercise);
  groups.set(bucket, list);
}

const ORDER = ['home_specialty', 'home_equivalent', 'gym_advantaged', 'gym_dependent', 'not_available_at_home'];

console.log('\nSIDE QUEST TRAINING ENVIRONMENT AUDIT');
console.log('====================================');
console.log(`Active/default exercises: ${active.length}`);
console.log(`Home equipment: ${homeIds.join(', ')}`);
console.log('\nClassification counts:');
for (const bucket of ORDER) console.log(`  ${bucket}: ${(groups.get(bucket) ?? []).length}`);

for (const bucket of ORDER) {
  const list = (groups.get(bucket) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  console.log(`\n${bucket.toUpperCase()} (${list.length})`);
  console.log('-'.repeat(Math.min(80, bucket.length + 8)));
  for (const exercise of list) {
    const options = exercise.equipmentOptions
      .map((option) => `${option.label}: ${requiredIds(option).join('+') || 'bodyweight'}`)
      .join(' | ');
    console.log(`- ${exercise.name} [${exercise.id}] — ${options}`);
  }
}

const equipmentUse = new Map();
for (const exercise of active) {
  for (const option of exercise.equipmentOptions) {
    for (const id of new Set(requiredIds(option))) {
      equipmentUse.set(id, (equipmentUse.get(id) ?? 0) + 1);
    }
  }
}

console.log('\nEQUIPMENT OPTION COVERAGE');
console.log('-------------------------');
for (const item of equipment) {
  console.log(`- ${item.label} (${item.id}): ${equipmentUse.get(item.id) ?? 0} exercise option(s)`);
}

console.log('\nNOTE');
console.log('This audit measures equipment opportunity only. It does not yet infer whether a');
console.log('dumbbell/kettlebell movement needs more load than the athlete owns at home. That');
console.log('requires structured load-capability metadata and is the next modeling step.');
