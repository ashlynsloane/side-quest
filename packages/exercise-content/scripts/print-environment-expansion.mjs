import expansion from '../data/environment-expansion.json' with { type: 'json' };

console.log(`Environment expansion backlog: ${expansion.home.length} home + ${expansion.gym.length} gym exercises`);
for (const [label, entries] of [['HOME', expansion.home], ['GYM', expansion.gym]]) {
  console.log(`\n${label}`);
  for (const entry of entries) console.log(`- ${entry.name} — ${entry.equipment.join(' + ')} — ${entry.reason}`);
}
