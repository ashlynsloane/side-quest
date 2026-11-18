import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MILESTONE_1_WORKOUT_TOGETHER_ENABLED } from
  '../../../apps/mobile/src/services/milestone-one-scope';

function mobileFile(path: string): string {
  return readFileSync(new URL('../../../apps/mobile/src/' + path, import.meta.url), 'utf8');
}

describe('Milestone 1 shared-workout deferral contract', () => {
  it('keeps Workout Together disabled by default, without a mutable athlete preference', () => {
    expect(MILESTONE_1_WORKOUT_TOGETHER_ENABLED).toBe(false);
    const scope = mobileFile('services/milestone-one-scope.ts');
    expect(scope).toContain('MILESTONE_1_WORKOUT_TOGETHER_ENABLED = false');
    expect(scope).not.toContain('localStorage');
    expect(scope).not.toContain('process.env');
  });

  it.each([
    ['workout-together.tsx', 'WorkoutTogetherExperience'],
    ['workout-room.tsx', 'WorkoutRoomExperience'],
    ['together-session.tsx', 'TogetherSessionExperience'],
  ])('prevents a direct link to %s from mounting the shared experience', (route, internal) => {
    const source = mobileFile('app/' + route);
    const gated = source.indexOf('if (!MILESTONE_1_WORKOUT_TOGETHER_ENABLED)');
    const deferred = source.indexOf('return <DeferredWorkoutTogetherScreen />;');
    const experience = source.indexOf('function ' + internal + '()');
    expect(gated).toBeGreaterThan(-1);
    expect(deferred).toBeGreaterThan(gated);
    expect(experience).toBeGreaterThan(deferred);
  });

  it('removes the in-preview shared start control and blocks accidental calls', () => {
    const source = mobileFile('app/workout-preview.tsx');
    expect(source).toContain('if (!MILESTONE_1_WORKOUT_TOGETHER_ENABLED) return;');
    expect(source).toContain('{MILESTONE_1_WORKOUT_TOGETHER_ENABLED ? (');
    expect(source).toContain('Start this workout together');
  });

  it('does not show or accept invitations or offer new invites in Friends', () => {
    const source = mobileFile('app/friends.tsx');
    expect(source).toContain('if(!MILESTONE_1_WORKOUT_TOGETHER_ENABLED');
    expect(source).toContain('MILESTONE_1_WORKOUT_TOGETHER_ENABLED && invitations.length');
    expect(source).toContain('{MILESTONE_1_WORKOUT_TOGETHER_ENABLED ? <Pressable');
    expect(source).toContain('setInvitations(MILESTONE_1_WORKOUT_TOGETHER_ENABLED ? nextInvitations : [])');
  });

  it('hides the optional Train workspace card while retaining ordinary workouts', () => {
    const source = mobileFile('ui/v29/TrainWorkspaceScreen.tsx');
    expect(source).toContain('MILESTONE_1_WORKOUT_TOGETHER_ENABLED && model.workoutTogether');
    expect(source).toContain('model.recommended.length');
    expect(source).toContain('model.savedAndRecent.length');
    const preview = mobileFile('app/workout-preview.tsx');
    expect(preview).toContain('<V23PrimaryButton onPress={start}');
  });

  it('preserves underlying shared module for future development, not data deletion', () => {
    const implementation = mobileFile('services/workout-together.ts');
    expect(implementation).toContain('export async function createWorkoutRoom');
    expect(implementation).toContain('export async function joinWorkoutRoom');
    expect(implementation).toContain('export async function startWorkoutRoom');
    const deferred = mobileFile('components/milestone-one-deferred-workout-together.tsx');
    expect(deferred).toContain('Return to solo training');
    expect(deferred).not.toContain('delete');
  });
});
