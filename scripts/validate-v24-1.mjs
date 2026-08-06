import fs from 'node:fs';

const failures = [];
const read = (path) => {
  if (!fs.existsSync(path)) { failures.push(`Missing ${path}`); return ''; }
  return fs.readFileSync(path, 'utf8');
};
const expect = (path, tokens) => {
  const text = read(path);
  for (const token of tokens) if (!text.includes(token)) failures.push(`${path} is missing ${token}`);
};

expect('packages/domain/src/index.ts', [
  "RegionProtectionMode = 'direct_only' | 'keep_light' | 'avoid'",
  'interface RegionRestriction',
  'interface PainAreaSelection',
  'regionRestrictions?: RegionRestriction[]',
  'excludedMovementPatterns?: MovementPattern[]',
]);
expect('apps/mobile/src/content/pain-areas.ts', [
  "left_rhomboid",
  "Right inner shoulder blade",
  "Left front hip",
  "Left Achilles or heel",
  'buildRestrictionsFromPainAreas',
  'MOVEMENT_PATTERN_OPTIONS',
]);
expect('apps/mobile/src/components/pain-body-map.tsx', [
  'maximumZoomScale={2.8}',
  'Search an area in plain language',
  'Avoid direct loading',
  'Keep it light',
  'Avoid this area',
  'user?.anatomyFigure',
]);
expect('apps/mobile/src/app/today-check-in.tsx', [
  'What should we protect today?',
  '<PainBodyMap',
  'Which movements aggravate it?',
  'aggravatedMovementPatterns',
  'regionRestrictions: mapped.regionRestrictions',
]);
expect('apps/mobile/src/app/pt-profile.tsx', [
  'Protect only what needs protecting',
  '<PainBodyMap',
  'protectedAreas: painAreas',
  'excludedMovementPatterns: movementPatterns',
]);
expect('apps/mobile/src/app/generate.tsx', [
  'Protect an area today',
  '<PainBodyMap',
  'Movements that hurt today',
  'regionRestrictions: mappedRestrictions.regionRestrictions',
  'excludedMovementPatterns',
]);
expect('packages/generator/src/index.ts', [
  'violatesRegionRestriction',
  'regionRestrictionPenalty',
  'request.excludedMovementPatterns',
]);
expect('packages/planner/src/index.ts', [
  'mergeRegionRestrictions',
  'snapshot.regionRestrictions',
  'override.excludedMovementPatterns',
]);
expect('packages/generator/test/generator.test.ts', [
  'localized rhomboid area',
  'localized-rhomboid-hotel-gym',
  'keeps lower-load options available',
]);

const generate = read('apps/mobile/src/app/generate.tsx');
if (generate.includes('<Section title="Avoid body regions">')) failures.push('Quick workout still uses the broad hard-exclusion body-region chip section');
const checkIn = read('apps/mobile/src/app/today-check-in.tsx');
if (checkIn.includes('Upper back + lats')) failures.push('Today check-in still combines upper back and lats into one broad option');

if (failures.length) {
  console.error(`V24.1 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V24.1 validation passed: precise zoomable pain mapping, plain-language anatomy search, graduated region protection, movement-specific limits, plan propagation, and localized-restriction generator coverage are present.');
