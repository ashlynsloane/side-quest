import fs from 'node:fs';

const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
if (domain.includes('AthleteResponseModelResult')) {
  throw new Error('V26.0.1 failed: stale AthleteResponseModelResult reference remains.');
}
if (!domain.includes('athleteResponse?: AthleteResponseProfile;')) {
  throw new Error('V26.0.1 failed: UnifiedCoachEngineInput must use AthleteResponseProfile.');
}
console.log('V26.0.1 validation passed: Unified Coach Engine uses the exported athlete-response profile contract.');
