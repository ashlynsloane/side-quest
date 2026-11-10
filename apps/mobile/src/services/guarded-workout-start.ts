import type { GeneratedWorkout } from '@circuit/domain';
import type { TrainingGuardrailResult } from '@circuit/planner';
import type { ActiveWorkoutPlanLink, LiveWorkoutSessionSnapshot } from './active-workout-persistence';
import type { CloudWorkoutLease } from './cloud-workout-coordination';

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
    remoteLease?: CloudWorkoutLease,
  ): LiveWorkoutSessionSnapshot;
  persist(snapshot: LiveWorkoutSessionSnapshot, athleteId: string): Promise<void>;
  discardPersisted(athleteId: string): Promise<void>;
  /** Enabled only for authenticated accounts after the server migration. */
  acquireRemoteLease?: (
    workout: GeneratedWorkout,
    planLink: ActiveWorkoutPlanLink | null,
    athleteId: string,
  ) => Promise<CloudWorkoutLease>;
  releaseRemoteLease?: (lease: CloudWorkoutLease) => Promise<void>;
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

        // Local authorization alone does not protect against another device.
        // Cloud accounts can demand a server-issued, athlete-scoped lease.
        let remoteLease: CloudWorkoutLease | undefined;
        let attemptedCheckpointWrite = false;
        let activated = false;
        try {
          if (deps.acquireRemoteLease) {
            if (!deps.releaseRemoteLease) {
              throw new Error('Remote workout lease requires a release handler.');
            }
            remoteLease = await deps.acquireRemoteLease(workout, planLink, owner);
          }
          if (!validOwner()) {
            return defer('The athlete profile changed while acquiring the workout lock.');
          }
          const checkpoint = deps.createSnapshot(workout, planLink, remoteLease);
          attemptedCheckpointWrite = true;
          await deps.persist(checkpoint, owner);
          if (!validOwner()) {
            return defer('The athlete profile changed while saving the workout.');
          }
          deps.onStarted(workout, planLink);
          activated = true;
          return { started: true, result: assessment.result };
        } finally {
          if (!activated) {
            // A partially succeeded local write must be removed even if its
            // Promise rejected. The server token is separately released. A
            // remote release failure still has a short expiry and cannot be
            // converted into an unauthorized start.
            if (attemptedCheckpointWrite) {
              await deps.discardPersisted(owner).catch(() => undefined);
            }
            if (remoteLease) {
              await deps.releaseRemoteLease?.(remoteLease).catch(() => undefined);
            }
          }
        }
      } finally {
        starting = false;
      }
    },
  };
}
