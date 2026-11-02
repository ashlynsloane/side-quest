/**
 * Pure navigation policy for the unauthenticated / first-run state.
 *
 * The generated first-week preview is part of onboarding. Requiring
 * onboarding completion before the preview can render creates a redirect
 * loop: completion is only written after the preview saves successfully.
 */
export type AuthDestination = '/sign-in' | '/onboarding' | '/(tabs)';
export type AuthNavigationState = {
  authenticated: boolean;
  authLoading: boolean;
  onboardingLoading: boolean;
  needsOnboarding: boolean;
  firstWeekPrerequisitesComplete: boolean;
  route: string | undefined;
};
const SETUP_ROUTES = new Set([
  'onboarding',
  'onboarding-first-week',
  'goal-catalog',
  'goal-plan',
  'equipment-profiles',
  'pt-profile',
  'training-intelligence',
  'calendar-sync',
  'generate',
]);

export function authRedirectFor(state: AuthNavigationState): AuthDestination | null {
  if (state.authLoading || state.onboardingLoading) return null;
  if (!state.authenticated) return state.route === 'sign-in' ? null : '/sign-in';
  if (state.needsOnboarding) {
    // The preview is part of first-run setup, but deep-linking directly here
    // must not bypass the required strength/privacy acknowledgements or write
    // a partial goal that later masquerades as an existing athlete profile.
    if (state.route === 'onboarding-first-week' && !state.firstWeekPrerequisitesComplete) {
      return '/onboarding';
    }
    return state.route && SETUP_ROUTES.has(state.route) ? null : '/onboarding';
  }
  return state.route === 'sign-in' ? '/(tabs)' : null;
}
