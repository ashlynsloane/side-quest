import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo, useState } from 'react';

import { V23Card, V23Chip, V23Icon } from '@/components/v23-ui';
import {
  beginEditingApprovedCoachStrategyWindow,
  beginNewCoachStrategyWindow,
  stopApprovedCoachStrategy,
  undoLatestCoachStrategyScheduleChange,
} from '@/services/coach-strategy-runtime';
import {
  formatStrategyWeek,
  seasonWindowStateLabel,
  type StrategyWorkspaceData,
} from '@/services/strategy-workspace';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function SeasonStrategyPlan({
  workspace,
  onChanged,
}: {
  workspace: StrategyWorkspaceData;
  onChanged: () => Promise<void> | void;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const windowsById = useMemo(
    () => new Map(workspace.review.schedule.windows.map((window) => [window.id, window])),
    [workspace.review.schedule.windows],
  );

  async function editWindow(id: string) {
    if (busyId) return;
    setBusyId(id);
    setFeedback(null);
    try {
      await beginEditingApprovedCoachStrategyWindow(id);
      setFeedback('That season block is loaded into the Strategy conversation. Refine it below, then approve the revised draft.');
      await onChanged();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not open that season block for editing.');
    } finally {
      setBusyId(null);
    }
  }

  async function addWindow() {
    if (busyId) return;
    setBusyId('new');
    setFeedback(null);
    try {
      await beginNewCoachStrategyWindow();
      setFeedback('New season block started. Describe its focus and date window in Strategy Coach below.');
      await onChanged();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not start a new season block.');
    } finally {
      setBusyId(null);
    }
  }

  function confirmRemove(id: string, label: string) {
    Alert.alert(
      'Remove season block?',
      `${label} will be removed from the approved season strategy. Race Intent will control those weeks unless another approved block covers them.`,
      [
        { text: 'Keep block', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void removeWindow(id) },
      ],
    );
  }

  async function removeWindow(id: string) {
    if (busyId) return;
    setBusyId(id);
    setFeedback(null);
    try {
      await stopApprovedCoachStrategy(id);
      setFeedback('Season block removed. The remaining windows were preserved and the plan was reconciled.');
      await onChanged();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not remove that season block safely.');
    } finally {
      setBusyId(null);
    }
  }

  async function undoLatest() {
    if (busyId || !workspace.review.latestRevision) return;
    setBusyId('undo');
    setFeedback(null);
    try {
      await undoLatestCoachStrategyScheduleChange();
      setFeedback('The last season strategy change was undone and the block was reconciled.');
      await onChanged();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Side Quest could not undo that season strategy change safely.');
    } finally {
      setBusyId(null);
    }
  }

  return <V23Card elevated style={styles.card}>
    <View style={styles.header}>
      <View style={styles.icon}><V23Icon name="plan" color={tokens.accent} size={20} /></View>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>SEASON STRATEGY</Text>
        <Text style={styles.title}>Plan focus blocks without rewriting the whole season.</Text>
      </View>
    </View>
    <Text style={styles.body}>Each approved block controls only its own planning weeks. Race Intent automatically fills the gaps, and no two Strategy Coach blocks can own the same week.</Text>

    {workspace.macrocycle.seasonWindows.length ? <View style={styles.windowList}>
      {workspace.macrocycle.seasonWindows.map((window, index) => {
        const approved = windowsById.get(window.id);
        const isEditing = workspace.review.editingWindowId === window.id;
        return <View key={window.id} style={styles.windowCard}>
          <View style={styles.windowTop}>
            <View style={styles.windowTitleCopy}>
              <Text style={styles.windowOrdinal}>BLOCK {index + 1}</Text>
              <Text style={styles.windowTitle}>{window.label}</Text>
            </View>
            <V23Chip tone={window.state === 'active' ? 'info' : window.state === 'scheduled' ? 'warm' : 'neutral'}>{seasonWindowStateLabel(window)}</V23Chip>
          </View>
          <Text style={styles.windowDates}>{windowRange(window.startsAt, window.endsAt)}</Text>
          {approved ? <Text style={styles.windowObjectives}>{strategySummary(approved.strategy)}</Text> : null}
          {isEditing ? <Text style={styles.editing}>Editing draft · changes are not applied until approval</Text> : null}
          <View style={styles.actions}>
            <Pressable
              onPress={() => void editWindow(window.id)}
              disabled={Boolean(busyId)}
              style={({ pressed }) => [styles.editAction, pressed && styles.pressed, busyId && styles.disabled]}
            >
              <Text style={styles.editText}>{isEditing ? 'Continue editing' : 'Edit block'}</Text>
            </Pressable>
            <Pressable
              onPress={() => confirmRemove(window.id, window.label)}
              disabled={Boolean(busyId)}
              style={({ pressed }) => [styles.removeAction, pressed && styles.pressed, busyId && styles.disabled]}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        </View>;
      })}
    </View> : <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No Strategy Coach blocks yet.</Text>
      <Text style={styles.emptyBody}>Race Intent is controlling the whole season. Add a focus block when you want a temporary specialization window.</Text>
    </View>}

    {workspace.macrocycle.handoffs.length ? <View style={styles.handoffBox}>
      <Text style={styles.handoffLabel}>PLANNED HANDOFFS</Text>
      {workspace.macrocycle.handoffs.map((handoff) => <Text key={`${handoff.weekStartDate}_${handoff.fromWindowId ?? 'race'}_${handoff.toWindowId ?? 'race'}`} style={styles.handoffText}>
        {formatStrategyWeek(handoff.weekStartDate)} · {handoffLabel(handoff.from, handoff.fromWindowId, windowsById)} → {handoffLabel(handoff.to, handoff.toWindowId, windowsById)}
      </Text>)}
    </View> : null}

    <View style={styles.footerActions}>
      <Pressable
        accessibilityRole="button"
        onPress={() => void addWindow()}
        disabled={Boolean(busyId)}
        style={({ pressed }) => [styles.addAction, pressed && styles.pressed, busyId && styles.disabled]}
      >
        <Text style={styles.addText}>+ Add focus block</Text>
      </Pressable>
      {workspace.review.latestRevision ? <Pressable
        accessibilityRole="button"
        onPress={() => void undoLatest()}
        disabled={Boolean(busyId)}
        style={({ pressed }) => [styles.undoAction, pressed && styles.pressed, busyId && styles.disabled]}
      >
        <Text style={styles.undoText}>Undo last season change</Text>
      </Pressable> : null}
    </View>
    {workspace.review.latestRevision ? <Text style={styles.revisionNote}>{revisionDescription(workspace.review.latestRevision.action)}</Text> : null}
    {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
  </V23Card>;
}

function windowRange(startsAt: string | undefined, endsAt: string | undefined): string {
  return `${startsAt ? formatStrategyWeek(startsAt) : 'Now'} → ${endsAt ? formatStrategyWeek(endsAt) : 'Open-ended'}`;
}

function strategySummary(strategy: StrategyWorkspaceData['review']['schedule']['windows'][number]['strategy']): string {
  const objectives = Object.entries(strategy.disciplineObjectives)
    .filter(([, objective]) => Boolean(objective))
    .map(([discipline, objective]) => `${titleCase(discipline)} · ${String(objective).replaceAll('_', ' ')}`);
  if (strategy.tradeoffTolerance) objectives.push(`Tradeoff · ${strategy.tradeoffTolerance.replaceAll('_', ' ')}`);
  return objectives.join('  •  ');
}

function handoffLabel(
  source: 'race_intent' | 'strategy_coach',
  windowId: string | undefined,
  windows: Map<string, StrategyWorkspaceData['review']['schedule']['windows'][number]>,
): string {
  if (source === 'race_intent') return 'Race Intent';
  const window = windowId ? windows.get(windowId) : undefined;
  if (!window) return 'Strategy Coach';
  const focus = window.strategy.primaryFocus;
  return focus ? `${titleCase(focus)} block` : 'Strategy Coach';
}

function revisionDescription(action: 'add' | 'update' | 'remove' | 'undo'): string {
  if (action === 'add') return 'Latest saved change: added a season block.';
  if (action === 'update') return 'Latest saved change: revised a season block.';
  if (action === 'remove') return 'Latest saved change: removed a season block.';
  return 'Latest saved change: restored the previous season strategy.';
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    card: { gap: 13, padding: 17 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1, minWidth: 0, gap: 2 },
    eyebrow: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.05 },
    title: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '900' },
    body: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 20 },
    windowList: { gap: 9 },
    windowCard: { borderRadius: 15, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 13, gap: 6 },
    windowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    windowTitleCopy: { flex: 1, minWidth: 0 },
    windowOrdinal: { color: tokens.textMuted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    windowTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 1 },
    windowDates: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '700' },
    windowObjectives: { color: tokens.text, fontSize: 11.5, lineHeight: 17 },
    editing: { color: tokens.accent, fontSize: 10.5, lineHeight: 15, fontWeight: '800' },
    actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 3 },
    editAction: { minHeight: 36, borderRadius: 11, backgroundColor: tokens.accentSoft, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    editText: { color: tokens.accent, fontSize: 12, lineHeight: 16, fontWeight: '800' },
    removeAction: { minHeight: 36, borderRadius: 11, borderWidth: 1, borderColor: tokens.border, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    removeText: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '800' },
    empty: { borderRadius: 14, backgroundColor: tokens.surfaceMuted, padding: 13, gap: 3 },
    emptyTitle: { color: tokens.text, fontSize: 14, lineHeight: 19, fontWeight: '800' },
    emptyBody: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },
    handoffBox: { borderRadius: 14, backgroundColor: tokens.surfaceMuted, padding: 12, gap: 4 },
    handoffLabel: { color: tokens.textMuted, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8 },
    handoffText: { color: tokens.text, fontSize: 11.5, lineHeight: 17, fontWeight: '700' },
    footerActions: { gap: 8 },
    addAction: { minHeight: 42, borderRadius: 12, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
    addText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '900' },
    undoAction: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
    undoText: { color: tokens.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
    revisionNote: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15 },
    feedback: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17, fontWeight: '700' },
    pressed: { opacity: 0.74 },
    disabled: { opacity: 0.5 },
  });
}
