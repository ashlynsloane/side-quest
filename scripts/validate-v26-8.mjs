import fs from 'node:fs';
const required = [
  'packages/planner/src/digital-twin-governance.ts',
  'packages/planner/test/digital-twin-governance.test.ts',
  'apps/mobile/src/services/coach-digital-twin-governance.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const token of ['TwinGovernanceState','TwinDriftAssessment','TwinCalibrationRecord','TwinEvidenceExclusion']) if (!domain.includes(token)) throw new Error(`Missing domain contract ${token}`);
const planner = fs.readFileSync('packages/planner/src/digital-twin-governance.ts', 'utf8');
for (const token of ['detectTwinDrift','rollbackTwinParameter','excludeTwinEvidence','population_fallback','cannot authorize plan changes']) if (!planner.includes(token)) throw new Error(`Missing governance safeguard ${token}`);
console.log('V26.8 validation passed: calibration, drift detection, evidence quarantine, rollback, conservative fallback, and authority safeguards are present.');
