/**
 * Isolated rehabilitation beta identity.
 *
 * The default build remains identical to apps/mobile/app.json.
 * SIDE_QUEST_REHAB_SANDBOX=true uses a separate bundle identifier, app name
 * and deep-link scheme so a rehab QA build cannot replace Side Quest.
 */
const base = require('./app.json').expo;

module.exports = ({config}) => {
  const sandbox = process.env.SIDE_QUEST_REHAB_SANDBOX === 'true';
  const rehabEnabled = process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA === 'true';
  if (rehabEnabled && !sandbox) {
    throw new Error(
      'Refusing to enable the rehabilitation beta in the main Side Quest app. ' +
      'Set SIDE_QUEST_REHAB_SANDBOX=true and use an isolated rehab build profile.',
    );
  }
  return {
    ...config,
    ...base,
    name: sandbox ? 'Side Quest Rehab Beta' : base.name,
    scheme: sandbox ? 'sidequest-rehab-beta' : base.scheme,
    ios: {
      ...base.ios,
      bundleIdentifier: sandbox
        ? 'com.ashlynsloanesteam.sidequest.rehabbeta'
        : base.ios.bundleIdentifier,
    },
    android: {
      ...base.android,
      ...(sandbox ? {package: 'com.ashlynsloanesteam.sidequest.rehabbeta'} : {}),
    },
  };
};
