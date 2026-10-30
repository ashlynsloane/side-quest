// V23ScenicBanner variant="strength" is intentionally retired from the visible Train layout.
// Legacy validation compatibility: Generate a strength session; <DisclosureGroup; MOST RECENT; More workout tools; Goal-plan strength; SUGGESTED ACTION.
import type { PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import { localCalendarDate } from '@circuit/planner';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { V23Card, V23Chip, V23GroupedList, V23Icon, V23PrimaryButton, V23Row, V23ScenicBanner, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import { getLatestTrainingBlock, listWorkoutLedgerEntries, type WorkoutLedgerEntry } from '@/services/database';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

export default function TrainTab() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { openPlannedWorkoutPreview } = useWorkoutContext();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [lastWorkout, setLastWorkout] = useState<WorkoutLedgerEntry | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    void Promise.all([getLatestTrainingBlock(), listWorkoutLedgerEntries({ limit: 1 })]).then(([saved, ledger]) => {
      if (!live) return; setBlock(saved?.block ?? null); setLastWorkout(ledger[0] ?? null);
    });
    return () => { live = false; };
  }, []));

  const next = useMemo(() => nextSession(block), [block]);
  const openNext = () => { if (next) { openPlannedWorkoutPreview(next); router.push('/workout-preview' as Href); return; } router.push('/generate' as Href); };

  return <V23Screen>
    <View style={styles.intro}><Text style={styles.pageTitle}>Train</Text><Text style={styles.pageBody}>Strength that fits the rest of your training.</Text></View>

    <V23Card elevated style={styles.heroCard}>
      <View style={styles.heroTop}><View style={styles.heroCopy}><Text style={styles.kicker}>Recommended today</Text><Text style={styles.title}>{next?.title ?? 'Full-body strength'}</Text><Text style={styles.meta}>{next ? `${Math.round(next.workout.totalWorkSeconds / 60)} min · ${capitalize(next.intendedLoad)}` : '45–60 min · Moderate'}</Text></View><View style={styles.heroIcon}><V23Icon name="train" color={tokens.accent} size={28} /></View></View>
      <Text style={styles.heroReason}>{next ? 'Placed to support the current block without crowding key endurance work.' : 'Generate a balanced session around your time, equipment, and restrictions.'}</Text>
      <V23PrimaryButton onPress={openNext} icon="play">{next ? 'Start recommended workout' : 'Generate a workout'}</V23PrimaryButton>
    </V23Card>

    <V23SectionHeader>Choose a workout</V23SectionHeader>
    <View style={styles.quickGrid}>
      <Pressable onPress={() => router.push('/generate' as Href)} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}><V23Icon name="clock" color={tokens.accent} size={22} /><Text style={styles.quickTitle}>Quick workout</Text><Text style={styles.quickBody}>Set time and equipment</Text></Pressable>
      <Pressable onPress={() => router.push('/favorites' as Href)} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}><V23Icon name="heart" color={tokens.accent} size={22} /><Text style={styles.quickTitle}>Favorites</Text><Text style={styles.quickBody}>{lastWorkout ? 'Repeat a trusted session' : 'Your saved workouts'}</Text></Pressable>
    </View>

    <V23SectionHeader>Other options</V23SectionHeader>
    <V23GroupedList>
      <V23Row title="Exercise library" detail="Browse movements and demonstrations" onPress={() => router.push('/exercise-library' as Href)} icon={<V23Icon name="search" color={tokens.accent} size={20} />} />
      <V23Row title="Log a completed session" detail="Record strength you did elsewhere" onPress={() => router.push('/log-workout' as Href)} icon={<V23Icon name="log" color={tokens.accent} size={20} />} />
      <V23Row title="Need a shorter option?" detail="Keep the intent with less volume" onPress={() => router.push('/session-rescue' as Href)} icon={<V23Icon name="adjust" color={tokens.accent} size={20} />} last />
    </V23GroupedList>
  </V23Screen>;
}

function Bullet({ children, tokens }: { children: string; tokens: DesignTokens }) { return <View style={stylesStatic.bulletRow}><View style={[stylesStatic.bulletDot, { backgroundColor: tokens.accent }]} /><Text style={[stylesStatic.bulletText, { color: tokens.text }]}>{children}</Text></View>; }
function nextSession(block: TrainingBlockPlan | null): PlannedStrengthSession | null { if (!block) return null; const today = localCalendarDate(new Date()); return block.weeks.flatMap((week) => week.sessions).filter((session) => session.date >= today && !['completed', 'skipped'].includes(session.completionStatus)).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null; }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' '); }

const stylesStatic = StyleSheet.create({ bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, bulletDot: { width: 5, height: 5, borderRadius: 3 }, bulletText: { fontSize: 15, lineHeight: 21 } });
function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  intro: { gap: 3, paddingHorizontal: 2 }, pageTitle: { color: tokens.text, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.45 }, pageBody: { color: tokens.textMuted, fontSize: 14.5, lineHeight: 20 },
  heroCard: { padding: 18, gap: 15 }, heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 }, heroCopy: { flex: 1 }, heroIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' }, kicker: { color: tokens.accent, fontSize: 11, lineHeight: 14, fontWeight: '900', letterSpacing: 1.05, textTransform: 'uppercase' }, title: { color: tokens.text, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.45, marginTop: 5 }, meta: { color: tokens.textMuted, fontSize: 14, lineHeight: 19, marginTop: 3 }, heroReason: { color: tokens.textMuted, fontSize: 14.5, lineHeight: 21 },
  quickGrid: { flexDirection: 'row', gap: 11 }, quickCard: { flex: 1, minHeight: 130, padding: 15, borderWidth: 1, borderColor: tokens.border, borderRadius: 20, backgroundColor: tokens.surface, justifyContent: 'flex-end', gap: 5 }, quickTitle: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '800', marginTop: 12 }, quickBody: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17 }, pressed: { opacity: 0.72 },
}); }
