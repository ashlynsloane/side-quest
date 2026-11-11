import { describe, expect, it } from 'vitest';
import { authRedirectFor, type AuthNavigationState } from '../../../apps/mobile/src/services/auth-navigation';

const state: AuthNavigationState = {
  authenticated: true,
  authLoading: false,
  onboardingLoading: false,
  needsOnboarding: true,
  firstWeekPrerequisitesComplete: true,
  route: 'onboarding',
};

describe('first-run navigation guard', () => {
  it('allows the actual generated week to render before onboarding completes', () => {
    expect(authRedirectFor({ ...state, route: 'onboarding' })).toBeNull();
    expect(authRedirectFor({ ...state, route: 'onboarding-first-week' })).toBeNull();
  });

  it('rejects direct first-week preview links without setup acknowledgements', () => {
    expect(authRedirectFor({
      ...state, route: 'onboarding-first-week', firstWeekPrerequisitesComplete: false,
    })).toBe('/onboarding');
    // The user is still allowed to review setup normally.
    expect(authRedirectFor({
      ...state, route: 'onboarding', firstWeekPrerequisitesComplete: false,
    })).toBeNull();
  });

  it('does not unlock the full training app while onboarding is incomplete', () => {
    for (const route of ['(tabs)', 'active-workout', 'training-history', 'privacy-data', undefined]) {
      expect(authRedirectFor({ ...state, route })).toBe('/onboarding');
    }
  });

  it('allows specific guided setup screens but rejects similar prefix routes', () => {
    expect(authRedirectFor({ ...state, route: 'goal-plan' })).toBeNull();
    expect(authRedirectFor({ ...state, route: 'pt-profile' })).toBeNull();
    expect(authRedirectFor({ ...state, route: 'onboarding-first-week-private' })).toBe('/onboarding');
  });

  it('redirects signed-out athletes to sign-in even when on an onboarding preview', () => {
    expect(authRedirectFor({ ...state, authenticated: false, route: 'onboarding-first-week' }))
      .toBe('/sign-in');
    expect(authRedirectFor({ ...state, authenticated: false, route: 'sign-in' })).toBeNull();
  });

  it('does not redirect while auth or onboarding state is still resolving', () => {
    expect(authRedirectFor({ ...state, route: '(tabs)', authLoading: true })).toBeNull();
    expect(authRedirectFor({ ...state, route: '(tabs)', onboardingLoading: true })).toBeNull();
  });

  it('returns to the training tabs when an athlete switch leaves an orphaned active-workout route', () => {
    const resumed = { ...state, needsOnboarding: false, route: 'active-workout' };
    // Do not navigate away before the incoming athlete's checkpoint has loaded.
    expect(authRedirectFor({ ...resumed, workoutSessionReady: false, hasActiveWorkout: false }))
      .toBeNull();
    // A valid, athlete-scoped checkpoint is a legitimate route destination.
    expect(authRedirectFor({ ...resumed, workoutSessionReady: true, hasActiveWorkout: true }))
      .toBeNull();
    // The old athlete's screen cannot trap the new athlete in an empty workout.
    expect(authRedirectFor({ ...resumed, workoutSessionReady: true, hasActiveWorkout: false }))
      .toBe('/(tabs)');
    // Onboarding always takes precedence over a stale workout route.
    expect(authRedirectFor({ ...resumed, needsOnboarding: true, workoutSessionReady: true,
      hasActiveWorkout: false })).toBe('/onboarding');
    expect(authRedirectFor({ ...resumed, authenticated: false, workoutSessionReady: true,
      hasActiveWorkout: false })).toBe('/sign-in');
  });

  it('allows the completed athlete into the training app', () => {
    expect(authRedirectFor({ ...state, needsOnboarding: false, route: 'onboarding-first-week' })).toBeNull();
    expect(authRedirectFor({ ...state, needsOnboarding: false, route: '(tabs)' })).toBeNull();
    expect(authRedirectFor({ ...state, needsOnboarding: false, route: 'sign-in' })).toBe('/(tabs)');
  });
});
