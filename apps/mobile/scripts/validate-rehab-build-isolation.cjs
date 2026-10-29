/* Prevent accidental overlay of the existing Side Quest installation by QA. */
const assert = require('node:assert/strict');
const config = require('../app.config.js');
const base = require('../app.json').expo;
const eas = require('../eas.json');

const priorSandbox = process.env.SIDE_QUEST_REHAB_SANDBOX;
const priorEnabled = process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA;
try {
  delete process.env.SIDE_QUEST_REHAB_SANDBOX;
  delete process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA;
  const production = config({config: base});
  assert.equal(production.name, base.name);
  assert.equal(production.scheme, base.scheme);
  assert.equal(production.ios.bundleIdentifier, base.ios.bundleIdentifier);
  assert.equal(production.android.package, base.android.package);

  process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA = 'true';
  assert.throws(
    () => config({config: base}),
    /Refusing to enable the rehabilitation beta/,
  );
  process.env.SIDE_QUEST_REHAB_SANDBOX = 'true';
  const beta = config({config: base});
  assert.notEqual(beta.name, production.name);
  assert.notEqual(beta.scheme, production.scheme);
  assert.notEqual(beta.ios.bundleIdentifier, production.ios.bundleIdentifier);
  assert.notEqual(beta.android.package, production.android.package);
  for (const profile of ['rehab-beta','rehab-simulator']) {
    assert.equal(eas.build[profile].env.SIDE_QUEST_REHAB_SANDBOX, 'true');
    assert.equal(eas.build[profile].env.EXPO_PUBLIC_ENABLE_REHAB_BETA, 'true');
  }
  assert.notEqual(eas.build.production?.env?.EXPO_PUBLIC_ENABLE_REHAB_BETA, 'true');
  console.log('Rehab beta app isolation verified: production unchanged, sandbox separate.');
} finally {
  if (priorSandbox === undefined) delete process.env.SIDE_QUEST_REHAB_SANDBOX;
  else process.env.SIDE_QUEST_REHAB_SANDBOX = priorSandbox;
  if (priorEnabled === undefined) delete process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA;
  else process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA = priorEnabled;
}
