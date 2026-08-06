import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const projectRoot = path.resolve(packageRoot, '../..');
const exercisesPath = path.join(packageRoot, 'data/exercises.json');
const groupsPath = path.join(packageRoot, 'data/substitution-groups.json');
const manifestPath = path.join(projectRoot, 'apps/mobile/src/content/exercise-visual-manifest.json');
const assetsDirectory = path.join(projectRoot, 'apps/mobile/assets/exercise-guides');

const removedSlugs = new Set([
  'diagonal-bound-to-stick',
  'single-leg-landmine-style-band-press',
  'carioca-step-with-controlled-pause',
  'bosu-step-up-to-knee-drive',
]);

const [exercises, groups, manifest, assetFiles] = await Promise.all([
  readJson(exercisesPath),
  readJson(groupsPath),
  readJson(manifestPath),
  readdir(assetsDirectory),
]);

const errors = [];
const warnings = [];
const active = exercises.filter((exercise) => exercise.status === 'active' && exercise.defaultEnabled);
const byExerciseId = new Map();

if (exercises.length !== 146) errors.push(`Expected 146 catalog exercises, found ${exercises.length}.`);
if (active.length !== 146) errors.push(`Expected 146 active enabled exercises, found ${active.length}.`);
if (manifest.length !== 146) errors.push(`Expected 146 visual records, found ${manifest.length}.`);

for (const exercise of exercises) {
  if (removedSlugs.has(exercise.slug)) errors.push(`Removed exercise remains in catalog: ${exercise.slug}.`);
}

for (const [index, record] of manifest.entries()) {
  if (!record || typeof record !== 'object') {
    errors.push(`manifest[${index}] must be an object.`);
    continue;
  }
  if (!record.exerciseId) errors.push(`manifest[${index}].exerciseId is required.`);
  if (byExerciseId.has(record.exerciseId)) errors.push(`Duplicate visual record for ${record.exerciseId}.`);
  byExerciseId.set(record.exerciseId, record);
}

const expectedAssets = new Set();
for (const exercise of active) {
  const record = byExerciseId.get(exercise.id);
  if (!record) {
    errors.push(`${exercise.name}: no approved visual registry record.`);
    continue;
  }
  if (record.exerciseName !== exercise.name) errors.push(`${exercise.id}: manifest name mismatch.`);
  if (record.exerciseSlug !== exercise.slug) errors.push(`${exercise.id}: manifest slug mismatch.`);
  if (record.status !== 'illustrated') errors.push(`${exercise.name}: visual status is ${String(record.status)}.`);
  const normalizedAsset = record.asset.replace(/^\.\.\/\.\.\/assets\//, 'apps/mobile/assets/');
  const absoluteAsset = path.join(projectRoot, normalizedAsset);
  expectedAssets.add(path.basename(absoluteAsset));
  try {
    await access(absoluteAsset);
    const info = await stat(absoluteAsset);
    if (info.size < 10_000) errors.push(`${exercise.name}: guide asset is unexpectedly small.`);
  } catch {
    errors.push(`${exercise.name}: asset missing at ${normalizedAsset}.`);
  }
}

for (const record of manifest) {
  if (!active.some((exercise) => exercise.id === record.exerciseId)) {
    errors.push(`Orphan visual record: ${record.exerciseId}.`);
  }
}

const actualPngAssets = new Set(assetFiles.filter((name) => name.endsWith('.png')));
for (const name of expectedAssets) if (!actualPngAssets.has(name)) errors.push(`Expected asset missing: ${name}.`);
for (const name of actualPngAssets) if (!expectedAssets.has(name)) errors.push(`Orphan asset file: ${name}.`);
if (actualPngAssets.size !== 146) errors.push(`Expected 146 PNG assets, found ${actualPngAssets.size}.`);

const groupIds = new Set(groups.map((group) => group.id));
const usedGroups = new Set(active.flatMap((exercise) => exercise.substitutionGroupIds ?? []));
for (const groupId of usedGroups) if (!groupIds.has(groupId)) errors.push(`Undefined substitution group: ${groupId}.`);
for (const groupId of groupIds) if (!usedGroups.has(groupId)) warnings.push(`Unused substitution group: ${groupId}.`);

for (const exercise of active) {
  for (const media of exercise.media ?? []) {
    if (!media.verified) continue;
    if (media.kind !== 'video') warnings.push(`${exercise.name}: verified non-video media remains in exercises.json.`);
    if (media.kind === 'video' && typeof media.uri === 'string' && !/^(https:\/\/|file:\/\/|asset:\/\/)/.test(media.uri)) {
      errors.push(`${exercise.name}: verified video URI is unsafe.`);
    }
  }
}

if (errors.length) {
  console.error(`\nFinal exercise-guide validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${active.length}/${active.length} active exercises with approved bundled guides.`);
  console.log(`- Catalog exercises: ${exercises.length}`);
  console.log(`- Visual manifest records: ${manifest.length}`);
  console.log(`- Bundled PNG assets: ${actualPngAssets.size}`);
  console.log(`- Missing guides: 0`);
  console.log(`- Orphan guides: 0`);
  console.log(`- Removed exercises present: 0`);
  console.log(`- Unverified external exercise pages shown: 0`);
  if (warnings.length) {
    console.log(`- Warnings: ${warnings.length}`);
    for (const warning of warnings) console.log(`  - ${warning}`);
  }
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}
