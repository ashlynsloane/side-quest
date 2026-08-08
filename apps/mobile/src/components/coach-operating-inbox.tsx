import type { CoachSemanticStrategyChange } from '@circuit/planner/coach-semantic-frame';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { RaceStrategyContextCard } from '@/components/race-strategy-context-card';
import type { CoachOperatingInboxItem } from '@/services/coach-operating-inbox';
import {
  approveCurrentCoachStrategyDraft,
  discardCurrentCoachStrategyDraft,
  loadCoachStrategyReview,
  stopApprovedCoachStrategy,
  type CoachStrategyReview,
} from '@/services/coach-strategy-runtime';
import { useTheme } from '@/state/theme-context';

export function CoachOperatingInboxPanel({ items }: { items: CoachOperatingInboxItem[] }) {
  const { tokens } = useTheme();
  const styles = makeStyles(tokens);
  const [strategyReview, setStrategyReview] = useState<CoachStrategyReview | null>(null);
  const [strategyBusy, setStrategyBusy] = useState(false);
  const [strategyFeedback, setStrategyFeedback] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadCoachStrategyReview().then((next) => {
      if (!live) return;
      setStrategyReview((previous) => sameReview(previous, next) ? previous : next);
    }).catch(() => undefined);
    return () => { live = false; };
  });

  const strategy = strategyReview?.hasUnapprovedChanges
    ? strategyReview.draft
    : strategyReview?.approved?.strategy;
  const strategyIsDraft = Boolean(strategyReview?.hasUnapprovedChanges && strategyReview.draft);
  if (!items.length && !strategy) return null;

  async function refreshStrategyReview() {
    const next = await loadCoachStrategyReview();
    setStrategyReview(next);
  }

  async function applyStrategy() {
    if (strategyBusy) return;
    setStrategyBusy(true);
    setStrategyFeedback(null);
    try {
      await approveCurrentCoachStrategyDraft();
      await refreshStrategyReview();
      setStrategyFeedback('Strategy applied. Side Quest replanned the block through the same safety, phase, and time-budget rules.');
    } catch (caught) {
      setStrategyFeedback(caught instanceof Error ? caught.message : 'Side Quest could not apply that strategy safely.');
    } finally {
      setStrategyBusy(false);
    }
  }

  async function discardStrategyDraft() {
    if (strategyBusy) return;
    setStrategyBusy(true);
    setStrategyFeedback(null);
    try {
      await discardCurrentCoachStrategyDraft();
      await refreshStrategyReview();
      setStrategyFeedback('Strategy draft discarded. The currently approved plan emphasis was left unchanged.');
    } catch (caught) {
      setStrategyFeedback(caught instanceof Error ? caught.message : 'Side Quest could not discard that strategy draft.');
    } finally {
      setStrategyBusy(false);
    }
  }

  async function stopStrategy() {
    if (strategyBusy) return;
    setStrategyBusy(true);
    setStrategyFeedback(null);
    try {
      await stopApprovedCoachStrategy();
      await refreshStrategyReview();
      setStrategyFeedback('Strategy emphasis stopped. Side Quest returned to the goal- and phase-based planning defaults.');
    } catch (caught) {
      setStrategyFeedback(caught instanceof Error ? caught.message : 'Side Quest could not stop that strategy safely.');
    } finally {
      setStrategyBusy(false);
    }
  }

  return (
    <View style={styles.stack}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>COACH ATTENTION</Text>
        <Text style={styles.title}>What matters next</Text>
      </View>

      <RaceStrategyContextCard surface="coach" />

      {strategy ? (
        <View style={[styles.card, styles.strategyCard]}>
          <View style={styles.topRow}>
            <Text style={styles.strategyLevel}>{strategyIsDraft ? 'STRATEGY DRAFT' : 'ACTIVE STRATEGY'}</Text>
            <Text style={styles.action}>{strategyIsDraft ? 'APPROVAL REQUIRED' : 'ACTIVE'}</Text>
          </View>
          <Text style={styles.itemTitle}>{strategyTitle(strategy)}</Text>
          <Text style={styles.body}>{strategyBody(strategy)}</Text>
          <Text style={styles.reason}>
            {strategyIsDraft
              ? 'Nothing in the training plan changes until you approve this allocation strategy.'
              : 'Health constraints, fixed commitments, race phase, and the weekly time budget still outrank this preference.'}
          </Text>
          <View style={styles.strategyActions}>
            {strategyIsDraft ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void applyStrategy()}
                  disabled={strategyBusy}
                  style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed, strategyBusy && styles.disabled]}
                >
                  {strategyBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryActionText}>Apply strategy</Text>}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void discardStrategyDraft()}
                  disabled={strategyBusy}
                  style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, strategyBusy && styles.disabled]}
                >
                  <Text style={styles.secondaryActionText}>Discard draft</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => void stopStrategy()}
                disabled={strategyBusy}
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed, strategyBusy && styles.disabled]}
              >
                {strategyBusy ? <ActivityIndicator color={tokens.text} /> : <Text style={styles.secondaryActionText}>Stop strategy</Text>}
              </Pressable>
            )}
          </View>
          {strategyFeedback ? <Text style={styles.feedback}>{strategyFeedback}</Text> : null}
        </View>
      ) : null}

      {items.map((item) => (
        <View key={item.id} style={[styles.card, item.level === 'protection' && styles.protection]}>
          <View style={styles.topRow}>
            <Text style={[styles.level, item.level === 'protection' && styles.protectionText]}>{label(item.level)}</Text>
            <Text style={styles.action}>{item.actionable ? 'REVIEW' : 'FYI'}</Text>
          </View>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.reason}>{item.reason}</Text>
        </View>
      ))}
    </View>
  );
}

