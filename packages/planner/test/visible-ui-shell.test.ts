import { describe, expect, it } from 'vitest';
import { buildSideQuestShell, validateSideQuestShell } from '../src/visible-ui-shell';

describe('V29 visible UI shell', () => {
  it('builds the five-tab shell in the approved order', () => {
    const shell = buildSideQuestShell({ activeTab: 'today', unresolvedAttentionCount: 2 });
    expect(shell.navigation.map((item) => item.label)).toEqual(['Today', 'Train', 'Plan', 'Progress', 'You']);
    expect(shell.masthead.attentionCount).toBe(2);
    expect(validateSideQuestShell(shell)).toEqual([]);
  });

  it('keeps an interrupted workout recoverable across tabs', () => {
    const shell = buildSideQuestShell({
      activeTab: 'progress',
      activeWorkout: { workoutId: 'w1', workoutName: 'Ridgeline Relay', progressLabel: 'Station 2 · Round 3' },
    });
    expect(shell.activeWorkout?.resumeLabel).toBe('Resume');
    expect(shell.screenReaderOrder).toContain('active-workout-resume');
  });

  it('removes bottom navigation during the focused workout player', () => {
    const shell = buildSideQuestShell({ activeTab: 'train', workoutPlayerOpen: true });
    expect(shell.hideBottomNavigation).toBe(true);
    expect(shell.screenReaderOrder).not.toContain('primary-navigation');
  });
});
