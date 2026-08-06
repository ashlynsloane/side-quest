import {
  countCompletedWorkouts,
  getLatestPerformanceGoal,
  getLatestPTProfile,
  getLatestTrainingCalendarSource,
  getTrainingIntelligencePreferences,
  listEquipmentProfiles,
} from './database';
import { getStravaConnection } from './strava';

export type OnboardingReviewKey = 'equipment' | 'restrictions' | 'training_intelligence';

export interface OnboardingState {
  version: 1;
  strengthModelAcknowledged: boolean;
  privacyModelAcknowledged: boolean;
  reviewed: Record<OnboardingReviewKey, boolean>;
  completedAt?: string;
  firstRunBypassedAt?: string;
  updatedAt: string;
}

export interface SetupReadinessItem {
  id: 'strength_model' | 'privacy_model' | 'goal' | 'equipment' | 'restrictions' | 'training_intelligence' | 'connections' | 'first_workout';
  title: string;
  detail: string;
  status: 'complete' | 'incomplete' | 'optional';
  route?: '/goal-plan' | '/equipment-profiles' | '/pt-profile' | '/training-intelligence' | '/calendar-sync' | '/generate';
  reviewKey?: OnboardingReviewKey;
}

export interface SetupReadiness {
  items: SetupReadinessItem[];
  requiredComplete: number;
  requiredTotal: number;
  recommendedComplete: number;
  recommendedTotal: number;
  optionalComplete: number;
  optionalTotal: number;
  coreReady: boolean;
  hasExistingData: boolean;
}

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const store = (globalThis as typeof globalThis & { localStorage: StorageLike }).localStorage;
const keyFor = (userId: string) => `circuit.v18.8.onboarding.${userId}`;

