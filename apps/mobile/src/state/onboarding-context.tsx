import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  clearOnboardingState,
  defaultOnboardingState,
  evaluateFirstRun,
  loadOnboardingState,
  saveOnboardingState,
  type OnboardingReviewKey,
  type OnboardingState,
} from '@/services/onboarding';
import { useAuth } from './auth-context';

interface OnboardingValue {
  state: OnboardingState;
  loading: boolean;
  needsOnboarding: boolean;
  refresh(): Promise<void>;
  acknowledgeStrengthModel(value: boolean): void;
  acknowledgePrivacyModel(value: boolean): void;
  markReviewed(key: OnboardingReviewKey, value: boolean): void;
  complete(): Promise<void>;
  reset(): Promise<void>;
}

const OnboardingContext = createContext<OnboardingValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<OnboardingState>(defaultOnboardingState());
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const refresh = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setState(defaultOnboardingState());
      setNeedsOnboarding(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await evaluateFirstRun(user.id);
    setState(result.state);
    setNeedsOnboarding(result.needsOnboarding);
    setLoading(false);
  }, [authLoading, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = useCallback((update: (current: OnboardingState) => OnboardingState) => {
    if (!user) return;
    setState((current) => saveOnboardingState(user.id, update(current)));
  }, [user]);

  const acknowledgeStrengthModel = useCallback((value: boolean) => {
    mutate((current) => ({ ...current, strengthModelAcknowledged: value }));
  }, [mutate]);

  const acknowledgePrivacyModel = useCallback((value: boolean) => {
    mutate((current) => ({ ...current, privacyModelAcknowledged: value }));
  }, [mutate]);

  const markReviewed = useCallback((key: OnboardingReviewKey, value: boolean) => {
    mutate((current) => ({ ...current, reviewed: { ...current.reviewed, [key]: value } }));
  }, [mutate]);

  const complete = useCallback(async () => {
    if (!user) return;
    if (!state.strengthModelAcknowledged || !state.privacyModelAcknowledged) {
      throw new Error('Review the strength and privacy principles before entering Side Quest.');
    }
    const saved = saveOnboardingState(user.id, { ...state, completedAt: new Date().toISOString() });
    setState(saved);
    setNeedsOnboarding(false);
  }, [state, user]);

  const reset = useCallback(async () => {
    if (!user) return;
    clearOnboardingState(user.id);
    setState(loadOnboardingState(user.id));
    setNeedsOnboarding(true);
  }, [user]);

  const value = useMemo<OnboardingValue>(() => ({
    state,
    loading,
    needsOnboarding,
    refresh,
    acknowledgeStrengthModel,
    acknowledgePrivacyModel,
    markReviewed,
    complete,
    reset,
  }), [state, loading, needsOnboarding, refresh, acknowledgeStrengthModel, acknowledgePrivacyModel, markReviewed, complete, reset]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingValue {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return value;
}
