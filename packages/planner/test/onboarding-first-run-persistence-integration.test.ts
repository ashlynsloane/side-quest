import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  goal: vi.fn(async () => null as object | null),
  workouts: vi.fn(async () => 0),
  calendar: vi.fn(async () => null as object | null),
  pt: vi.fn(async () => null as object | null),
}));

vi.mock('../../../apps/mobile/src/services/database', () => ({
  getLatestPerformanceGoal: mock.goal,
  countCompletedWorkouts: mock.workouts,
  getLatestTrainingCalendarSource: mock.calendar,
  getLatestPTProfile: mock.pt,
  getTrainingIntelligencePreferences: vi.fn(async () => null),
  listEquipmentProfiles: vi.fn(async () => []),
}));
vi.mock('../../../apps/mobile/src/services/strava', () => ({
  getStravaConnection: vi.fn(async () => null),
}));

const stored = new Map<string, string>();
type OnboardingService = typeof import('../../../apps/mobile/src/services/onboarding');
let service: OnboardingService;
beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
  service = await import('../../../apps/mobile/src/services/onboarding');
});
beforeEach(() => {
  stored.clear();
  vi.clearAllMocks();
  mock.goal.mockResolvedValue(null);
  mock.workouts.mockResolvedValue(0);
  mock.calendar.mockResolvedValue(null);
  mock.pt.mockResolvedValue(null);
});

describe('real evaluateFirstRun decision after interrupted first-week writes', () => {
  it('keeps fresh athlete in onboarding when first-week goal persisted but block did not', async () => {
    const user = 'new-local-athlete';
    const started = service.saveOnboardingState(user, {
      ...service.defaultOnboardingState(),
      strengthModelAcknowledged: true,
      privacyModelAcknowledged: true,
      firstWeekSetupStartedAt: '2026-11-02T15:00:00.000Z',
    });
    mock.goal.mockResolvedValue({ id: 'partially-saved-goal' });
    const result = await service.evaluateFirstRun(user);
    expect(result.needsOnboarding).toBe(true);
    expect(result.state.firstWeekSetupStartedAt).toBe(started.firstWeekSetupStartedAt);
    expect(result.state.firstRunBypassedAt).toBeUndefined();
    expect(mock.goal).not.toHaveBeenCalled();
  });

  it('preserves older athletes with existing workouts and no new first-week marker', async () => {
    mock.workouts.mockResolvedValue(12);
    const result = await service.evaluateFirstRun('established-athlete');
    expect(result.needsOnboarding).toBe(false);
    expect(result.state.firstRunBypassedAt).toBeDefined();
  });

  it('isolates started state by exact athlete ID even with similar names', async () => {
    service.saveOnboardingState('local_a.b', {
      ...service.defaultOnboardingState(),
      firstWeekSetupStartedAt: '2026-11-02T15:00:00.000Z',
    });
    mock.goal.mockResolvedValue({ id: 'some-goal' });
    expect((await service.evaluateFirstRun('local_a.b')).needsOnboarding).toBe(true);
    expect((await service.evaluateFirstRun('local_a_b')).needsOnboarding).toBe(false);
  });

  it('permits a completed first-week athlete regardless of a pending marker', async () => {
    const user = 'completed-local-athlete';
    service.saveOnboardingState(user, {
      ...service.defaultOnboardingState(),
      firstWeekSetupStartedAt: '2026-11-02T15:00:00.000Z',
      completedAt: '2026-11-02T15:10:00.000Z',
    });
    expect((await service.evaluateFirstRun(user)).needsOnboarding).toBe(false);
  });
});
