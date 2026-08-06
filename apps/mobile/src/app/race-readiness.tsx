import type { TrainingBlockPlan, TrainingPhase } from '@circuit/domain';
import { buildRaceChecklist, type RaceChecklistItem } from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLatestTrainingBlock, getRaceChecklistState, saveRaceChecklistItem } from '@/services/database';

export default function RaceReadinessScreen() {
  const router = useRouter();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [state, setState] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const saved = await getLatestTrainingBlock();
    const current = saved?.block ?? null;
    setBlock(current);
    if (current) setState(await getRaceChecklistState(current.goal.id));
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const phase = useMemo(() => currentPhase(block), [block]);
  const items = useMemo(() => block && phase ? buildRaceChecklist({ goal: block.goal, phase }) : [], [block, phase]);
  const completed = items.filter((item) => state[item.id]).length;
  const dueItems = items.filter((item) => item.due);
  const dueComplete = dueItems.filter((item) => state[item.id]).length;

  async function toggle(item: RaceChecklistItem) {
    if (!block) return;
    const next = !state[item.id];
    setState((current) => ({ ...current, [item.id]: next }));
    await saveRaceChecklistItem({ goalId: block.goal.id, itemId: item.id, completed: next });
  }

  async function shareChecklist() {
    if (!block) return;
    const lines = [
      `${block.goal.name} race-readiness checklist`,
      block.goal.eventDate ? `Event: ${formatDate(block.goal.eventDate)}` : '',
      '',
      ...items.map((item) => `${state[item.id] ? '✓' : '○'} ${item.title} — ${item.detail}`),
    ].filter(Boolean);
    await Share.share({ message: lines.join('\n') });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹ Home</Text></Pressable>
        <Text style={styles.topTitle}>Race readiness</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!block || !phase || !block.goal.eventDate ? (
          <View style={styles.emptyCard}>
            <Text style={styles.title}>No dated event plan</Text>
            <Text style={styles.body}>Race readiness appears after a goal plan has an event date. Offseason and open-ended goals can continue using the normal plan dashboard.</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>{phase.replace('_', ' ').toUpperCase()}</Text>
              <Text style={styles.countdown}>{daysRemaining(block.goal.eventDate)}</Text>
              <Text style={styles.heroTitle}>days until {block.goal.name}</Text>
              <Text style={styles.heroBody}>{formatDate(block.goal.eventDate)} · {dueComplete}/{dueItems.length} currently due items complete</Text>
            </View>

            <View style={styles.progressCard}>
              <View style={styles.progressHeader}><Text style={styles.sectionTitle}>Overall checklist</Text><Text style={styles.progressValue}>{completed}/{items.length}</Text></View>
              <View style={styles.track}><View style={[styles.fill, { width: `${items.length ? Math.max(2, completed / items.length * 100) : 0}%` }]} /></View>
              <Text style={styles.body}>Items become highlighted as their timing window approaches. Completing something early is allowed.</Text>
            </View>

            {(['now', 'two_weeks', 'race_week', 'race_day'] as const).map((timing) => {
              const section = items.filter((item) => item.timing === timing);
              if (section.length === 0) return null;
              return (
                <View key={timing} style={styles.card}>
                  <Text style={styles.sectionTitle}>{timingLabel(timing)}</Text>
                  {section.map((item) => (
                    <Pressable key={item.id} onPress={() => void toggle(item)} style={[styles.item, item.due && !state[item.id] && styles.itemDue]}>
                      <View style={[styles.checkbox, state[item.id] && styles.checkboxComplete]}><Text style={styles.checkmark}>{state[item.id] ? '✓' : ''}</Text></View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={styles.itemHeader}><Text style={[styles.itemTitle, state[item.id] && styles.itemTitleComplete]}>{item.title}</Text>{item.due ? <Text style={styles.dueBadge}>DUE</Text> : null}</View>
                        <Text style={styles.body}>{item.detail}</Text>
                        <Text style={styles.category}>{item.category.toUpperCase()}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              );
            })}

            <View style={styles.noteCard}>
              <Text style={styles.sectionTitle}>Strength-specific rule</Text>
              <Text style={styles.body}>The final weeks are for expressing fitness, not proving strength. Keep familiar patterns, reduce volume, and avoid chasing soreness. Active pain, swelling, or altered movement should be handled through the PT/check-in workflow and appropriate professional care.</Text>
            </View>

            <Pressable onPress={() => void shareChecklist()} style={styles.primaryButton}><Text style={styles.primaryText}>Share checklist</Text></Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function currentPhase(block: TrainingBlockPlan | null): TrainingPhase | null {
  if (!block) return null;
  const today = new Date().toISOString().slice(0, 10);
  return block.weeks.find((week) => today >= week.weekStartDate && today <= addDays(week.weekStartDate, 6))?.phase
    ?? block.weeks.find((week) => week.weekStartDate >= today)?.phase
    ?? block.weeks.at(-1)?.phase
    ?? null;
}
function timingLabel(value: RaceChecklistItem['timing']) { if (value === 'now') return 'Do now'; if (value === 'two_weeks') return 'Two-week window'; if (value === 'race_week') return 'Race week'; return 'Event day'; }
function daysRemaining(eventDate: string) { return Math.max(0, Math.ceil((new Date(`${eventDate}T12:00:00`).getTime() - Date.now()) / 86_400_000)); }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }

const c = { bg: '#E4EBE3', card: '#FFFDF8', ink: '#01234D', muted: '#6B7770', border: '#164C73', accent: '#153E2F', soft: '#D8E9DF', warm: '#F4E7D2', danger: '#9B2C2C' };
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: c.bg }, topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.card }, backButton: { flex: 1, paddingVertical: 6 }, backText: { color: c.accent, fontSize: 16, fontWeight: '700' }, topTitle: { color: c.ink, fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 60, gap: 15 }, emptyCard: { backgroundColor: c.card, borderRadius: 20, padding: 20, gap: 8 }, title: { color: c.ink, fontSize: 28, fontWeight: '800' }, body: { color: c.muted, fontSize: 14, lineHeight: 20 },
  hero: { backgroundColor: c.accent, borderRadius: 24, padding: 20, gap: 4 }, eyebrow: { color: '#C9DDD1', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, countdown: { color: '#FFFFFF', fontSize: 52, fontWeight: '900', lineHeight: 58 }, heroTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '800' }, heroBody: { color: '#D8E9DF', fontSize: 13, lineHeight: 18 },
  progressCard: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 17, gap: 10 }, progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, progressValue: { color: c.accent, fontSize: 18, fontWeight: '900' }, sectionTitle: { color: c.ink, fontSize: 18, fontWeight: '800' }, track: { height: 11, borderRadius: 8, backgroundColor: c.soft, overflow: 'hidden' }, fill: { height: 11, borderRadius: 8, backgroundColor: c.accent },
  card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 17, gap: 10 }, item: { flexDirection: 'row', gap: 11, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }, itemDue: { backgroundColor: '#FFF8EF', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 12 }, checkbox: { width: 25, height: 25, borderRadius: 8, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 }, checkboxComplete: { backgroundColor: c.accent, borderColor: c.accent }, checkmark: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 }, itemTitle: { flex: 1, color: c.ink, fontSize: 15, fontWeight: '800' }, itemTitleComplete: { textDecorationLine: 'line-through', color: c.muted }, dueBadge: { color: c.danger, backgroundColor: '#F8E5E5', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, fontSize: 9, fontWeight: '900' }, category: { color: c.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  noteCard: { backgroundColor: c.warm, borderRadius: 20, padding: 17, gap: 6 }, primaryButton: { backgroundColor: c.accent, borderRadius: 16, padding: 16, alignItems: 'center' }, primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
