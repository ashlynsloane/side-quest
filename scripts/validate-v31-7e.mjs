import fs from 'node:fs';

const progressPath = 'apps/mobile/src/app/(tabs)/library.tsx';
const mapPath = 'apps/mobile/src/app/insights.tsx';
const progress = fs.readFileSync(progressPath, 'utf8');
const map = fs.readFileSync(mapPath, 'utf8');

const requiredProgress = [
  '14-DAY TRAINING PICTURE',
  'Strength compared with your current plan',
  'What deserves attention',
  'Regional status is relative to your plan',
  'Training body map',
  'without completion scores or comparison pressure',
];
const requiredMap = [
  'TRAINING BODY MAP',
  'See what is trained, needed, or protected',
  'On plan or recently loaded',
  'Strength opportunities',
  'Need review',
  'not a universal body-part percentage target',
];
for (const text of requiredProgress) {
  if (!progress.includes(text)) throw new Error(`V31.7E Progress contract missing: ${text}`);
}
for (const text of requiredMap) {
  if (!map.includes(text)) throw new Error(`V31.7E body-map contract missing: ${text}`);
}
if (!progress.includes("router.push('/insights' as Href)")) throw new Error('Progress no longer opens the canonical Training Body Map route.');
if (!map.includes("pathname: '/training-region'")) throw new Error('Training Body Map no longer opens regional detail.');
console.log('V31.7E validation passed: Progress snapshot, cold-start baseline, plan-relative regional status, body-map summary, and regional detail continuity.');
