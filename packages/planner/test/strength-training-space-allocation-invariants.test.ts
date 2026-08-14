import { describe, expect, it } from 'vitest';

import {
  allocateStrengthTrainingSpaces,
} from '../src/strength-training-space-allocation';

describe('strength training space allocation invariants', () => {
  it('assigns locations without changing weekly session structure', () => {
    const sessions = [
      {
        id: 'swim-tue',
        date: '2026-08-18',
        discipline: 'swim',
        title: 'Technique swim',
        durationMinutes: 45,
        intensity: 'easy',
        recoveryCost: 2,
        lowerBodyDemand: 'low',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
      },
      {
        id: 'strength-wed',
        date: '2026-08-19',
        discipline: 'strength',
        title: 'Full-body strength',
        durationMinutes: 40,
        intensity: 'moderate',
        recoveryCost: 4,
        lowerBodyDemand: 'moderate',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
        strengthPrescription: {
          gymValue: 'high',
          lowerBodyDose: 'moderate',
        },
      },
      {
        id: 'run-fri',
        date: '2026-08-21',
        discipline: 'run',
        title: 'Easy return-to-run',
        durationMinutes: 28,
        intensity: 'easy',
        recoveryCost: 2,
        lowerBodyDemand: 'moderate',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
      },
      {
        id: 'strength-sat',
        date: '2026-08-22',
        discipline: 'strength',
        title: 'Swim-support strength',
        durationMinutes: 36,
        intensity: 'easy',
        recoveryCost: 3,
        lowerBodyDemand: 'low',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
        strengthPrescription: {
          gymValue: 'low',
          lowerBodyDose: 'light',
        },
      },
    ] as any;

    const before = sessions.map((session: any) => ({
      id: session.id,
      date: session.date,
      discipline: session.discipline,
      durationMinutes: session.durationMinutes,
      title: session.title,
    }));

    const allocated = allocateStrengthTrainingSpaces({
      sessions,
      homeSpace: {
        id: 'home',
        name: 'Home',
        environment: 'home',
      },
      gymSpace: {
        id: 'gym',
        name: 'Gym',
        environment: 'gym',
      },
      preferredHomeSessions: 1,
      preferredGymSessions: 1,
      preferGymOnSwimDays: true,
    });

    const after = allocated.map((session) => ({
      id: session.id,
      date: session.date,
      discipline: session.discipline,
      durationMinutes: session.durationMinutes,
      title: session.title,
    }));

    expect(after).toEqual(before);

    expect(allocated).toHaveLength(sessions.length);

    expect(
      allocated.filter((session) => session.discipline === 'strength'),
    ).toHaveLength(2);

    expect(
      allocated.filter((session) => session.trainingEnvironment === 'gym'),
    ).toHaveLength(1);

    expect(
      allocated.filter((session) => session.trainingEnvironment === 'home'),
    ).toHaveLength(1);
  });

  it('prefers a pool-stackable strength session for Gym when swim-day consolidation is enabled', () => {
    const sessions = [
      {
        id: 'swim-tue',
        date: '2026-08-18',
        discipline: 'swim',
        title: 'Technique swim',
        durationMinutes: 45,
        intensity: 'easy',
        recoveryCost: 2,
        lowerBodyDemand: 'low',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
      },
      {
        id: 'strength-heavy',
        date: '2026-08-19',
        discipline: 'strength',
        title: 'Heavy lower-body strength',
        durationMinutes: 52,
        intensity: 'hard',
        recoveryCost: 4,
        lowerBodyDemand: 'high',
        keySession: true,
        planningCommitment: 'generated',
        rationale: [],
        progressionTarget: 'strength_intensity',
        strengthPrescription: {
          gymValue: 'high',
          lowerBodyDose: 'high',
        },
      },
      {
        id: 'strength-support',
        date: '2026-08-20',
        discipline: 'strength',
        title: 'Support strength',
        durationMinutes: 40,
        intensity: 'moderate',
        recoveryCost: 3,
        lowerBodyDemand: 'moderate',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
        strengthPrescription: {
          gymValue: 'moderate',
          lowerBodyDose: 'moderate',
        },
      },
      {
        id: 'strength-light',
        date: '2026-08-21',
        discipline: 'strength',
        title: 'Light strength',
        durationMinutes: 30,
        intensity: 'easy',
        recoveryCost: 2,
        lowerBodyDemand: 'low',
        keySession: false,
        planningCommitment: 'generated',
        rationale: [],
        strengthPrescription: {
          gymValue: 'low',
          lowerBodyDose: 'light',
        },
      },
    ] as any;

    const allocated = allocateStrengthTrainingSpaces({
      sessions,
      homeSpace: {
        id: 'home',
        name: 'Home',
        environment: 'home',
      },
      gymSpace: {
        id: 'gym',
        name: 'Gym',
        environment: 'gym',
      },
      preferredHomeSessions: 2,
      preferredGymSessions: 1,
      preferGymOnSwimDays: true,
    });

    const heavy = allocated.find((session) => session.id === 'strength-heavy');
    const support = allocated.find((session) => session.id === 'strength-support');
    const light = allocated.find((session) => session.id === 'strength-light');

    expect(heavy?.trainingEnvironment).toBe('home');
    expect(support?.trainingEnvironment).toBe('gym');
    expect(light?.trainingEnvironment).toBe('home');
  });

});
