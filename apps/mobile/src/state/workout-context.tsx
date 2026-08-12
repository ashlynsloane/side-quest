import type { GeneratedWorkout, PlannedStrengthSession, WorkoutRecommendationExplanation } from '@circuit/domain';
import { explainPlannedStrengthSession, type RecommendationExplanationContext } from '@circuit/planner';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
import { plannedStrengthDisplayName } from '@/services/training-synthesis';

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
  beginWorkout: (workout: GeneratedWorkout) => void;
  updateActiveWorkout: (workout: GeneratedWorkout, options?: { modifiedFromPlan?: boolean }) => void;
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

export function WorkoutProvider({ children }: { children: ReactNode }) {
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
      const source: PlannedPreviewSource = { session, context, modifiedFromPlan: false };
      setPreviewWorkoutState({ ...session.workout, name: plannedStrengthDisplayName(session) });
      setPlannedPreviewSource(source);
      setPreviewExplanation(explainPlannedStrengthSession(session, context));
    },
    beginWorkout(workout) {
      const planLink = buildPlanLink(plannedPreviewSource);
      const snapshot = createInitialLiveWorkoutSession(workout, new Date().toISOString(), planLink ?? undefined);
      setActiveWorkout(workout);
      setActivePlanLink(planLink);
      setRestoredActiveWorkout(false);
      void saveLiveWorkoutSession(snapshot);
    },
    updateActiveWorkout(workout, options) {
      setActiveWorkout(workout);
      if (options?.modifiedFromPlan) {
        setActivePlanLink((current) => current ? { ...current, modifiedFromPlan: true } : current);
      }
    },
    clearActiveWorkout() {
      setActiveWorkout(null);
      setActivePlanLink(null);
      setRestoredActiveWorkout(false);
      void clearLiveWorkoutSession();
    },
  }), [activePlanLink, activeWorkout, plannedPreviewSource, previewExplanation, previewWorkout, restoredActiveWorkout, workoutSessionReady]);

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}

export function useWorkoutContext(): WorkoutContextValue {
  const value = useContext(WorkoutContext);
  if (!value) throw new Error('useWorkoutContext must be used within WorkoutProvider.');
  return value;
}
