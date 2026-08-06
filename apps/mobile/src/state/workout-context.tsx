import type { GeneratedWorkout } from '@circuit/domain';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type WorkoutContextValue = {
  previewWorkout: GeneratedWorkout | null;
  activeWorkout: GeneratedWorkout | null;
  setPreviewWorkout: (workout: GeneratedWorkout | null) => void;
  beginWorkout: (workout: GeneratedWorkout) => void;
  updateActiveWorkout: (workout: GeneratedWorkout) => void;
  clearActiveWorkout: () => void;
};

const WorkoutContext = createContext<WorkoutContextValue | null>(null);

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const [previewWorkout, setPreviewWorkout] = useState<GeneratedWorkout | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<GeneratedWorkout | null>(null);

  const value = useMemo<WorkoutContextValue>(() => ({
    previewWorkout,
    activeWorkout,
    setPreviewWorkout,
    beginWorkout(workout) {
      setActiveWorkout(workout);
    },
    updateActiveWorkout(workout) {
      setActiveWorkout(workout);
    },
    clearActiveWorkout() {
      setActiveWorkout(null);
    },
  }), [activeWorkout, previewWorkout]);

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}

export function useWorkoutContext(): WorkoutContextValue {
  const value = useContext(WorkoutContext);
  if (!value) throw new Error('useWorkoutContext must be used within WorkoutProvider.');
  return value;
}
