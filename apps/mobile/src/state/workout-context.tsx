import type { GeneratedWorkout, PlannedStrengthSession, WorkoutRecommendationExplanation } from '@circuit/domain';
import { exerciseSeed } from '@circuit/exercise-content';
import { assessActiveWorkoutMutation, type TrainingGuardrailResult, type WorkoutMutationDecision } from '@circuit/planner';
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

import {
  clearLiveWorkoutSession,
  createInitialLiveWorkoutSession,
  loadLiveWorkoutSession,
  saveLiveWorkoutSession,
  type ActiveWorkoutPlanLink,
} from '@/services/active-workout-persistence';
import { assessWorkoutStart } from '@/services/training-addition-gate';
import { createGuardedWorkoutStartGate } from '@/services/guarded-workout-start';
import { acquireSynchronizedWorkoutLease } from '@/services/server-training-ledger';
import {
  cloudWorkoutLeasesEnabled,
  releaseCloudWorkoutLease,
} from '@/services/cloud-workout-coordination';
import { useAuth } from '@/state/auth-context';
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
  beginWorkout: (workout: GeneratedWorkout, options?: { overrideReason?: string }) => Promise<{
    started: boolean;
    result: TrainingGuardrailResult;
  }>;
  updateActiveWorkout: (workout: GeneratedWorkout) => WorkoutMutationDecision;
  clearActiveWorkout: () => void;
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
  const startGate = useRef(createGuardedWorkoutStartGate()).current;
  const latestAthleteId = useRef<string | null>(null);
  latestAthleteId.current = user?.id ?? null;
  const restoredForAthlete = useRef<string | null>(null);
  const activeWorkoutSnapshot = useRef<GeneratedWorkout | null>(null);
  const [previewWorkout, setPreviewWorkoutState] = useState<GeneratedWorkout | null>(null);
  const [previewExplanation, setPreviewExplanation] = useState<WorkoutRecommendationExplanation | null>(null);
  const [plannedPreviewSource, setPlannedPreviewSource] = useState<PlannedPreviewSource | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<GeneratedWorkout | null>(null);
  const [activePlanLink, setActivePlanLink] = useState<ActiveWorkoutPlanLink | null>(null);
  const [workoutSessionReady, setWorkoutSessionReady] = useState(false);
  const [restoredActiveWorkout, setRestoredActiveWorkout] = useState(false);
  activeWorkoutSnapshot.current = activeWorkout;

  useEffect(() => {
    let live = true;
    restoredForAthlete.current = null;
    activeWorkoutSnapshot.current = null;
    setWorkoutSessionReady(false);
    setActiveWorkout(null);
    setActivePlanLink(null);
    setRestoredActiveWorkout(false);
    if (!user?.id) return () => { live = false; };
    void loadLiveWorkoutSession(user.id).then((snapshot) => {
      if (!live) return;
      if (snapshot) {
        activeWorkoutSnapshot.current = snapshot.workout;
        setActiveWorkout(snapshot.workout);
        setActivePlanLink(snapshot.planLink ?? null);
        setRestoredActiveWorkout(true);
      }
    }).catch(() => {
      // No checkpoint is considered loaded if storage is unavailable.
    }).finally(() => {
      if (live) {
        restoredForAthlete.current = user.id;
        setWorkoutSessionReady(true);
      }
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
    async beginWorkout(workout, options) {
      const planLink = buildPlanLink(plannedPreviewSource);
      return startGate.begin(workout, planLink, options?.overrideReason, {
        activeAthleteId: () => latestAthleteId.current,
        restoredForAthlete: (athleteId) =>
          workoutSessionReady && restoredForAthlete.current === athleteId,
        hasActiveSession: () => activeWorkoutSnapshot.current !== null,
        assess: assessWorkoutStart,
        createSnapshot: (proposed, source, lease) =>
          createInitialLiveWorkoutSession(
            proposed, new Date().toISOString(), source ?? undefined, lease,
          ),
        ...(user?.mode === 'cloud' && cloudWorkoutLeasesEnabled() ? {
          acquireRemoteLease: (proposed, source, owner) =>
            acquireSynchronizedWorkoutLease(owner, proposed, source?.sessionId),
          releaseRemoteLease: releaseCloudWorkoutLease,
        } : {}),
        persist: saveLiveWorkoutSession,
        discardPersisted: clearLiveWorkoutSession,
        onStarted(proposed, source) {
          activeWorkoutSnapshot.current = proposed;
          setActiveWorkout(proposed);
          setActivePlanLink(source);
          setRestoredActiveWorkout(false);
        },
      });
    },
    updateActiveWorkout(workout) {
      if (!activeWorkout) return {
        allowed: false,
        reasons: ['No authorized workout is active.'],
      };
      const decision = assessActiveWorkoutMutation(activeWorkout, workout);
      if (decision.allowed) {
        activeWorkoutSnapshot.current = workout;
        setActiveWorkout(workout);
      }
      return decision;
    },
    clearActiveWorkout() {
      const owner = latestAthleteId.current;
      // Do not approve another start until the previous checkpoint has been
      // durably removed. A failed delete must not be mistaken for clearance.
      restoredForAthlete.current = null;
      activeWorkoutSnapshot.current = null;
      setActiveWorkout(null);
      setActivePlanLink(null);
      setRestoredActiveWorkout(false);
      if (owner) {
        void clearLiveWorkoutSession(owner).then(() => {
          if (latestAthleteId.current === owner) restoredForAthlete.current = owner;
        }).catch(() => {
          // Keep starts disabled; reload will retry restoring the existing
          // checkpoint rather than silently allowing a second session.
        });
      }
    },
  }), [activePlanLink, activeWorkout, plannedPreviewSource, previewExplanation, previewWorkout, restoredActiveWorkout, workoutSessionReady, user?.id]);

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}

export function useWorkoutContext(): WorkoutContextValue {
  const value = useContext(WorkoutContext);
  if (!value) throw new Error('useWorkoutContext must be used within WorkoutProvider.');
  return value;
}