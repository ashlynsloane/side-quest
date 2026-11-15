// Side Quest Milestone 1 physical-device evidence validator.
// This parses an explicitly supplied synthetic QA evidence manifest; it NEVER
// connects to a phone, reads athlete databases, or certifies a test by itself.
import { readFileSync } from 'node:fs';

export const REQUIRED_SCENARIOS = [
  'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08a', 'P08b',
  'P09', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15',
];

const shaPattern = /^[a-f0-9]{40}$/;
const qaBundlePattern = /^com\.sidequest\.synthetic\.qa(?:\.[a-z0-9.-]+)?$/;
const evidencePattern = /^[a-zA-Z0-9_./-]+$/;

export function validatePhysicalDeviceEvidence(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { accepted: false, errors: ['Manifest must be an object.'] };
  }
  const build = value.build;
  if (!build || typeof build !== 'object' || Array.isArray(build)) {
    errors.push('Missing build metadata.');
  } else {
    if (!shaPattern.test(build.gitSha ?? '')) errors.push('Missing exact 40-character git SHA.');
    if (!shaPattern.test(build.sourceFingerprint ?? '')) errors.push('Missing exact source fingerprint.');
    if (!qaBundlePattern.test(build.bundleId ?? '')) errors.push('Build must use isolated synthetic QA bundle.');
    if (typeof build.buildNumber !== 'string' || !build.buildNumber.trim()) {
      errors.push('Missing build number.');
    }
    if (typeof build.iosVersion !== 'string' || !build.iosVersion.trim()) {
      errors.push('Missing device iOS version.');
    }
    if (typeof build.deviceModel !== 'string' || !build.deviceModel.trim()) {
      errors.push('Missing device model.');
    }
  }
  if (value.syntheticOnly !== true || value.cloudEnabled !== false ||
      value.realAthleteDataAccessed !== false) {
    errors.push('Synthetic-only/offline/cloud-off safety attestations missing.');
  }
  if (value.releaseOwnerApproved !== true) {
    errors.push('Release owner approval missing.');
  }
  if (typeof value.signedBy !== 'string' || !value.signedBy.trim()) {
    errors.push('Missing tester signoff.');
  }

  const scenarios = value.scenarios;
  if (!Array.isArray(scenarios)) {
    errors.push('Scenarios must be an array.');
  } else {
    const ids = scenarios.map((item) => item?.id);
    if (new Set(ids).size !== ids.length) errors.push('Duplicate scenario IDs.');
    if (ids.length !== REQUIRED_SCENARIOS.length ||
        REQUIRED_SCENARIOS.some((id) => !ids.includes(id))) {
      errors.push('All P01–P15 cases including P08a and P08b are required.');
    }
    for (const scenario of scenarios) {
      if (!REQUIRED_SCENARIOS.includes(scenario?.id)) {
        errors.push('Unexpected scenario identifier.');
        continue;
      }
      if (scenario.status !== 'PASS' || scenario.observedOnDevice !== true) {
        errors.push(scenario.id + ': no observed physical-device PASS.');
      }
      if (scenario.gitSha !== build?.gitSha ||
          scenario.bundleId !== build?.bundleId) {
        errors.push(scenario.id + ': evidence build identity mismatch.');
      }
      if (!Array.isArray(scenario.evidence) || scenario.evidence.length === 0 ||
          scenario.evidence.some((path) => typeof path !== 'string' ||
            !evidencePattern.test(path) || path.includes('..') ||
            path.startsWith('/'))) {
        errors.push(scenario.id + ': missing or unsafe evidence references.');
      }
      if (typeof scenario.observedAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T/.test(scenario.observedAt) ||
          Number.isNaN(Date.parse(scenario.observedAt))) {
        errors.push(scenario.id + ': missing timestamp.');
      }
      if ((scenario.id === 'P08a' || scenario.id === 'P08b') &&
          (scenario.actualProcessKill !== true ||
           scenario.sqliteIntegrityOk !== true ||
           scenario.canonicalRowCountVerified !== true ||
           scenario.originalFractionPreserved !== true)) {
        errors.push(scenario.id + ': actual SIGKILL and SQLite recovery proof required.');
      }
    }
  }
  return { accepted: errors.length === 0, errors };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try {
    const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const outcome = validatePhysicalDeviceEvidence(manifest);
    // Only print classification and generic error labels, never manifest contents.
    process.stdout.write(JSON.stringify(outcome) + '\n');
    if (!outcome.accepted) process.exitCode = 2;
  } catch {
    process.stderr.write('Physical-device evidence missing or invalid; RELEASE HOLD.\n');
    process.exitCode = 2;
  }
}
