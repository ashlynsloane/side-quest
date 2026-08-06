import type { AutomaticReplanRecord, TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';
import {
  analyzePlanHealth,
  applyReplanProposals,
  buildReplanProposals,
  type PlanConflict,
  type PlanMoveProposal,
} from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getLatestPlanSnapshot,
  getLatestTrainingBlock,
  listAutomaticReplanRecords,
  markAutomaticReplanUndone,
  getTrainingCalendarEvents,
  markPlanSnapshotRestored,
  savePlanSnapshot,
  saveTrainingBlock,
  type PlanSnapshotRecord,
} from '@/services/database';

export default function AdaptivePlanScreen() {
  const router = useRouter();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);
  const [snapshot, setSnapshot] = useState<PlanSnapshotRecord | null>(null);
  const [automaticReplan, setAutomaticReplan] = useState<AutomaticReplanRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const saved = await getLatestTrainingBlock();
    const currentBlock = saved?.block ?? null;
    let calendarEvents: TrainingCalendarEvent[] = [];
    if (currentBlock?.weeks.length) {
      const from = `${currentBlock.weeks[0]?.weekStartDate ?? localIsoDate(new Date())}T00:00:00.000Z`;
      const finalWeek = currentBlock.weeks.at(-1);
      const to = `${addDays(finalWeek?.weekStartDate ?? localIsoDate(new Date()), 7)}T23:59:59.999Z`;
      calendarEvents = await getTrainingCalendarEvents({ from, to });
    }
    const [latestSnapshot, automaticRecords] = await Promise.all([getLatestPlanSnapshot(), listAutomaticReplanRecords(20)]);
    setBlock(currentBlock);
    setEvents(calendarEvents);
    setSnapshot(latestSnapshot);
    setAutomaticReplan(automaticRecords.find((record) => !record.undoneAt) ?? null);
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const health = useMemo(() => block ? analyzePlanHealth({ block, calendarEvents: events }) : null, [block, events]);
  const proposals = useMemo(() => block ? buildReplanProposals({ block, calendarEvents: events }) : [], [block, events]);

  async function applyMoves() {
    if (!block || proposals.length === 0 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await savePlanSnapshot(block, 'Before V18 automatic calendar replan');
      const updated = applyReplanProposals(block, proposals);
      await saveTrainingBlock(updated);
      setMessage(`${proposals.length} session${proposals.length === 1 ? ' was' : 's were'} moved. The original plan is available for one-tap undo.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  function confirmApply() {
    if (proposals.length === 0) return;
    Alert.alert(
      'Apply proposed moves?',
      'Only future planned sessions are moved. Completed and skipped sessions remain unchanged, and a restorable snapshot is saved first.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Apply moves', onPress: () => void applyMoves() },
      ],
    );
  }

  async function undoLatest() {
    if (!snapshot || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const restored: TrainingBlockPlan = {
        ...snapshot.block,
        id: `${snapshot.block.id}_restored_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      await saveTrainingBlock(restored);
      await markPlanSnapshotRestored(snapshot.id);
      await markAutomaticReplanUndone(snapshot.id);
      setMessage('The plan was restored to its pre-replan schedule.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹ Home</Text></Pressable>
        <Text style={styles.topTitle}>Adaptive plan</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!block || !health ? (
          <View style={styles.emptyCard}>
            <Text style={styles.title}>No active goal plan</Text>
            <Text style={styles.body}>Build a goal-based plan before scanning for calendar conflicts.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.hero, health.label === 'needs_attention' && styles.heroAttention]}>
              <Text style={styles.heroEyebrow}>SCHEDULE REVIEW</Text>
              <Text style={styles.heroTitle}>{health.headline}</Text>
              <Text style={styles.heroBody}>
                {health.highCount} high-priority · {health.moderateCount} moderate · {health.lowCount} low-priority item{health.lowCount === 1 ? '' : 's'}
              </Text>
              <Text style={styles.heroContext}>{health.context}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>What this scan checks</Text>
              <Text style={styles.body}>Same-day run, bike, or swim loading; designated rest days; tightly clustered strength sessions; taper and race-week fatigue; overdue workouts; and proximity to the event.</Text>
              <Text style={styles.helper}>This is scheduling support. It does not override a PT profile, active pain restriction, or clinician guidance.</Text>
            </View>

            {message ? <View style={styles.successCard}><Text style={styles.successText}>{message}</Text></View> : null}

            {automaticReplan ? (
              <View style={styles.autoCard}>
                <Text style={styles.autoEyebrow}>LATEST COMPLETED-ACTIVITY ADAPTATION</Text>
                <Text style={styles.autoTitle}>{automaticReplan.reason}</Text>
                <Text style={styles.helper}>{automaticReplan.movedSessionIds.length} future strength session{automaticReplan.movedSessionIds.length === 1 ? '' : 's'} moved · {formatDateTime(automaticReplan.createdAt)}</Text>
                <Text style={styles.helper}>A pre-change snapshot was saved before the move. Use the undo control below to restore it.</Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Detected conflicts</Text>
                <Text style={styles.countBadge}>{health.conflicts.length}</Text>
              </View>
              {health.conflicts.length === 0 ? (
                <Text style={styles.body}>No meaningful schedule conflict was detected in the remaining block.</Text>
              ) : health.conflicts.map((item) => <ConflictCard key={item.id} conflict={item} />)}
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Proposed fixes</Text>
                <Text style={styles.countBadge}>{proposals.length}</Text>
              </View>
              {proposals.length === 0 ? (
                <Text style={styles.body}>No safe automatic move was found inside the affected week. Use the Training Schedule screen to make a manual decision.</Text>
              ) : proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)}
            </View>

            {proposals.length > 0 ? (
              <Pressable disabled={busy} onPress={confirmApply} style={[styles.primaryButton, busy && styles.buttonDisabled]}>
                <Text style={styles.primaryText}>{busy ? 'Updating plan…' : `Apply ${proposals.length} proposed move${proposals.length === 1 ? '' : 's'}`}</Text>
              </Pressable>
            ) : null}

            {snapshot ? (
              <Pressable disabled={busy} onPress={() => void undoLatest()} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Undo latest automatic replan</Text>
                <Text style={styles.secondaryHelper}>{snapshot.reason} · {formatDateTime(snapshot.createdAt)}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConflictCard({ conflict }: { conflict: PlanConflict }) {
  return (
    <View style={styles.conflictCard}>
      <View style={styles.conflictHeader}>
        <Text style={[styles.severity, severityStyle(conflict.severity)]}>{conflict.severity.toUpperCase()}</Text>
        <Text style={styles.date}>{formatDate(conflict.date)}</Text>
      </View>
      <Text style={styles.conflictTitle}>{conflict.headline}</Text>
      <Text style={styles.sessionName}>{conflict.sessionTitle}</Text>
      <Text style={styles.body}>{conflict.explanation}</Text>
    </View>
  );
}

function ProposalCard({ proposal }: { proposal: PlanMoveProposal }) {
  return (
    <View style={styles.proposalCard}>
      <Text style={styles.sessionName}>{proposal.sessionTitle}</Text>
      <View style={styles.moveRow}>
        <View style={styles.dateBox}><Text style={styles.dateBoxLabel}>FROM</Text><Text style={styles.dateBoxValue}>{formatDate(proposal.fromDate)}</Text></View>
        <Text style={styles.arrow}>→</Text>
        <View style={styles.dateBox}><Text style={styles.dateBoxLabel}>TO</Text><Text style={styles.dateBoxValue}>{formatDate(proposal.toDate)}</Text></View>
      </View>
      <Text style={styles.helper}>{proposal.reason}</Text>
    </View>
  );
}

function severityStyle(value: PlanConflict['severity']) {
  if (value === 'high') return styles.severityHigh;
  if (value === 'moderate') return styles.severityModerate;
  return styles.severityLow;
}
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function localIsoDate(date: Date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }

const c = { bg: '#E4EBE3', card: '#FFFDF8', ink: '#01234D', muted: '#6B7770', border: '#164C73', accent: '#153E2F', soft: '#D8E9DF', warm: '#F4E7D2', danger: '#9B2C2C', gold: '#8A6A2F' };
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: c.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.card },
  backButton: { flex: 1, paddingVertical: 6 }, backText: { color: c.accent, fontSize: 16, fontWeight: '700' }, topTitle: { color: c.ink, fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 60, gap: 15 }, emptyCard: { backgroundColor: c.card, borderRadius: 20, padding: 20, gap: 8 },
  title: { color: c.ink, fontSize: 28, fontWeight: '800' }, body: { color: c.muted, fontSize: 14, lineHeight: 20 }, helper: { color: c.muted, fontSize: 12, lineHeight: 18 },
  hero: { backgroundColor: c.accent, borderRadius: 24, padding: 20, gap: 4 }, heroAttention: { backgroundColor: '#5A342C' }, heroEyebrow: { color: '#C9DDD1', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, heroTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '800' }, heroBody: { color: '#E1ECE5', fontSize: 14 }, heroContext: { color: '#E1ECE5', fontSize: 12, lineHeight: 18, marginTop: 7 },
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 17, gap: 11 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionTitle: { color: c.ink, fontSize: 18, fontWeight: '800' }, countBadge: { color: c.accent, backgroundColor: c.soft, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 4, fontSize: 12, fontWeight: '800' },
  conflictCard: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, gap: 4 }, conflictHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, severity: { fontSize: 10, fontWeight: '900', letterSpacing: 1 }, severityHigh: { color: c.danger }, severityModerate: { color: c.gold }, severityLow: { color: c.accent }, date: { color: c.muted, fontSize: 12, fontWeight: '700' }, conflictTitle: { color: c.ink, fontSize: 16, fontWeight: '800' }, sessionName: { color: c.accent, fontSize: 14, fontWeight: '800' },
  proposalCard: { backgroundColor: c.bg, borderRadius: 16, padding: 13, gap: 9 }, moveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, dateBox: { flex: 1, backgroundColor: c.card, borderRadius: 12, padding: 10 }, dateBoxLabel: { color: c.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, dateBoxValue: { color: c.ink, fontSize: 13, fontWeight: '800', marginTop: 3 }, arrow: { color: c.accent, fontSize: 20, fontWeight: '800' },
  autoCard: { backgroundColor: c.warm, borderRadius: 18, padding: 15, gap: 5 }, autoEyebrow: { color: c.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, autoTitle: { color: c.ink, fontSize: 16, fontWeight: '900' },
  primaryButton: { backgroundColor: c.accent, borderRadius: 16, padding: 16, alignItems: 'center' }, primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, buttonDisabled: { opacity: 0.6 }, secondaryButton: { backgroundColor: c.card, borderWidth: 1, borderColor: c.accent, borderRadius: 16, padding: 15, alignItems: 'center', gap: 3 }, secondaryText: { color: c.accent, fontSize: 15, fontWeight: '800' }, secondaryHelper: { color: c.muted, fontSize: 11 }, successCard: { backgroundColor: c.soft, borderRadius: 15, padding: 13 }, successText: { color: c.accent, fontSize: 13, fontWeight: '700', lineHeight: 19 },
});