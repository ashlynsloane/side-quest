import type { Exercise } from '@circuit/domain';
import { exerciseSeed } from '@circuit/exercise-content';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listCustomExercises } from './database';

export async function loadExerciseCatalog(): Promise<Exercise[]> {
  const custom = await listCustomExercises();
  const byId = new Map<string, Exercise>();
  for (const exercise of exerciseSeed) byId.set(exercise.id, exercise);
  for (const exercise of custom) {
    if (exercise.status === 'active' && exercise.defaultEnabled) byId.set(exercise.id, exercise);
  }
  return [...byId.values()];
}

export function useExerciseCatalog(): {
  exercises: Exercise[];
  customCount: number;
  reload: () => Promise<void>;
  loading: boolean;
} {
  const [exercises, setExercises] = useState<Exercise[]>(exerciseSeed);
  const [customCount, setCustomCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const catalog = await loadExerciseCatalog();
      setExercises(catalog);
      setCustomCount(catalog.filter((exercise) => exercise.id.startsWith('custom_')).length);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void reload();
  }, [reload]));

  return { exercises, customCount, reload, loading };
}