export function defaultOnboardingState(): OnboardingState {
  return {
    version: 1,
    strengthModelAcknowledged: false,
    privacyModelAcknowledged: false,
    reviewed: {
      equipment: false,
      restrictions: false,
      training_intelligence: false,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function loadOnboardingState(userId: string): OnboardingState {
  try {
    const raw = store.getItem(keyFor(userId));
    if (!raw) return defaultOnboardingState();
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      ...defaultOnboardingState(),
      ...parsed,
      version: 1,
      reviewed: {
        ...defaultOnboardingState().reviewed,
        ...(parsed.reviewed ?? {}),
      },
    };
  } catch {
    return defaultOnboardingState();
  }
}

export function saveOnboardingState(userId: string, state: OnboardingState): OnboardingState {
  const next = { ...state, version: 1 as const, updatedAt: new Date().toISOString() };
  store.setItem(keyFor(userId), JSON.stringify(next));
  return next;
}

export function updateOnboardingState(userId: string, patch: Partial<Omit<OnboardingState, 'version' | 'updatedAt'>>): OnboardingState {
  const current = loadOnboardingState(userId);
  return saveOnboardingState(userId, {
    ...current,
    ...patch,
    reviewed: patch.reviewed ? { ...current.reviewed, ...patch.reviewed } : current.reviewed,
  });
}

export function clearOnboardingState(userId: string): void {
  store.removeItem(keyFor(userId));
}

export async function evaluateFirstRun(userId: string): Promise<{ needsOnboarding: boolean; state: OnboardingState }> {
  let state = loadOnboardingState(userId);
  if (state.completedAt || state.firstRunBypassedAt) return { needsOnboarding: false, state };

  const [goal, completed, calendar, pt] = await Promise.all([
    getLatestPerformanceGoal().catch(() => null),
    countCompletedWorkouts().catch(() => 0),
    getLatestTrainingCalendarSource().catch(() => null),
    getLatestPTProfile().catch(() => null),
  ]);
  const hasExistingData = Boolean(goal || completed > 0 || calendar || pt);
  if (hasExistingData) {
    state = updateOnboardingState(userId, { firstRunBypassedAt: new Date().toISOString() });
    return { needsOnboarding: false, state };
  }
  return { needsOnboarding: true, state };
}

export async function buildSetupReadiness({
  userId,
  accountMode,
  state = loadOnboardingState(userId),
}: {
  userId: string;
  accountMode: 'cloud' | 'local';
  state?: OnboardingState;
}): Promise<SetupReadiness> {
  const [goal, equipment, pt, intelligence, calendar, completed, strava] = await Promise.all([
    getLatestPerformanceGoal().catch(() => null),
    listEquipmentProfiles().catch(() => []),
    getLatestPTProfile().catch(() => null),
    getTrainingIntelligencePreferences().catch(() => null),
    getLatestTrainingCalendarSource().catch(() => null),
    countCompletedWorkouts().catch(() => 0),
    accountMode === 'cloud' ? getStravaConnection().catch(() => null) : Promise.resolve(null),
  ]);

  const hasEquipmentData = equipment.length > 0;
  const hasConnection = Boolean(calendar?.active || strava?.status === 'connected');
  const items: SetupReadinessItem[] = [
    {
      id: 'strength_model',
      title: 'Understand the strength model',
      detail: 'Swim, bike, and run provide context. They do not replace exercise-specific strength work.',
      status: state.strengthModelAcknowledged ? 'complete' : 'incomplete',
    },
    {
      id: 'privacy_model',
      title: 'Understand what stays private',
      detail: 'Coaches can see sanitized future strength sessions—not history, pain, readiness, heart rate, or private notes.',
      status: state.privacyModelAcknowledged ? 'complete' : 'incomplete',
    },
    {
      id: 'goal',
      title: 'Choose a goal and training phase',
      detail: goal ? `${goal.name} is shaping strength priority and session timing.` : 'Your goal and phase determine whether strength is built, balanced, or maintained.',
      status: goal ? 'complete' : 'incomplete',
      route: '/goal-plan',
    },
    {
      id: 'equipment',
      title: 'Review equipment locations',
      detail: hasEquipmentData ? 'Equipment profiles exist. Confirm that the available weights and tools are accurate.' : 'Tell Side Quest what is available at home, work, a full gym, or while traveling.',
      status: state.reviewed.equipment ? 'complete' : 'incomplete',
      route: '/equipment-profiles',
      reviewKey: 'equipment',
    },
    {
      id: 'restrictions',
      title: 'Review PT and movement restrictions',
      detail: pt ? 'A PT/restriction profile is saved. Keep only currently relevant restrictions active.' : 'Review this even when there are no restrictions so Side Quest does not assume.',
      status: state.reviewed.restrictions ? 'complete' : 'incomplete',
      route: '/pt-profile',
      reviewKey: 'restrictions',
    },
    {
      id: 'training_intelligence',
      title: 'Review Training Intelligence controls',
      detail: intelligence ? `${intelligence.lookbackDays}-day personal baseline · ${intelligence.mode === 'auto_high_confidence' ? 'high-confidence guardrails enabled' : 'suggestions only'}.` : 'Choose suggestions-only or limited high-confidence automatic guardrails.',
      status: state.reviewed.training_intelligence ? 'complete' : 'incomplete',
      route: '/training-intelligence',
      reviewKey: 'training_intelligence',
    },
    {
      id: 'connections',
      title: 'Connect training data',
      detail: hasConnection ? 'At least one training connection is active.' : accountMode === 'cloud' ? 'Optional: connect TrainingPeaks/ICS and read-only Strava data.' : 'Optional: calendar files work locally; Strava requires a cloud account.',
      status: hasConnection ? 'complete' : 'optional',
      route: '/calendar-sync',
    },
    {
      id: 'first_workout',
      title: 'Complete a first Side Quest workout',
      detail: completed > 0 ? `${completed} completed workout${completed === 1 ? '' : 's'} in the local ledger.` : 'Optional during setup. The first completed workout begins direct-strength Training Memory.',
      status: completed > 0 ? 'complete' : 'optional',
      route: '/generate',
    },
  ];

  const required = items.slice(0, 2);
  const recommended = items.slice(2, 6);
  const optional = items.slice(6);
  return {
    items,
    requiredComplete: required.filter((item) => item.status === 'complete').length,
    requiredTotal: required.length,
    recommendedComplete: recommended.filter((item) => item.status === 'complete').length,
    recommendedTotal: recommended.length,
    optionalComplete: optional.filter((item) => item.status === 'complete').length,
    optionalTotal: optional.length,
    coreReady: required.every((item) => item.status === 'complete'),
    hasExistingData: Boolean(goal || completed > 0 || calendar || pt || hasEquipmentData),
  };
}
