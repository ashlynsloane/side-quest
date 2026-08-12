import { readFile } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);
const [base, expansion, equipment] = await Promise.all([
  readJson('./data/exercises.json'),
  readJson('./data/environment-exercises.json'),
  readJson('./data/equipment.json'),
]);

const equipmentIds = new Set(equipment.map((item) => item.id));
const baseIds = new Set(base.map((item) => item.id));
const baseSlugs = new Set(base.map((item) => item.slug));
const seenIds = new Set();
const seenSlugs = new Set();
const errors = [];

for (const exercise of expansion) {
  if (!exercise.id || !exercise.slug || !exercise.name) errors.push('Every environment exercise needs id, slug, and name.');
  if (baseIds.has(exercise.id)) errors.push(`Duplicate base exercise id: ${exercise.id}`);
  if (baseSlugs.has(exercise.slug)) errors.push(`Duplicate base exercise slug: ${exercise.slug}`);
  if (seenIds.has(exercise.id)) errors.push(`Duplicate expansion exercise id: ${exercise.id}`);
  if (seenSlugs.has(exercise.slug)) errors.push(`Duplicate expansion exercise slug: ${exercise.slug}`);
  seenIds.add(exercise.id);
  seenSlugs.add(exercise.slug);

  if (!exercise.bodyRegions?.some((item) => item.role === 'primary')) errors.push(`${exercise.id}: missing primary body region.`);
  if (!exercise.movementPatterns?.length) errors.push(`${exercise.id}: missing movement pattern.`);
  if (!exercise.stationRoles?.length) errors.push(`${exercise.id}: missing station role.`);
  if (!exercise.equipmentOptions?.length) errors.push(`${exercise.id}: missing equipment option.`);
  if (!exercise.prescriptions?.length) errors.push(`${exercise.id}: missing prescription.`);
  if (!exercise.instructions?.setup?.length || !exercise.instructions?.execution?.length) errors.push(`${exercise.id}: incomplete instructions.`);

  for (const option of exercise.equipmentOptions ?? []) {
    for (const item of option.items ?? []) {
      if (!equipmentIds.has(item.equipmentId)) errors.push(`${exercise.id}: unknown equipment ${item.equipmentId}.`);
    }
  }
}

if (errors.length) {
  console.error(`Environment exercise validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const homeEquipment = new Set(['slider', 'stability_ball', 'bosu', 'mini_band', 'medicine_ball', 'dumbbell', 'kettlebell', 'bench']);
  const gymEquipment = new Set(['barbell', 'weight_plate', 'trap_bar', 'cable_machine', 'leg_press', 'pullup_bar']);
  const home = expansion.filter((exercise) => exercise.equipmentOptions.some((option) => option.items.some((item) => homeEquipment.has(item.equipmentId))));
  const gym = expansion.filter((exercise) => exercise.equipmentOptions.some((option) => option.items.some((item) => gymEquipment.has(item.equipmentId))));
  console.log(`Validated ${expansion.length} environment expansion exercises.`);
  console.log(`- Home-capability additions: ${home.length}`);
  console.log(`- Gym-opportunity additions: ${gym.length}`);
  console.log(`- Combined exercise seed: ${base.length + expansion.length}`);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, ROOT), 'utf8'));
}
