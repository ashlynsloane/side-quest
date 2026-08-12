import { describe, expect, it } from 'vitest';
import type { WholeAthletePlannedSession } from '../src/whole-athlete-week';
import { allocateStrengthTrainingSpaces } from '../src/strength-training-space-allocation';

function session(
  id: string,
  date: string,
  discipline: WholeAthletePlannedSession['discipline'],
  intensity: WholeAthletePlannedSession['intensity'],
  keySession = false,
  progressionTarget?: WholeAthletePlannedSession['progressionTarget'],
): WholeAthletePlannedSession {
  return {
    id,
    date,
    title: id,
    discipline,
    durationMinutes: discipline === 'strength' ? 40 : 45,
    intensity,
    cardiovascularDemand: discipline === 'strength' ? 'low' : 'moderate',
    musculoskeletalDemand: discipline === 'strength' ? 'moderate' : 'low',
    lowerBodyDemand: discipline === 'strength' ? 'moderate' : 'low',
    upperBodyDemand: discipline === 'swim' ? 'moderate' : 'low',
    impact: 'none',
    technicalDemand: 'moderate',
    recoveryCost: intensity === 'hard' ? 4 : 2,
    priority: keySession ? 'required' : 'recommended',
    source: 'side_quest',
    keySession,
    planningCommitment: 'generated',
    rationale: ['Base planner rationale.'],
    healthAdjusted: false,
    progressionTarget,
  };
}

const home = { id: 'home', name: 'Home', environment: 'home' as const };
const gym = { id: 'gym', name: 'Gym', environment: 'gym' as const };

describe('strength training-space allocation', () => {
  it('allocates a three-session strength week as two home and one gym by default', () => {
    const sessions = [
      session('strength-a', '2026-08-10', 'strength', 'moderate'),
      session('strength-b', '2026-08-12', 'strength', 'hard', true, 'strength_intensity'),
      session('strength-c', '2026-08-14', 'strength', 'moderate'),
    ];

    const result = allocateStrengthTrainingSpaces({ sessions, homeSpace: home, gymSpace: gym });
    const strength = result.filter((item) => item.discipline === 'strength');

    expect(strength.filter((item) => item.trainingEnvironment === 'home')).toHaveLength(2);
    expect(strength.filter((item) => item.trainingEnvironment === 'gym')).toHaveLength(1);
    expect(result.find((item) => item.id === 'strength-b')?.trainingEnvironment).toBe('gym');
  });

  it('prefers the gym assignment on a swim day when physiological priority is otherwise similar', () => {
    const sessions = [
      session('strength-a', '2026-08-10', 'strength', 'moderate'),
      session('strength-b', '2026-08-12', 'strength', 'moderate'),
      session('strength-c', '2026-08-14', 'strength', 'moderate'),
      session('swim', '2026-08-12', 'swim', 'moderate'),
    ];

    const result = allocateStrengthTrainingSpaces({ sessions, homeSpace: home, gymSpace: gym });
    expect(result.find((item) => item.id === 'strength-b')?.trainingEnvironment).toBe('gym');
  });

  it('does not move sessions or alter endurance disciplines', () => {
    const sessions = [
      session('strength-a', '2026-08-10', 'strength', 'moderate'),
      session('swim', '2026-08-11', 'swim', 'moderate'),
    ];

    const result = allocateStrengthTrainingSpaces({
      sessions,
      homeSpace: home,
      gymSpace: gym,
      preferredGymSessions: 0,
      preferredHomeSessions: 1,
    });

    expect(result.map((item) => [item.id, item.date, item.discipline])).toEqual(
      sessions.map((item) => [item.id, item.date, item.discipline]),
    );
    expect(result.find((item) => item.id === 'swim')?.trainingEnvironment).toBeUndefined();
  });

  it('keeps assignment subordinate to the already-built weekly plan', () => {
    const sessions = [
      session('strength-hard', '2026-08-13', 'strength', 'hard', true, 'strength_intensity'),
      session('strength-easy', '2026-08-15', 'strength', 'easy'),
    ];

    const result = allocateStrengthTrainingSpaces({
      sessions,
      homeSpace: home,
      gymSpace: gym,
      preferredGymSessions: 1,
      preferredHomeSessions: 1,
    });

    expect(result.find((item) => item.id === 'strength-hard')?.trainingEnvironment).toBe('gym');
    expect(result.find((item) => item.id === 'strength-easy')?.trainingEnvironment).toBe('home');
    expect(result.find((item) => item.id === 'strength-hard')?.rationale.length).toBeGreaterThan(1);
  });
});
