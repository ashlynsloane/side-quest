import fs from 'node:fs';
const checks = [
  ['apps/mobile/src/components/v23-ui.tsx', ['height: insets.top + (primary ? 48 : 42)', 'compactWordmark']],
  ['apps/mobile/src/app/(tabs)/index.tsx', ['Best next move', 'Adjust session', 'Plan support', 'focusCard']],
  ['apps/mobile/src/app/(tabs)/train.tsx', ['Choose a workout', 'Quick workout', 'Favorites', 'quickGrid']],
  ['apps/mobile/src/app/active-workout.tsx', ['focus on quality', 'textAction', 'Record the station while you recover.']],
];
const failures=[];
for (const [file, needles] of checks) {
  if (!fs.existsSync(file)) { failures.push(`missing ${file}`); continue; }
  const text=fs.readFileSync(file,'utf8');
  for (const needle of needles) if (!text.includes(needle)) failures.push(`${file} missing ${needle}`);
}
const active=fs.readFileSync('apps/mobile/src/app/active-workout.tsx','utf8');
if (active.includes('% of planned workout')) failures.push('active workout still contains completion percentage');
if (failures.length) { console.error(`V31.2 validation failed (${failures.length}):`); for (const f of failures) console.error(`- ${f}`); process.exit(1); }
console.log('V31.2 validation passed: compact navigation, consolidated Today and Train hierarchy, and pressure-free active workout UI are present.');
