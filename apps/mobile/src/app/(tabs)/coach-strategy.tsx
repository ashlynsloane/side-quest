import { useMemo } from 'react';

import { CoachModeSwitch } from '@/components/coach-mode-switch';
import { CoachStrategyWorkspace } from '@/components/coach-strategy-workspace';
import { SeasonStrategyPlanPanel } from '@/components/season-strategy-plan-panel';
import { V23Screen } from '@/components/v23-ui';
import { useTheme } from '@/state/theme-context';

export default function CoachStrategyScreen() {
  const { tokens } = useTheme();
  const contentStyle = useMemo(
    () => ({ gap: 18, paddingTop: 22, paddingBottom: 36, backgroundColor: tokens.canvas }),
    [tokens.canvas],
  );

  return <V23Screen contentStyle={contentStyle}>
    <CoachModeSwitch active="strategy" />
    <SeasonStrategyPlanPanel />
    <CoachStrategyWorkspace />
  </V23Screen>;
}
