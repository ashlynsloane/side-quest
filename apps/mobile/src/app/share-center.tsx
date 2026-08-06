import type { TrainingBlockPlan } from '@circuit/domain';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { V23Card, V23GroupedList, V23Icon, V23Row, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import { getLatestTrainingBlock, getTrainingBalance, listFavoriteWorkouts, getTrainingContinuitySummary } from '@/services/database';
import { planText, privacySafeSummary, shareText, workoutText } from '@/services/sharing';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export default function ShareCenter() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [plan, setPlan] = useState<TrainingBlockPlan | null>(null);
  const [favorite, setFavorite] = useState<Awaited<ReturnType<typeof listFavoriteWorkouts>>[number] | null>(null);
  const [completed, setCompleted] = useState(0);
  const [regions, setRegions] = useState(0);
  const [includePrescriptions, setIncludePrescriptions] = useState(true);
  const [includePrivacyNote, setIncludePrivacyNote] = useState(true);
  useEffect(() => { void Promise.all([getLatestTrainingBlock(), listFavoriteWorkouts(), getTrainingContinuitySummary(), getTrainingBalance(30)]).then(([saved, favorites, continuity, balance]) => { setPlan(saved?.block ?? null); setFavorite(favorites[0] ?? null); setCompleted(continuity.completedLast28Days); setRegions(balance.length); }); }, []);

  const shareWorkout = async () => {
    if (!favorite) { Alert.alert('No favorite workout', 'Save a workout as a favorite before creating a share card.'); return; }
    const full = workoutText(favorite.workout);
    const message = includePrescriptions ? full : full.split('\n').filter((line) => !line.startsWith('• ')).join('\n').trim();
    await shareText(favorite.name, `${message}${includePrivacyNote ? '\n\nShared from Side Quest. Private readiness, symptoms, restrictions, notes, and Coach reasoning are excluded.' : ''}`);
  };

  return <V23Screen>
    <View style={styles.intro}><Text style={styles.eyebrow}>SHARING CENTER</Text><Text style={styles.title}>Review before anything leaves Side Quest</Text><Text style={styles.body}>Share a workout, plan, or progress summary without exposing the private context used to coach you.</Text></View>

    <V23Card elevated style={styles.preview}>
      <View style={styles.previewTop}><View style={styles.previewIcon}><V23Icon name="more" color={tokens.accent} size={22} /></View><View style={styles.previewCopy}><Text style={styles.previewLabel}>WORKOUT CARD PREVIEW</Text><Text style={styles.previewTitle}>{favorite?.name ?? 'Your saved workout'}</Text></View></View>
      <Text style={styles.body}>{favorite ? `${Math.round(favorite.workout.totalWorkSeconds / 60)} min work · ${favorite.workout.stations.length} stations` : 'Save a workout as a favorite to preview its share card.'}</Text>
      <View style={styles.tagRow}><Text style={styles.safe}>Workout structure</Text><Text style={styles.safe}>Body regions</Text>{includePrescriptions ? <Text style={styles.safe}>Prescriptions</Text> : null}</View>
    </V23Card>

    <V23SectionHeader>Workout card options</V23SectionHeader>
    <View style={styles.optionGroup}>
      <OptionRow title="Exercise prescriptions" detail="Include reps, time, and side-specific targets." value={includePrescriptions} onValueChange={setIncludePrescriptions} />
      <View style={styles.divider} />
      <OptionRow title="Privacy note" detail="State what Side Quest excluded from the card." value={includePrivacyNote} onValueChange={setIncludePrivacyNote} />
    </View>
    <Pressable onPress={() => void shareWorkout()} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><V23Icon name="more" color="#FFFFFF" size={19} /><Text style={styles.primaryText}>Review in system share sheet</Text></Pressable>

    <V23SectionHeader>Never included</V23SectionHeader>
    <V23Card style={styles.neverCard}>
      <PrivacyLine text="Readiness and check-in answers" />
      <PrivacyLine text="Symptoms, restrictions, and PT notes" />
      <PrivacyLine text="Weights, private notes, and Coach reasoning" />
      <PrivacyLine text="Account, device, and integration details" />
    </V23Card>

    <V23SectionHeader>Other things you can share</V23SectionHeader>
    <V23GroupedList>
      <V23Row title="Current goal plan" detail={plan ? 'Dates, session titles, phases, and intended loads.' : 'Create a goal plan first.'} onPress={() => plan ? void shareText(plan.goal.name, planText(plan)) : Alert.alert('No goal plan')} icon={<V23Icon name="plan" color={tokens.accent} size={20} />} />
      <V23Row title="Privacy-safe progress summary" detail="Completed training and tracked regions without health context." onPress={() => void shareText('Side Quest summary', privacySafeSummary({ plan, completed, regions }))} icon={<V23Icon name="insights" color={tokens.accent} size={20} />} />
      <V23Row title="Review Training Body Map" detail="Inspect front and back regional status before sharing." onPress={() => router.push('/insights' as Href)} icon={<V23Icon name="insights" color={tokens.accent} size={20} />} />
      <V23Row title="Full data export" detail="Export raw local data only when you intentionally need a backup." onPress={() => router.push('/privacy-data' as Href)} icon={<V23Icon name="more" color={tokens.accent} size={20} />} last />
    </V23GroupedList>
  </V23Screen>;
}

function OptionRow({ title, detail, value, onValueChange }: { title: string; detail: string; value: boolean; onValueChange: (value: boolean) => void }) { const { tokens } = useTheme(); const styles = useMemo(() => makeStyles(tokens), [tokens]); return <View style={styles.optionRow}><View style={styles.optionCopy}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionDetail}>{detail}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={{ false: tokens.border, true: tokens.accentSoft }} thumbColor={value ? tokens.accent : tokens.surface} /></View>; }
function PrivacyLine({ text }: { text: string }) { const { tokens } = useTheme(); const styles = useMemo(() => makeStyles(tokens), [tokens]); return <View style={styles.privacyLine}><View style={styles.lockDot}><V23Icon name="check" color={tokens.accent} size={13} /></View><Text style={styles.privacyText}>{text}</Text></View>; }

function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  intro: { gap: 6, marginBottom: 4 }, eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1, color: tokens.accent }, title: { fontSize: 28, lineHeight: 33, fontWeight: '900', color: tokens.text }, body: { fontSize: 14, lineHeight: 20, color: tokens.textMuted }, preview: { gap: 10 }, previewTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, previewIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.accentSoft }, previewCopy: { flex: 1, gap: 2 }, previewLabel: { color: tokens.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 }, previewTitle: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '900' }, tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, safe: { color: tokens.accent, backgroundColor: tokens.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: '800' },
  optionGroup: { borderWidth: 1, borderColor: tokens.border, borderRadius: 22, backgroundColor: tokens.surface, overflow: 'hidden' }, optionRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 }, optionCopy: { flex: 1, gap: 3 }, optionTitle: { color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '800' }, optionDetail: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17 }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: tokens.border, marginLeft: 16 }, primary: { minHeight: 52, borderRadius: 16, backgroundColor: tokens.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 }, primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, pressed: { opacity: 0.75 },
  neverCard: { gap: 11 }, privacyLine: { flexDirection: 'row', alignItems: 'center', gap: 10 }, lockDot: { width: 27, height: 27, borderRadius: 10, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' }, privacyText: { flex: 1, color: tokens.text, fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
}); }
