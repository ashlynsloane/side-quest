import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const generate = read('apps/mobile/src/app/generate.tsx');
const active = read('apps/mobile/src/app/active-workout.tsx');
const checks = [
  ['Quick Workout routes to dedicated preview', generate.includes("router.push('/workout-preview' as Href)")],
  ['Limitations are optional and collapsible', generate.includes('Any limitations today?') && generate.includes('showLimitations')],
  ['Detailed limitations remain available', generate.includes('Protect an area') && generate.includes('Movements that hurt') && generate.includes('Avoid movement types')],
  ['Inline generated workout wall removed', !generate.includes('<View style={styles.resultSection}>')],
  ['Active workout respects top safe area', active.includes("edges={['top', 'left', 'right']}")],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) process.exit(1);
console.log('V31.8A validation passed: progressive disclosure, dedicated preview, reduced density, and active-workout safe-area protection.');
