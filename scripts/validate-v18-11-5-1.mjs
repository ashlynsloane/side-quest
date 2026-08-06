import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const legacyValidatorPath = 'scripts/validate-v18-11-1.mjs';
const currentValidatorPath = 'scripts/validate-v18-11-5.mjs';

for (const file of [legacyValidatorPath, currentValidatorPath, 'docs/V18_11_5_1_VALIDATOR_COMPATIBILITY.md']) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

if (fs.existsSync(path.join(root, legacyValidatorPath))) {
  const validator = read(legacyValidatorPath);
  for (const token of [
    'hasLegacyRetroPalette',
    'hasDynamicThemePalette',
    "screen.includes('palette.canvas')",
    "screen.includes('palette.ink')",
    "screen.includes('palette.border')",
  ]) {
    if (!validator.includes(token)) failures.push(`${legacyValidatorPath} is missing ${token}`);
  }
  if (validator.includes("expect(file, [\"ink: '#01234D'\", \"border: '#164C73'\"])")) {
    failures.push(`${legacyValidatorPath} still requires obsolete fixed colors`);
  }
}

if (failures.length) {
  console.error(`V18.11.5.1 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('V18.11.5.1 validation passed: the cohesion validator accepts both its original retro palette and the newer semantic theme-token implementation.');
