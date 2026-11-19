import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const configFactory = require('../../apps/mobile/app.config.js');
const eas = require('../../apps/mobile/eas.json');
const base = require('../../apps/mobile/app.json').expo;

test('normal Side Quest build retains its current beta identity', () => {
  const old = process.env.SIDEQUEST_ISOLATED_QA;
  try {
    delete process.env.SIDEQUEST_ISOLATED_QA;
    const config = configFactory();
    assert.equal(config.ios.bundleIdentifier, base.ios.bundleIdentifier);
    assert.equal(config.scheme, base.scheme);
    assert.equal(config.name, base.name);
  } finally {
    if (old === undefined) delete process.env.SIDEQUEST_ISOLATED_QA;
    else process.env.SIDEQUEST_ISOLATED_QA = old;
  }
});

test('only opt-in synthetic QA profile has independent iPhone app identity', () => {
  const old = process.env.SIDEQUEST_ISOLATED_QA;
  try {
    process.env.SIDEQUEST_ISOLATED_QA = '1';
    const config = configFactory();
    assert.equal(config.ios.bundleIdentifier, 'com.sidequest.synthetic.qa');
    assert.notEqual(config.ios.bundleIdentifier, base.ios.bundleIdentifier);
    assert.equal(config.name, 'Side Quest QA');
    assert.notEqual(config.scheme, base.scheme);
    process.env.SIDEQUEST_ISOLATED_QA = 'true';
    assert.equal(configFactory().ios.bundleIdentifier, base.ios.bundleIdentifier);
  } finally {
    if (old === undefined) delete process.env.SIDEQUEST_ISOLATED_QA;
    else process.env.SIDEQUEST_ISOLATED_QA = old;
  }
});

test('isolated QA EAS profile targets physical iPhone without store distribution', () => {
  const qa = eas.build['synthetic-device-qa'];
  assert.equal(qa.distribution, 'internal');
  assert.equal(qa.env.SIDEQUEST_ISOLATED_QA, '1');
  assert.equal(qa.env.EXPO_PUBLIC_SIDEQUEST_ISOLATED_QA, '1');
  assert.equal(qa.env.EXPO_PUBLIC_SUPABASE_URL, '');
  assert.equal(qa.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, '');
  assert.equal(qa.env.EXPO_PUBLIC_BETA_INVITE_CODE, '');
  assert.equal(qa.ios.simulator, false);
  assert.equal(eas.build.preview.env?.SIDEQUEST_ISOLATED_QA, undefined);
  assert.equal(eas.build.production.env?.SIDEQUEST_ISOLATED_QA, undefined);
  assert.equal(eas.build.production.env?.EXPO_PUBLIC_SIDEQUEST_ISOLATED_QA, undefined);
  assert.equal(eas.build.preview.env?.EXPO_PUBLIC_SIDEQUEST_ISOLATED_QA, undefined);
});

test('synthetic QA runtime prevents cloud client construction even with preview credentials', () => {
  const source = readFileSync(fileURLToPath(new URL(
    '../../apps/mobile/src/services/supabase.ts', import.meta.url,
  )), 'utf8');
  assert.match(source, /process\.env\.EXPO_PUBLIC_SIDEQUEST_ISOLATED_QA === '1'/);
  assert.match(source, /cloudAuthConfigured = !isIsolatedQaRuntime && Boolean\(url && key\)/);
});

test('synthetic QA background sync cannot fetch external calendars', () => {
  const runtime = readFileSync(fileURLToPath(new URL(
    '../../apps/mobile/src/services/integration-runtime.ts', import.meta.url,
  )), 'utf8');
  assert.match(runtime, /if \(isIsolatedQaRuntime\) \{ await markRuntimeSuccess\(attemptedAt\); return; \}/);
  assert.ok(runtime.indexOf('if (isIsolatedQaRuntime)') < runtime.indexOf('await autoRefreshTrainingCalendars({ force })'));
});
