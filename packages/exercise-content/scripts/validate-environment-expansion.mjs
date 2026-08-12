import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '../data');
const expansion = JSON.parse(await readFile(path.join(dataDir, 'environment-expansion.json'), 'utf8'));
const equipment = JSON.parse(await readFile(path.join(dataDir, 'equipment.json'), 'utf8'));
const known = new Set(equipment.map((item) => item.id));
const entries = [...expansion.home, ...expansion.gym];
const ids = new Set();
const errors = [];
for (const entry of entries) {
  if (ids.has(entry.id)) errors.push(`Duplicate expansion exercise id: ${entry.id}`);
  ids.add(entry.id);
  for (const item of entry.equipment) {
    if (!known.has(item)) errors.push(`${entry.name}: unknown equipment ${item}`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated environment expansion: ${expansion.home.length} home additions, ${expansion.gym.length} gym additions.`);
}
