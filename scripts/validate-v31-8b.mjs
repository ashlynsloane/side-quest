import fs from 'node:fs';
const checks = [
  ['apps/mobile/src/app/(tabs)/index.tsx', ['Build your first week', 'Why this', 'YOUR WEEK', 'sessionLine']],
  ['apps/mobile/src/app/side-quest-coach.tsx', ['Today’s decision', 'Understand the decision', 'What’s next', 'Coach history']],
  ['apps/mobile/src/components/v23-ui.tsx', ['numberOfLines={3}', 'StyleSheet.hairlineWidth', 'primary ? 48 : 36']],
];
for (const [file, required] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  for (const token of required) if (!text.includes(token)) throw new Error(`Missing ${token} in ${file}`);
}
const forbidden = ["fontWeight: '850'", 'Useful immediately after intake', 'Related tools'];
for (const file of checks.map(([f]) => f)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const token of forbidden) if (text.includes(token)) throw new Error(`Forbidden legacy density token ${token} in ${file}`);
}
console.log('V31.8B validation passed: compact Today, decision-first Coach, calmer shared surfaces, and expanded row copy.');
