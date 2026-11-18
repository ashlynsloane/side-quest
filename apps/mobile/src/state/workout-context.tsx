import type { GeneratedWorkout, PlannedStrengthSession, WorkoutRecommendationExplanation } from '@circuit/domain';
import { exerciseSeed } from '@circuit/exercise-content';
import { explainPlannedStrengthSession, type RecommendationExplanationContext } from '@circuit/planner';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/state/auth-context';
import {
  assertCanStartLiveWorkout,
  clearLiveWorkoutSession,
  createInitialLiveWorkoutSession,
  loadLiveWorkoutSession,
  saveLiveWorkoutSession,
  type ActiveWorkoutPlanLink,
} from '@/services/active-workout-persistence';
import {
  commitAndHydrateRoutineNativeWorkout,
  recoverMissingRoutineNativeWorkout,
  finalizeAndClearNativeWorkout,
  getRoutineNativeRecoveryState,
} from '@/services/database';
import {
  generateWorkoutForAssignedTrainingSpace,
  trainingSpaceAssignmentForPlannedSession,
} from '@/services/training-space-runtime';

type PlannedPreviewSource = {
  session: PlannedStrengthSession;
  context: RecommendationExplanationContext;
  modifiedFromPlan: boolean;
};

type WorkoutContextValue = {
  previewWorkout: GeneratedWorkout | null;
  previewExplanation: WorkoutRecommendationExplanation | null;
  previewPlannedSession: PlannedStrengthSession | null;
  previewModifiedFromPlan: boolean;
  activeWorkout: GeneratedWorkout | null;
  activePlanLink: ActiveWorkoutPlanLink | null;
  workoutSessionReady: boolean;
  restoredActiveWorkout: boolean;
  setPreviewWorkout: (workout: GeneratedWorkout | null) => void;
  updatePreviewWorkout: (workout: GeneratedWorkout) => void;
  openPlannedWorkoutPreview: (session: PlannedStrengthSession, context?: RecommendationExplanationContext) => void;
  beginWorkout: (workout: GeneratedWorkout) => Promise<void>;
  beginAuthorizedRoutineWorkout: (input: {
    sessionId: string;
    expectedAuthorizationId: string;
    expectedObservationToken: string;
  }) => Promise<void>;
  recoverAuthorizedRoutineWorkout: (input: { sessionId: string }) => Promise<void>;
  updateActiveWorkout: (workout: GeneratedWorkout) => void;
  clearActiveWorkout: (options: {
    disposition: 'discarded' | 'completed';
    startedAt: string;
  }) => Promise<void>;
};

const WorkoutContext = createContext<WorkoutContextValue | null>(null);

function buildPlanLink(source: PlannedPreviewSource | null): ActiveWorkoutPlanLink | null {
  if (!source) return null;
  return {
    sessionId: source.session.id,
    sessionDate: source.session.date,
    sessionTitle: source.session.title,
    modifiedFromPlan: source.modifiedFromPlan,
  };
}

