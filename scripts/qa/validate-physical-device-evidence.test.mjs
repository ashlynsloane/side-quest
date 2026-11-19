import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REQUIRED_SCENARIOS,
  validatePhysicalDeviceEvidence,
} from './validate-physical-device-evidence.mjs';

const sha = 'a'.repeat(40);
function validSyntheticManifest() {
  const bundleId = 'com.sidequest.synthetic.qa';
  return {
    build: {
      gitSha: sha, sourceFingerprint: 'b'.repeat(40), bundleId,
      buildNumber: '100', iosVersion: '26.0', deviceModel: 'QA iPhone',
    },
    syntheticOnly: true,
    cloudEnabled: false,
    realAthleteDataAccessed: false,
    releaseOwnerApproved: true,
    signedBy: 'Synthetic QA tester',
    scenarios: REQUIRED_SCENARIOS.map((id) => ({
      id, status: 'PASS', observedOnDevice: true, gitSha: sha, bundleId,
      observedAt: '2026-11-14T14:00:00-07:00',
      evidence: ['synthetic-artifacts/evidence.txt'],
      actualProcessKill: true, sqliteIntegrityOk: true,
      canonicalRowCountVerified: true, originalFractionPreserved: true,
    })),
  };
}
test('complete synthetic manifest exercises structural acceptance', () => {
  assert.equal(validatePhysicalDeviceEvidence(validSyntheticManifest()).accepted, true);
});
test('empty evidence and all NOT RUN are fail-closed', () => {
  assert.equal(validatePhysicalDeviceEvidence({}).accepted, false);
  const m = validSyntheticManifest();
  for (const item of m.scenarios) item.status = 'NOT RUN';
  assert.equal(validatePhysicalDeviceEvidence(m).accepted, false);
});
test('missing either mandatory crash window is rejected', () => {
  for (const id of ['P08a', 'P08b']) {
    const m = validSyntheticManifest();
    m.scenarios = m.scenarios.filter((item) => item.id !== id);
    assert.equal(validatePhysicalDeviceEvidence(m).accepted, false);
  }
});
test('fake force-quit or SQLite recovery evidence cannot pass', () => {
  for (const id of ['P08a', 'P08b']) {
    for (const field of ['actualProcessKill', 'sqliteIntegrityOk',
      'canonicalRowCountVerified', 'originalFractionPreserved']) {
      const m = validSyntheticManifest();
      m.scenarios.find((item) => item.id === id)[field] = false;
      assert.equal(validatePhysicalDeviceEvidence(m).accepted, false);
    }
  }
});
test('reject duplicate, wrong-build and unobserved device evidence', () => {
  const m = validSyntheticManifest();
  m.scenarios[0].id = 'P02';
  assert.equal(validatePhysicalDeviceEvidence(m).accepted, false);
  const mismatch = validSyntheticManifest();
  mismatch.scenarios[0].gitSha = 'c'.repeat(40);
  assert.equal(validatePhysicalDeviceEvidence(mismatch).accepted, false);
  const unobserved = validSyntheticManifest();
  unobserved.scenarios[0].observedOnDevice = false;
  assert.equal(validatePhysicalDeviceEvidence(unobserved).accepted, false);
});
test('reject real-data access, cloud mode, or missing approval', () => {
  for (const [field, value] of [
    ['syntheticOnly', false], ['cloudEnabled', true],
    ['realAthleteDataAccessed', true], ['releaseOwnerApproved', false],
  ]) {
    const m = validSyntheticManifest();
    m[field] = value;
    assert.equal(validatePhysicalDeviceEvidence(m).accepted, false);
  }
});
test('reject nonexistent/unsafe evidence paths and production bundle IDs', () => {
  const m = validSyntheticManifest();
  m.scenarios[0].evidence = ['../../private-records.db'];
  assert.equal(validatePhysicalDeviceEvidence(m).accepted, false);
  const prod = validSyntheticManifest();
  prod.build.bundleId = 'com.sidequest.mobile';
  for (const item of prod.scenarios) item.bundleId = prod.build.bundleId;
  assert.equal(validatePhysicalDeviceEvidence(prod).accepted, false);
});