function strategyTitle(strategy: CoachSemanticStrategyChange): string {
  if (strategy.primaryFocus) return `${titleCase(strategy.primaryFocus)} emphasis`;
  const first = Object.entries(strategy.disciplineObjectives)[0];
  return first ? `${titleCase(first[0])}: ${friendlyObjective(String(first[1]))}` : 'Training allocation strategy';
}

function strategyBody(strategy: CoachSemanticStrategyChange): string {
  const objectives = Object.entries(strategy.disciplineObjectives)
    .filter(([, objective]) => Boolean(objective))
    .map(([discipline, objective]) => `${titleCase(discipline)} · ${friendlyObjective(String(objective))}`);
  const pieces = objectives.length ? [objectives.join('  •  ')] : [];
  if (strategy.tradeoffTolerance) pieces.push(`Tradeoff: ${strategy.tradeoffTolerance.replaceAll('_', ' ')}`);
  if (strategy.startsAt || strategy.endsAt) pieces.push(`Window: ${formatDate(strategy.startsAt) ?? 'now'} → ${formatDate(strategy.endsAt) ?? 'open-ended'}`);
  if (strategy.racePriority?.objective) {
    const discipline = strategy.racePriority.discipline ? `${titleCase(strategy.racePriority.discipline)} ` : '';
    pieces.push(`Race priority: ${discipline}${strategy.racePriority.objective.replaceAll('_', ' ')}`);
  }
  return pieces.join('\n');
}

function sameReview(left: CoachStrategyReview | null, right: CoachStrategyReview | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function friendlyObjective(value: string): string {
  return value.replaceAll('_', ' ');
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function label(level: CoachOperatingInboxItem['level']): string {
  if (level === 'protection') return 'PROTECTION';
  if (level === 'check_in') return 'CHECK-IN';
  if (level === 'suggestion') return 'SUGGESTION';
  return 'INFO';
}

function makeStyles(tokens: ReturnType<typeof useTheme>['tokens']) {
  return StyleSheet.create({
    stack: { gap: 10 },
    header: { gap: 2 },
    eyebrow: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.05 },
    title: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
    card: { borderWidth: 1, borderColor: tokens.border, borderRadius: 17, backgroundColor: tokens.surface, padding: 15, gap: 6 },
    strategyCard: { borderColor: tokens.accent },
    protection: { borderColor: tokens.danger },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    level: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    strategyLevel: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    protectionText: { color: tokens.danger },
    action: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 12, fontWeight: '800', letterSpacing: 0.7 },
    itemTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
    body: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
    reason: { color: tokens.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
    strategyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
    primaryAction: { minHeight: 40, borderRadius: 12, backgroundColor: tokens.accent, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    primaryActionText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '800' },
    secondaryAction: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    secondaryActionText: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    feedback: { color: tokens.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
    pressed: { opacity: 0.76 },
    disabled: { opacity: 0.55 },
  });
}