function resolvePlannedSessionForTrainingSpace(session: PlannedStrengthSession): PlannedStrengthSession {
  const assignment = trainingSpaceAssignmentForPlannedSession(session.id);
  if (!assignment?.trainingSpaceId) return session;

  const result = generateWorkoutForAssignedTrainingSpace({
    session: assignment,
    request: session.workout.request,
    context: { exercises: exerciseSeed },
  });
  if (!result?.ok) return session;

  const spaceName = assignment.trainingSpaceName ?? assignment.trainingEnvironment ?? 'Training space';
  const reason = assignment.trainingSpaceReason;
  return {
    ...session,
    title: session.title.includes(` · ${spaceName}`) ? session.title : `${session.title} · ${spaceName}`,
    rationale: reason ? `${session.rationale} ${reason}` : session.rationale,
    placementNote: reason ?? session.placementNote,
    workout: {
      ...result.workout,
      name: `${session.workout.name} · ${spaceName}`,
    },
  };
}

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [previewWorkout, setPreviewWorkoutState] = useState<GeneratedWorkout | null>(null);
  const [previewExplanation, setPreviewExplanation] = useState<WorkoutRecommendationExplanation | null>(null);
  const [plannedPreviewSource, setPlannedPreviewSource] = useState<PlannedPreviewSource | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<GeneratedWorkout | null>(null);
  const [activePlanLink, setActivePlanLink] = useState<ActiveWorkoutPlanLink | null>(null);
  const [workoutSessionReady, setWorkoutSessionReady] = useState(false);
  const [restoredActiveWorkout, setRestoredActiveWorkout] = useState(false);
  const startInFlight = useRef(false);
  const liveAthleteId = useRef(user?.id ?? null);
  liveAthleteId.current = user?.id ?? null;

  useEffect(() => {
    let live = true;
    if (!user) { setWorkoutSessionReady(true); return; }
    const athleteId = user.id;
    void (async () => {
      const snapshot = await loadLiveWorkoutSession(athleteId);
      if (!live) return;
      if (snapshot?.planLink?.sessionId) {
        // AuthProvider activates the owned SQLite file before exposing user.
        // An immutable native terminal event is authoritative: never render
        // the original paused checkpoint as a new workout after a crash.
        const state = await getRoutineNativeRecoveryState(
          athleteId, snapshot.planLink.sessionId,
        );
        if (!live) return;
        if (state.kind === 'terminal') {
          const original = state.checkpoint?.initialLiveSession;
          if (!original || original.startedAt !== snapshot.startedAt
            || original.workout.id !== snapshot.workout.id) {
            throw new Error('Terminal native workout audit and player checkpoint do not match.');
          }
          await clearLiveWorkoutSession(athleteId);
          return;
        }
      }
      if (snapshot && live) {
        setActiveWorkout(snapshot.workout);
        setActivePlanLink(snapshot.planLink ?? null);
        setRestoredActiveWorkout(true);
      }
    })().catch(() => {
      // Never auto-restore over unreadable, orphaned or foreign start history.
      // Both SQLite and local checkpoint bytes are retained for reconciliation.
    }).finally(() => {
      if (live) setWorkoutSessionReady(true);
    });
    return () => { live = false; };
  }, [user?.id]);

  const value = useMemo<WorkoutContextValue>(() => ({
    previewWorkout,
    previewExplanation,
    previewPlannedSession: plannedPreviewSource?.session ?? null,
    previewModifiedFromPlan: plannedPreviewSource?.modifiedFromPlan ?? false,
    activeWorkout,
    activePlanLink,
    workoutSessionReady,
    restoredActiveWorkout,
    setPreviewWorkout(workout) {
      setPreviewWorkoutState(workout);
      setPreviewExplanation(null);
      setPlannedPreviewSource(null);
    },
    updatePreviewWorkout(workout) {
      setPreviewWorkoutState(workout);
      if (!plannedPreviewSource) return;
      const nextSource = {
        ...plannedPreviewSource,
        session: { ...plannedPreviewSource.session, workout },
        modifiedFromPlan: true,
      };
      setPlannedPreviewSource(nextSource);
      setPreviewExplanation(explainPlannedStrengthSession(nextSource.session, nextSource.context));
    },
    openPlannedWorkoutPreview(session, context = {}) {
      const resolvedSession = resolvePlannedSessionForTrainingSpace(session);
      const source: PlannedPreviewSource = { session: resolvedSession, context, modifiedFromPlan: false };
      setPreviewWorkoutState(resolvedSession.workout);
      setPlannedPreviewSource(source);
      setPreviewExplanation(explainPlannedStrengthSession(resolvedSession, context));
    },
    async beginWorkout(workout) {
      // No generic path may replace an active or still-restorable session.
      // Explicit save/discard in the player owns that athlete decision.
      if (!workoutSessionReady || activeWorkout) {
        throw new Error('Finish or recover the active workout before starting another.');
      }
      if (startInFlight.current) {
        throw new Error('A workout start is already being saved.');
      }
      startInFlight.current = true;
      const athleteAtStart = user?.id ?? null;
      try {
        assertCanStartLiveWorkout(athleteAtStart);
        const planLink = buildPlanLink(plannedPreviewSource);
        const snapshot = createInitialLiveWorkoutSession(
          workout, new Date().toISOString(), planLink ?? undefined,
        );
        await saveLiveWorkoutSession(snapshot, athleteAtStart);
        if (liveAthleteId.current !== athleteAtStart) {
          throw new Error('Athlete profile changed before workout activation. Saved checkpoint retained.');
        }
        setActiveWorkout(workout);
        setActivePlanLink(planLink);
        setRestoredActiveWorkout(false);
      } finally {
        startInFlight.current = false;
      }
    },
    async beginAuthorizedRoutineWorkout(input) {
      // This is the ONLY guarded React entry for an approved revision. It
      // consumes the exact immutable SQLite workout, never the preview draft.
      if (startInFlight.current) {
        throw new Error('A workout start is already in progress.');
      }
      const athleteAtStart = user?.id ?? null;
      if (!athleteAtStart || !workoutSessionReady || activeWorkout) {
        throw new Error('Finish or recover the existing workout before starting an authorized routine.');
      }
      startInFlight.current = true;
      try {
        const earlier = await loadLiveWorkoutSession(athleteAtStart);
        if (earlier) {
          throw new Error('An earlier workout checkpoint exists. Finish or recover it first.');
        }
        if (liveAthleteId.current !== athleteAtStart) {
          throw new Error('Athlete profile changed before routine workout start.');
        }
        const idSuffix = new Date().toISOString() +
          '-' + Math.random().toString(36).slice(2, 12);
        const prepared = await commitAndHydrateRoutineNativeWorkout({
          athleteId: athleteAtStart,
          sessionId: input.sessionId,
          expectedAuthorizationId: input.expectedAuthorizationId,
          expectedObservationToken: input.expectedObservationToken,
          intentId: 'athlete-native-start-' + idSuffix,
          checkpointId: 'athlete-native-checkpoint-' + idSuffix,
          athleteExplicitlyRequestedStart: true,
        });
        if (prepared.athleteId !== athleteAtStart
          || prepared.authorizationId !== input.expectedAuthorizationId
          || prepared.sessionId !== input.sessionId
          || prepared.playerPlaybackStarted !== false
          || prepared.initialLiveSession.running !== false
          || prepared.initialLiveSession.planLink.sessionId !== input.sessionId) {
          throw new Error('Native routine recovery checkpoint identity mismatch.');
        }
        if (liveAthleteId.current !== athleteAtStart) {
          throw new Error('Athlete profile changed before workout hydration. Start audit retained.');
        }
        // The mobile service committed SQLite AND verified the local recovery
        // checkpoint under a single athlete-ownership lock. A failure in
        // either phase leaves React untouched; no automatic retry is allowed.
        if (liveAthleteId.current !== athleteAtStart) {
          throw new Error('Athlete profile changed after checkpoint save. Checkpoint retained.');
        }
        const restored = await loadLiveWorkoutSession(athleteAtStart);
        if (JSON.stringify(restored) !== JSON.stringify(prepared.initialLiveSession)) {
          throw new Error('The saved native routine checkpoint could not be verified.');
        }
        setActiveWorkout(prepared.initialLiveSession.workout);
        setActivePlanLink(prepared.initialLiveSession.planLink);
        // Paused native checkpoint: no timer or playback starts automatically.
        setRestoredActiveWorkout(true);
      } finally {
        startInFlight.current = false;
      }
    },
    async recoverAuthorizedRoutineWorkout(input) {
      const athleteAtStart = user?.id ?? null;
      if (!athleteAtStart || !workoutSessionReady || activeWorkout || startInFlight.current) {
        throw new Error('Resolve the active workout before recovering another session.');
      }
      startInFlight.current = true;
      try {
        const restored = await recoverMissingRoutineNativeWorkout({
          athleteId: athleteAtStart, sessionId: input.sessionId,
          athleteConfirmedRecovery: true,
        });
        if (liveAthleteId.current !== athleteAtStart) {
          throw new Error('Athlete profile changed during recovery; original checkpoint retained.');
        }
        const local = await loadLiveWorkoutSession(athleteAtStart);
        if (JSON.stringify(local) !== JSON.stringify(restored.initialLiveSession)) {
          throw new Error('Original recovered workout checkpoint is unreadable.');
        }
        setActiveWorkout(restored.initialLiveSession.workout);
        setActivePlanLink(restored.initialLiveSession.planLink);
        setRestoredActiveWorkout(true);
      } finally {
        startInFlight.current = false;
      }
    },
    updateActiveWorkout(workout) {
      setActiveWorkout(workout);
    },
    async clearActiveWorkout(options) {
      if (startInFlight.current) {
        throw new Error('Wait for the pending workout start to finish before clearing it.');
      }
      const athleteAtClear = user?.id ?? null;
      if (!athleteAtClear || !options?.startedAt?.trim()) {
        throw new Error('Clearing a workout requires its original athlete and start time.');
      }
      // An immutable terminal event is committed BEFORE checkpoint cleanup.
      // If cleanup fails, retained React state and SQL audit enable retry.
      await finalizeAndClearNativeWorkout({
        athleteId: athleteAtClear,
        sessionId: activePlanLink?.sessionId ?? null,
        startedAt: options.startedAt,
        disposition: options.disposition,
      });
      if (liveAthleteId.current !== athleteAtClear) {
        throw new Error('Athlete profile changed while clearing workout; current state retained.');
      }
      setActiveWorkout(null);
      setActivePlanLink(null);
      setRestoredActiveWorkout(false);
    },
  }), [activePlanLink, activeWorkout, plannedPreviewSource, previewExplanation, previewWorkout, restoredActiveWorkout, workoutSessionReady, user?.id]);

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}

export function useWorkoutContext(): WorkoutContextValue {
  const value = useContext(WorkoutContext);
  if (!value) throw new Error('useWorkoutContext must be used within WorkoutProvider.');
  return value;
}