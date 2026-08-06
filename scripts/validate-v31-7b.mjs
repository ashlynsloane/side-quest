import fs from 'node:fs';

const todayPath = 'apps/mobile/src/app/(tabs)/index.tsx';
const onboardingPath = 'apps/mobile/src/app/onboarding.tsx';
const today = fs.readFileSync(todayPath, 'utf8');
const onboarding = fs.readFileSync(onboardingPath, 'utf8');

const requiredToday = [
  'SIDE QUEST COACH',
  'Intake-based',
  'History-informed',
  'Build your first usable week',
  'Useful immediately after intake',
  'Why this?',
  'Build my first plan',
  'Review workout',
  'Training history will refine it later.',
];
for (const token of requiredToday) {
  if (!today.includes(token)) throw new Error(`V31.7B Today contract missing: ${token}`);
}
if (!onboarding.includes('<TourRow label="You"')) throw new Error('V31.7B onboarding must use the canonical You label.');
if (onboarding.includes('<TourRow label="Profile"')) throw new Error('V31.7B onboarding still exposes Profile as a primary tab label.');
if (!onboarding.includes("router.replace('/(tabs)' as Href)")) throw new Error('V31.7B onboarding must return athletes to Today after setup.');
console.log('V31.7B validation passed: cold-start handoff, dominant Today recommendation, canonical actions, and onboarding terminology.');
