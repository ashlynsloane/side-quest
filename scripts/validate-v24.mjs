import fs from 'node:fs';
import path from 'node:path';

const failures = [];
const root = process.cwd();
const read = (file) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
const expect = (file, tokens) => {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
  const text = read(file);
  for (const token of tokens) if (!text.includes(token)) failures.push(`${file} is missing ${token}`);
};

expect('apps/mobile/src/components/workout-editor-modal.tsx', [
  'Edit workout', 'Reset generated workout', 'Add exercise', 'durationSeconds',
  'REPS / SIDE', 'recalculateWorkout', 'Added by athlete before starting.',
]);
expect('apps/mobile/src/app/workout-preview.tsx', [
  'WorkoutEditorModal', 'Edit workout', 'Start workout', 'setPreviewWorkout(edited)',
]);
expect('apps/mobile/src/app/active-workout.tsx', [
  "type Phase = 'work' | 'rest' | 'complete'", 'REST + RECORD', 'Rounds completed',
  'Save and start next station', 'Continue without logging', 'useAudioPlayer',
  'workout-cue.wav', 'workout-complete.wav',
  'Log what you did', 'finalCountdownEnabled',
]);
expect('apps/mobile/src/components/keyboard-safe-screen.tsx', [
  'KeyboardAvoidingView', 'keyboardShouldPersistTaps="handled"',
  'automaticallyAdjustKeyboardInsets', 'keyboardDismissMode',
]);
expect('apps/mobile/src/app/_layout.tsx', ['<Stack.Screen name="active-workout" options={{ headerShown: false }} />']);
expect('apps/mobile/src/components/v23-ui.tsx', ['KeyboardAvoidingView','automaticallyAdjustKeyboardInsets']);
expect('apps/mobile/src/components/v12-ui.tsx', ['KeyboardAvoidingView','automaticallyAdjustKeyboardInsets']);
expect('apps/mobile/src/services/workout-cues.ts', [
  'workCueSeconds: [120, 60, 30, 10]', 'restCueSeconds: [15, 5]',
  'saveWorkoutCuePreferences',
]);
for (const asset of ['apps/mobile/assets/audio/workout-cue.wav','apps/mobile/assets/audio/workout-complete.wav']) {
  const file = path.join(root, asset);
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) failures.push(`Missing or invalid ${asset}`);
}
const active = read('apps/mobile/src/app/active-workout.tsx');
if (/setLoadTarget|Add today.s load|SETS \+ LOAD/.test(active)) failures.push('Active work phase still asks for load entry during the timed station');
if (!active.includes('phase === \'rest\'')) failures.push('Rest-period logging state is not present');

if (failures.length) {
  console.error(`V24 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V24.0 validation passed: editable pre-workout stations and prescriptions, rest-period exercise logging, configurable audio/haptic cues, redesigned active timer, and keyboard-safe completion forms are present.');
