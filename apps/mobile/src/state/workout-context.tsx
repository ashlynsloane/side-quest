import type { GeneratedWorkout, PlannedStrengthSession, WorkoutRecommendationExplanation } from '@circuit/domain';
import { exerciseSeed } from '@circuit/exercise-content';
import type { TrainingGuardrailResult } from '@circuit/planner';
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
  updateActiveWorkout: (workout: GeneratedWorkout) => void;
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
  const startingWorkout = useRef(false);
  const [previewWorkout, setPreviewWorkoutState] = useState<GeneratedWorkout | null>(null);
  const [previewExplanation, setPreviewExplanation] = useState<WorkoutRecommendationExplanation | null>(null);
  const [plannedPreviewSource, setPlannedPreviewSource] = useState<PlannedPreviewSource | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<GeneratedWorkout | null>(null);
  const [activePlanLink, setActivePlanLink] = useState<ActiveWorkoutPlanLink | null>(null);
  const [workoutSessionReady, setWorkoutSessionReady] = useState(false);
  const [restoredActiveWorkout, setRestoredActiveWorkout] = useState(false);

  useEffect(() => {
    let live = true;
    void loadLiveWorkoutSession().then((snapshot) => {
      if (!live) return;
      if (snapshot) {
        setActiveWorkout(snapshot.workout);
        setActivePlanLink(snapshot.planLink ?? null);
        setRestoredActiveWorkout(true);
      }
      setWorkoutSessionReady(true);
    });
    return () => { live = false; };
  }, []);

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
      if (startingWorkout.current) return {
        started: false,
        result: {
          decision: 'defer' as const,
          reasons: ['A workout-start assessment is already in progress.'],
          requiresReassessment: true,
        },
      };
      if (!user?.id) return {
        started: false,
        result: {
          decision: 'defer' as const,
          reasons: ['Sign in or use a local athlete profile before starting a session.'],
          requiresReassessment: true,
        },
      };
      startingWorkout.current = true;
      try {
      const planLink = buildPlanLink(plannedPreviewSource);
      const assessment = await assessWorkoutStart({
        userId: user.id,
        workout,
        sessionId: planLink?.sessionId,
        overrideReason: options?.overrideReason,
      });
      if (!assessment.authorized) return { started: false, result: assessment.result };
      const snapshot = createInitialLiveWorkoutSession(workout, new Date().toISOString(), planLink ?? undefined);
      await saveLiveWorkoutSession(snapshot);
      setActiveWorkout(workout);
      setActivePlanLink(planLink);
      setRestoredActiveWorkout(false);
      return { started: true, result: assessment.result };
      } finally {
        startingWorkout.current = false;
      }
    },
    updateActiveWorkout(workout) {
      setActiveWorkout(workout);
    },
    clearActiveWorkout() {
      setActiveWorkout(null);
      setActivePlanLink(null);
      setRestoredActiveWorkout(false);
      void clearLiveWorkoutSession();
    },
  }), [activePlanLink, activeWorkout, plannedPreviewSource, previewExplanation, previewWorkout, restoredActiveWorkout, workoutSessionReady, user?.id]);

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}

export function useWorkoutContext(): WorkoutContextValue {
  const value = useContext(WorkoutContext);
  if (!value) throw new Error('useWorkoutContext must be used within WorkoutProvider.');
  return value;
}