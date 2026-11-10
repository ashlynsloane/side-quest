import { describe, expect, it, vi } from 'vitest';
import type { GeneratedWorkout } from '@circuit/domain';
import { createExpoRouterAdapter, resolveCurrentExpoRoute } from '../src/ui/v30/expo-router-adapter';
import { createRuntimeOrchestrator } from '../src/services/runtime-orchestrator';
import { createRuntimeCommandsFromServices } from '../src/services/runtime-command-registry';
import { createGuardedWorkoutStartGate } from '../src/services/guarded-workout-start';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function harness() {
  const navigation: Array<{ method: string; to: unknown }> = [];
  const expo = {
    push: (to: unknown) => navigation.push({ method: 'push', to }),
    replace: (to: string) => navigation.push({ method: 'replace', to }),
  };
  return { expo, navigation, adapter: createExpoRouterAdapter(expo) };
}

describe('runtime navigation adapter with installed Expo routes', () => {
  it('translates conceptual check-in, build, favorites and preview routes', () => {
    const { adapter, navigation } = harness();
    for (const name of ['/check-in', '/train/build', '/train/saved', '/workout/preview']) {
      adapter.push(name);
    }
    expect(navigation.map((e) => e.to)).toEqual([
      '/today-check-in', '/generate', '/favorites', '/workout-preview',
    ]);
    expect(resolveCurrentExpoRoute('/daily-training-ceiling')).toBe('/daily-training-ceiling');
  });

  it('routes the tab controls to actual registered Expo paths', () => {
    const { adapter, navigation } = harness();
    const navigationRuntime = createRuntimeOrchestrator({ router: adapter });
    navigationRuntime.navigateToTab?.('plan');
    navigationRuntime.navigateToTab?.('train');
    expect(navigation.map((v) => v.to)).toEqual(['/(tabs)/plan', '/(tabs)/train']);
    expect(navigationRuntime.getActiveTab?.()).toBe('train');
  });

  it('preserves details when a runtime action navigates to preview', async () => {
    const { adapter, navigation } = harness();
    const runtime = createRuntimeOrchestrator({ router: adapter });
    runtime.dispatch({ workspace: 'train',
      action: { kind: 'preview_workout', workoutId: 'workout-7',
        actionId: 'preview-7', label: 'Preview', accessibilityLabel: 'Preview workout' },
    });
    await flush();
    expect(navigation[0]?.to).toEqual({
      pathname: '/workout-preview', params: { id: 'workout-7' },
    });
  });
});

describe('real runtime command and workout authorization boundary', () => {
  const workout = { id: 'workout-1', estimatedElapsedSeconds: 1200 } as GeneratedWorkout;

  it('never navigates to active-workout before an authorized durable checkpoint', async () => {
    const { adapter, navigation } = harness();
    const gate = createGuardedWorkoutStartGate();
    let active = false;
    const audits: string[] = [];
    const commands = createRuntimeCommandsFromServices({
      startWorkout: async () => {
        const result = await gate.begin(workout, null, undefined, {
          activeAthleteId: () => 'A',
          restoredForAthlete: () => true,
          hasActiveSession: () => active,
          assess: async () => {
            audits.push('authorization');
            return { authorized: true, result: {
              decision: 'allow', reasons: [], requiresReassessment: false,
            } };
          },
          createSnapshot: () => ({ workout }) as never,
          persist: async () => { audits.push('durable checkpoint'); },
          discardPersisted: async () => undefined,
          onStarted: () => { active = true; audits.push('active'); },
        });
        if (result.started) adapter.push('/active-workout');
      },
    });
    const runtime = createRuntimeOrchestrator({ router: adapter, commands });
    runtime.dispatch({ workspace: 'today', action: { kind: 'start', actionId: 'session-1', label: 'Start',
      accessibilityLabel: 'Start workout', primary: true } });
    await vi.waitFor(() => expect(navigation).toHaveLength(1));
    expect(audits).toEqual(['authorization', 'durable checkpoint', 'active']);
    expect(navigation[0]?.to).toBe('/active-workout');
  });

  it('a failed recovery guardrail never routes a runtime start to workout playback', async () => {
    const { adapter, navigation } = harness();
    const gate = createGuardedWorkoutStartGate();
    const commands = createRuntimeCommandsFromServices({
      startWorkout: async () => {
        const result = await gate.begin(workout, null, 'I want to do more', {
          activeAthleteId: () => 'A',
          restoredForAthlete: () => true,
          hasActiveSession: () => false,
          assess: async () => ({
            authorized: false, result: {
              decision: 'defer', reasons: ['Recovery not confirmed'],
              requiresReassessment: true, overrideAllowed: false,
            },
          }),
          createSnapshot: () => ({ workout }) as never,
          persist: vi.fn(async () => undefined),
          discardPersisted: vi.fn(async () => undefined),
          onStarted: vi.fn(),
        });
        if (result.started) adapter.push('/active-workout');
      },
    });
    const runtime = createRuntimeOrchestrator({ router: adapter, commands });
    runtime.dispatch({ workspace: 'train', action: {
      kind: 'start_workout', workoutId: 'workout-1', actionId: 'start-1',
      label: 'Start', accessibilityLabel: 'Start workout',
    } });
    await flush();
    expect(navigation).toHaveLength(0);
  });

  it('a resume action does not get rewritten into a new workout start', async () => {
    const { adapter, navigation } = harness();
    const start = vi.fn();
    const resume = vi.fn(async () => { adapter.push('/active-workout'); });
    const runtime = createRuntimeOrchestrator({
      router: adapter,
      commands: createRuntimeCommandsFromServices({
        startWorkout: start, resumeWorkout: resume,
      }),
    });
    runtime.dispatch({ workspace: 'workout', action: 'resume', workoutId: 'existing-1' });
    await vi.waitFor(() => expect(resume).toHaveBeenCalledWith('existing-1'));
    expect(start).not.toHaveBeenCalled();
    expect(navigation[0]?.to).toBe('/active-workout');
  });

  it('command failures trigger the existing error callback rather than a route change', async () => {
    const { adapter, navigation } = harness();
    const onError = vi.fn();
    const runtime = createRuntimeOrchestrator({
      router: adapter,
      commands: {
        startWorkout: async () => { throw new Error('storage cannot be opened'); },
        onError,
      },
    });
    runtime.dispatch({ workspace: 'today', action: { kind: 'start', actionId: 'S1', label: 'Start',
      accessibilityLabel: 'Start workout', primary: true } });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(navigation).toHaveLength(0);
  });
});
