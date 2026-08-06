import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');

const [exercises, equipment, groups] = await Promise.all([
  readJson('exercises.json'),
  readJson('equipment.json'),
  readJson('substitution-groups.json'),
]);

const allowed = {
  classifications: new Set(['bodyweight', 'equipment']),
  loads: new Set([0, 1, 2, 3, 4]),
  roles: new Set(['primary', 'secondary', 'stabilizer']),
  stationRoles: new Set([
    'primary_strength', 'secondary_strength', 'accessory', 'core',
    'stability', 'power', 'conditioning', 'mobility',
  ]),
  bodyRegions: new Set([
    'chest', 'shoulders', 'upper_back', 'lats', 'biceps', 'triceps',
    'forearms_grip', 'core_anterior', 'core_lateral', 'core_rotation',
    'lower_back', 'glutes', 'hamstrings', 'quadriceps', 'hip_abductors',
    'hip_adductors', 'hip_flexors', 'gastrocnemius', 'soleus',
    'tibialis_anterior', 'feet_ankles',
  ]),
  joints: new Set([
    'neck', 'shoulder', 'elbow', 'wrist_hand', 'thoracic_spine',
    'lumbar_spine', 'hip', 'knee', 'ankle', 'foot',
  ]),
  patterns: new Set([
    'squat', 'lunge', 'hinge', 'horizontal_push', 'vertical_push',
    'horizontal_pull', 'vertical_pull', 'carry', 'rotation',
    'anti_rotation', 'trunk_flexion', 'anti_extension',
    'lateral_flexion', 'jump_hop', 'balance', 'locomotion', 'mobility',
  ]),
  avoidanceTags: new Set([
    'overhead', 'shoulder_weight_bearing', 'wrist_weight_bearing',
    'hanging', 'deep_knee_flexion', 'single_leg_loading', 'jumping',
    'high_impact', 'rotation', 'spinal_flexion', 'kneeling',
    'floor_required', 'unstable_surface', 'high_balance_demand',
    'complex_coordination',
  ]),
  laterality: new Set(['bilateral', 'unilateral', 'alternating', 'either']),
  equipment: new Set(equipment.map((item) => item.id)),
  groups: new Set(groups.map((item) => item.id)),
};

const errors = [];
const warnings = [];
const seenIds = new Set();
const seenSlugs = new Set();

if (!Array.isArray(exercises) || exercises.length === 0) {
  errors.push('exercises.json must contain a non-empty array.');
}

for (const [index, exercise] of exercises.entries()) {
  const at = `exercises[${index}]${exercise?.name ? ` (${exercise.name})` : ''}`;

  requireString(exercise, 'id', at);
  requireString(exercise, 'slug', at);
  requireString(exercise, 'name', at);
  requireString(exercise, 'category', at);
  requireString(exercise, 'shortDescription', at);

  unique(exercise.id, seenIds, `${at}.id`);
  unique(exercise.slug, seenSlugs, `${at}.slug`);

  member(exercise.classification, allowed.classifications, `${at}.classification`);
  member(exercise.laterality, allowed.laterality, `${at}.laterality`);

  validateArray(exercise.bodyRegions, `${at}.bodyRegions`, (item, label) => {
    member(item.region, allowed.bodyRegions, `${label}.region`);
    member(item.role, allowed.roles, `${label}.role`);
    member(item.load, allowed.loads, `${label}.load`);
  });

  if (!exercise.bodyRegions?.some((item) => item.role === 'primary')) {
    errors.push(`${at}.bodyRegions must include at least one primary region.`);
  }

  validateArray(exercise.jointLoads, `${at}.jointLoads`, (item, label) => {
    member(item.region, allowed.joints, `${label}.region`);
    member(item.load, allowed.loads, `${label}.load`);
  }, { allowEmpty: true });

  validateMemberArray(exercise.movementPatterns, allowed.patterns, `${at}.movementPatterns`);
  validateMemberArray(exercise.avoidanceTags, allowed.avoidanceTags, `${at}.avoidanceTags`, true);
  validateMemberArray(exercise.stationRoles, allowed.stationRoles, `${at}.stationRoles`);

  validateArray(exercise.equipmentOptions, `${at}.equipmentOptions`, (option, label) => {
    requireString(option, 'id', label);
    requireString(option, 'label', label);
    validateArray(option.items, `${label}.items`, (item, itemLabel) => {
      member(item.equipmentId, allowed.equipment, `${itemLabel}.equipmentId`);
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        errors.push(`${itemLabel}.quantity must be a positive integer.`);
      }
    });
  });

  validateArray(exercise.prescriptions, `${at}.prescriptions`, (rx, label) => {
    requireString(rx, 'id', label);
    if (!['reps', 'time'].includes(rx.mode)) errors.push(`${label}.mode is invalid.`);
    if (!['total', 'per_side', 'seconds'].includes(rx.unit)) errors.push(`${label}.unit is invalid.`);
    if (!(rx.target > 0)) errors.push(`${label}.target must be greater than zero.`);
    if (!(rx.estimatedSeconds > 0)) errors.push(`${label}.estimatedSeconds must be greater than zero.`);
  });

  for (const field of ['impactLevel', 'balanceDemand', 'cardiovascularDemand', 'technicalComplexity']) {
    member(exercise[field], allowed.loads, `${at}.${field}`);
  }

  validateMemberArray(exercise.substitutionGroupIds, allowed.groups, `${at}.substitutionGroupIds`, true);

  if (!exercise.instructions || !Array.isArray(exercise.instructions.setup) || !Array.isArray(exercise.instructions.execution)) {
    errors.push(`${at}.instructions must include setup and execution arrays.`);
  }

  if (exercise.media?.length === 0) {
    warnings.push(`${exercise.name}: no verified media attached yet.`);
  }
}

if (errors.length) {
  console.error(`\nExercise seed validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const bodyweight = exercises.filter((item) => item.classification === 'bodyweight').length;
  const equipmentCount = exercises.length - bodyweight;
  const categories = new Set(exercises.map((item) => item.category)).size;
  console.log(`Validated ${exercises.length} exercises.`);
  console.log(`- Bodyweight: ${bodyweight}`);
  console.log(`- Equipment-assisted/free-weight: ${equipmentCount}`);
  console.log(`- Categories: ${categories}`);
  console.log(`- Substitution groups: ${groups.length}`);
  console.log(`- Media backlog: ${warnings.length} exercises`);
}

async function readJson(filename) {
  return JSON.parse(await readFile(path.join(dataDir, filename), 'utf8'));
}

function requireString(object, key, label) {
  if (typeof object?.[key] !== 'string' || object[key].trim() === '') {
    errors.push(`${label}.${key} must be a non-empty string.`);
  }
}

function unique(value, set, label) {
  if (set.has(value)) errors.push(`${label} must be unique: ${value}`);
  set.add(value);
}

function member(value, set, label) {
  if (!set.has(value)) errors.push(`${label} has unsupported value: ${String(value)}`);
}

function validateMemberArray(value, set, label, allowEmpty = false) {
  validateArray(value, label, (item, itemLabel) => member(item, set, itemLabel), { allowEmpty });
}

function validateArray(value, label, validateItem, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return;
  }
  if (!allowEmpty && value.length === 0) {
    errors.push(`${label} must not be empty.`);
  }
  value.forEach((item, index) => validateItem(item, `${label}[${index}]`));
}
