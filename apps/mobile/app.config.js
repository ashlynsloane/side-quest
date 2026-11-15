// Keep the normal app.json configuration unchanged for the installed beta.
// Only the explicit EAS synthetic-device profile receives a separate app ID.
const base = require('./app.json').expo;

module.exports = () => {
  const qa = process.env.SIDEQUEST_ISOLATED_QA === '1';
  return {
    ...base,
    name: qa ? 'Side Quest QA' : base.name,
    scheme: qa ? 'sidequest-synthetic-qa' : base.scheme,
    ios: {
      ...base.ios,
      bundleIdentifier: qa
        ? 'com.sidequest.synthetic.qa'
        : base.ios.bundleIdentifier,
    },
  };
};
