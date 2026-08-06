import fs from 'node:fs';
const checks = [
  ['apps/mobile/src/app/(tabs)/library.tsx', ['Your starting point is already useful', 'First-week foundation', 'Side Quest Coach', 'Training body map', 'No completed sessions yet']],
  ['apps/mobile/src/app/side-quest-coach.tsx', ['Your coaching loop', '1. Start with intake', '2. Complete and reflect', '3. Review what changed']],
  ['apps/mobile/src/app/share-center.tsx', ['A clean workout card, with privacy controls', 'SHARE CARD INCLUDES', 'Review body regions', 'Private by default']],
];
const failures=[];
for (const [file,tokens] of checks) { const text=fs.readFileSync(file,'utf8'); for (const token of tokens) if(!text.includes(token)) failures.push(`${file} missing ${token}`); }
if (failures.length) { console.error(`V31.6 validation failed (${failures.length}):`); failures.forEach(x=>console.error(`- ${x}`)); process.exit(1); }
console.log('V31.6 validation passed: cold-start Progress, integrated coaching loop, body-map discovery, and privacy-safe workout sharing are present.');
