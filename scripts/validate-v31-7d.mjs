import fs from 'node:fs';

const previewPath = 'apps/mobile/src/app/workout-preview.tsx';
const activePath = 'apps/mobile/src/app/active-workout.tsx';
const preview = fs.readFileSync(previewPath, 'utf8');
const active = fs.readFileSync(activePath, 'utf8');

const requiredPreview = [
  'SESSION PURPOSE',
  'WORKOUT STRUCTURE',
  'Ready when you are',
  'Your edits, swaps, and prescriptions carry into the live workout.',
  'Start workout',
];
const requiredActive = [
  "{ text: 'Discard'",
  "{ text: 'Save partial'",
  'SIDE QUEST COACH',
  'This updates future exercise doses; it does not grade the workout.',
  'Save workout and return to Today',
  'Log this station',
];
for (const text of requiredPreview) {
  if (!preview.includes(text)) throw new Error(`V31.7D preview contract missing: ${text}`);
}
for (const text of requiredActive) {
  if (!active.includes(text)) throw new Error(`V31.7D active-workout contract missing: ${text}`);
}
if (!preview.includes("router.push('/active-workout' as Href)")) throw new Error('Workout preview no longer enters the canonical active workout route.');
if (!active.includes("clearActiveWorkout(); router.replace('/' as Href)")) throw new Error('Workout completion no longer returns through the canonical Today route.');
console.log('V31.7D validation passed: preview, active workout, partial completion, feedback, and return-to-Today continuity.');
