import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { SeasonStrategyPlan } from '@/components/season-strategy-plan';
import { loadStrategyWorkspace, type StrategyWorkspaceData } from '@/services/strategy-workspace';

export function SeasonStrategyPlanPanel({ onWorkspaceChanged }: { onWorkspaceChanged?: () => void }) {
  const [workspace, setWorkspace] = useState<StrategyWorkspaceData | null>(null);

  const reload = useCallback(async () => {
    setWorkspace(await loadStrategyWorkspace());
    onWorkspaceChanged?.();
  }, [onWorkspaceChanged]);

  useFocusEffect(useCallback(() => {
    let live = true;
    void loadStrategyWorkspace().then((next) => { if (live) setWorkspace(next); }).catch(() => undefined);
    return () => { live = false; };
  }, []));

  if (!workspace) return null;
  return <SeasonStrategyPlan workspace={workspace} onChanged={reload} />;
}
