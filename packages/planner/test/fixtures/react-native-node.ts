/** Node-only placeholder for React Native during planner-domain QA.
 * The mobile database repository does not call any React Native primitives.
 * Do not use this stub in a native or production bundle.
 */
export const Platform = {
  OS: 'ios',
  select: <T>(choices: { ios?: T; default?: T }): T | undefined =>
    choices.ios ?? choices.default,
};
export const NativeModules = {};
