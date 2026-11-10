import type { GeneratedWorkout } from '@circuit/domain';
import type { TrainingGuardrailResult } from '@circuit/planner';
import type { ActiveWorkoutPlanLink, LiveWorkoutSessionSnapshot } from './active-workout-persistence';

export interface GuardedStartOutcome {
  started: boolean;
  result: TrainingGuardrailResult;
}

export interface GuardedStartDependencies {
  activeAthleteId(): string | null;
  restoredForAthlete(id: string): boolean;
  hasActiveSession(): boolean;
  assess(input: {
    userId: string;
    workout: GeneratedWorkout;
    sessionId?: string;
    overrideReason?: string;
  }): Promise<{ authorized: boolean; result: TrainingGuardrailResult }>;
  createSnapshot(
    workout: GeneratedWorkout,
    planLink: ActiveWorkoutPlanLink | null,
  ): LiveWorkoutSessionSnapshot;
  persist(snapshot: LiveWorkoutSessionSnapshot, athleteId: string): Promise<void>;
  discardPersisted(athleteId: string): Promise<void>;
  onStarted(
    workout: GeneratedWorkout,
    planLink: ActiveWorkoutPlanLink | null,
  ): void;
}

const defer = (reason: string): GuardedStartOutcome => ({
  started: false,
  result: {
    decision: 'defer',
    reasons: [reason],
    requiresReassessment: true,
    overrideAllowed: false,
  },
});

/**
 * Shared async start boundary for the actual WorkoutProvider.
 *
 * No workout is made active before the assessment and durable checkpoint write
 * succeed. The caller's account and active-workout state are checked again
 * after every await, including in-flight account switches and double taps.
 * This prevents an interrupted authorization from activating a workout in a
 * different athlete's session.
 *
 * This lock is process-local; cross-device atomicity requires server support.
 */
export function createGuardedWorkoutStartGate() {
  let starting = false;

  return {
    isPending: () => starting,
    async begin(
      workout: GeneratedWorkout,
      planLink: ActiveWorkoutPlanLink | null,
      overrideReason: string | undefined,
      deps: GuardedStartDependencies,
    ): Promise<GuardedStartOutcome> {
      if (starting) return defer('A workout start is already being reviewed.');
      const owner = deps.activeAthleteId();
      if (!owner) return defer('Sign in before starting a workout.');
      if (!deps.restoredForAthlete(owner)) {
        return defer('Workout restoration must finish before starting a new session.');
      }
      if (deps.hasActiveSession()) {
        return defer('An active workout already exists. Resume or finish it before starting another.');
      }

      starting = true;
      try {
        const assessment = await deps.assess({
          userId: owner,
          workout,
          sessionId: planLink?.sessionId,
          overrideReason,
        });
        if (!assessment.authorized) {
          return { started: false, result: assessment.result };
        }
        const validOwner = () =>
          deps.activeAthleteId() === owner
          && deps.restoredForAthlete(owner)
          && !deps.hasActiveSession();
        if (!validOwner()) {
          return defer('The athlete profile or active session changed during authorization.');
        }

        const checkpoint = deps.createSnapshot(workout, planLink);
        await deps.persist(checkpoint, owner);
        if (!validOwner()) {
          // A profile change while persistence is in flight cannot activate
          // the stale athlete's checkpoint in the new athlete's UI.
          await deps.discardPersisted(owner);
          return defer('The athlete profile changed while saving the workout.');
        }
        deps.onStarted(workout, planLink);
        return { started: true, result: assessment.result };
      } finally {
        starting = false;
      }
    },
  };
}
