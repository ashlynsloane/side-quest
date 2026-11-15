import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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
  assert.equal(qa.ios.simulator, false);
  assert.equal(eas.build.preview.env?.SIDEQUEST_ISOLATED_QA, undefined);
  assert.equal(eas.build.production.env?.SIDEQUEST_ISOLATED_QA, undefined);
});
