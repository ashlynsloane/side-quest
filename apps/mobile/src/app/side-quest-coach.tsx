import type { EnduranceActivity, PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { V23Card, V23Chip, V23GroupedList, V23Icon, V23PrimaryButton, V23Row, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import { getLatestTrainingBlock, getTodayReadinessCheckIn, listEnduranceActivities } from '@/services/database';
import type { DailyReadinessCheckIn } from '@/services/readiness';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

type CoachPanel = 'why' | 'changed' | 'upcoming' | 'history' | null;

export default function SideQuestCoachScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { setPreviewWorkout } = useWorkoutContext();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [readiness, setReadiness] = useState<DailyReadinessCheckIn | null>(null);
  const [recent, setRecent] = useState<EnduranceActivity[]>([]);
  const [openPanel, setOpenPanel] = useState<CoachPanel>('why');

  useFocusEffect(useCallback(() => {
    let live = true;
    const from = new Date();
    from.setDate(from.getDate() - 14);
    void Promise.all([
      getLatestTrainingBlock(),
      getTodayReadinessCheckIn(),
      listEnduranceActivities({ from: from.toISOString(), to: new Date().toISOString(), limit: 100 }),
    ]).then(([saved, ready, activities]) => {
      if (!live) return;
      setBlock(saved?.block ?? null);
      setReadiness(ready);
      setRecent(activities.filter((item) => item.classification !== 'ignored'));
    });
    return () => { live = false; };
  }, []));

  const session = nextSession(block);
  const coldStart = recent.length < 3;
  const recommendation = buildRecommendation(session, readiness, recent, block);
  const changeSummary = buildChangeSummary(session, readiness, recent);
  const upcoming = buildUpcomingSummary(block, session);

  const start = () => {
    if (!session) {
      router.push('/goal-catalog' as Href);
      return;
    }
    setPreviewWorkout(session.workout);
    router.push('/workout-preview' as Href);
  };

  const toggle = (panel: Exclude<CoachPanel, null>) => setOpenPanel((current) => current === panel ? null : panel);

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>SIDE QUEST COACH</Text>
      <Text style={styles.title}>Today’s decision</Text>
      <Text style={styles.body}>One recommendation, with the reasoning available when you need it.</Text>
    </View>

    <V23Card elevated style={styles.hero}>
      <View style={styles.heroTop}>
        <Text style={styles.kicker}>RECOMMENDED</Text>
        <V23Chip tone={coldStart ? 'neutral' : 'accent'}>{coldStart ? 'Intake-based' : 'History-informed'}</V23Chip>
      </View>
      <Text style={styles.heroTitle}>{recommendation.title}</Text>
      <Text style={styles.heroReason}>{recommendation.reason}</Text>
      <V23PrimaryButton onPress={start}>{session ? 'Review workout' : 'Build my plan'}</V23PrimaryButton>
      <View style={styles.linkRow}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/session-adjustment' as Href)} style={styles.linkButton}><Text style={styles.link}>Adjust</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/readiness' as Href)} style={styles.linkButton}><Text style={styles.link}>{readiness ? 'Update check-in' : 'Check in'}</Text></Pressable>
      </View>
    </V23Card>

    <View style={styles.explanationSection}>
      <Text style={styles.sectionTitle}>Understand the decision</Text>
      <V23GroupedList>
        <V23Row title="Why this" detail={recommendation.purpose} onPress={() => toggle('why')} icon={<V23Icon name="info" color={tokens.accent} size={20} />} trailing={<V23Icon name={openPanel === 'why' ? 'check' : 'chevron'} color={tokens.textMuted} size={16} />} />
        {openPanel === 'why' ? <View style={styles.panel}>
          <CoachFact label="Based on" value={recommendation.evidence.join(' • ')} styles={styles} />
          <CoachFact label="Respects" value={recommendation.constraints} styles={styles} />
          <CoachFact label="Still unknown" value={recommendation.uncertainty} styles={styles} />
        </View> : null}
        <V23Row title="What changed" detail={changeSummary.short} onPress={() => toggle('changed')} icon={<V23Icon name="adjust" color={tokens.accent} size={20} />} trailing={<V23Icon name={openPanel === 'changed' ? 'check' : 'chevron'} color={tokens.textMuted} size={16} />} />
        {openPanel === 'changed' ? <View style={styles.panel}><Text style={styles.panelTitle}>{changeSummary.title}</Text><Text style={styles.panelBody}>{changeSummary.body}</Text></View> : null}
        <V23Row title="What’s next" detail={upcoming.short} onPress={() => toggle('upcoming')} icon={<V23Icon name="plan" color={tokens.accent} size={20} />} trailing={<V23Icon name={openPanel === 'upcoming' ? 'check' : 'chevron'} color={tokens.textMuted} size={16} />} last />
        {openPanel === 'upcoming' ? <View style={[styles.panel, styles.panelLast]}><Text style={styles.panelTitle}>{upcoming.title}</Text><Text style={styles.panelBody}>{upcoming.body}</Text><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/plan' as Href)} style={styles.inlineAction}><Text style={styles.inlineActionText}>Review plan</Text><V23Icon name="chevron" color={tokens.accent} size={15} /></Pressable></View> : null}
      </V23GroupedList>
    </View>

    <Pressable accessibilityRole="button" onPress={() => toggle('history')} style={({ pressed }) => [styles.historyLink, pressed && styles.pressed]}>
      <View><Text style={styles.historyLinkTitle}>Coach history</Text><Text style={styles.historyLinkBody}>Recommendation → response → adjustment</Text></View>
      <V23Icon name="chevron" color={tokens.textMuted} size={16} />
    </Pressable>
    {openPanel === 'history' ? <V23Card tone="muted" style={styles.historyPanel}>
      <HistoryStep number="1" title="Recommendation" body={recommendation.title} styles={styles} />
      <HistoryStep number="2" title="Athlete response" body={readiness ? 'Today’s check-in is available.' : 'No check-in has been added today.'} styles={styles} />
      <HistoryStep number="3" title="Next adjustment" body={changeSummary.history} styles={styles} />
    </V23Card> : null}
  </V23Screen>;
}

function CoachFact({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>;
}

function HistoryStep({ number, title, body, styles }: { number: string; title: string; body: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.historyStep}><View style={styles.historyNumber}><Text style={styles.historyNumberText}>{number}</Text></View><View style={styles.historyCopy}><Text style={styles.historyTitle}>{title}</Text><Text style={styles.historyBody}>{body}</Text></View></View>;
}

function nextSession(block: TrainingBlockPlan | null): PlannedStrengthSession | null {
  if (!block) return null;
  const today = new Date().toISOString().slice(0, 10);
  const sessions = block.weeks.flatMap((week) => week.sessions).filter((item) => item.completionStatus === 'planned').sort((a, b) => a.date.localeCompare(b.date));
  return sessions.find((item) => item.date >= today) ?? sessions[0] ?? null;
}

function buildRecommendation(session: PlannedStrengthSession | null, readiness: DailyReadinessCheckIn | null, recent: EnduranceActivity[], block: TrainingBlockPlan | null) {
  const totalMinutes = Math.round(recent.reduce((sum, item) => sum + item.movingTimeSeconds, 0) / 60);
  const evidence = [
    block ? `${block.goal.name} goal and current phase` : 'Your intake and stated goal',
    session ? `${session.date} planned strength placement` : 'Your current weekly availability',
    readiness ? 'Today’s readiness check-in' : 'No readiness check-in yet',
    recent.length ? `${recent.length} recent activities (${totalMinutes} min)` : 'No training history required',
  ];
  const constraints = session ? 'Your stated availability, equipment, restrictions, and approved plan placement.' : 'Your stated availability, equipment, and restrictions.';
  const uncertainty = recent.length < 3 ? 'Your personal training baseline is still developing.' : readiness ? 'No major missing input for today’s decision.' : 'Today’s readiness has not been reported.';
  if (!session) return {
    title: 'Build your first usable week',
    reason: 'Create a goal-based plan and Side Quest will immediately place strength around your stated schedule, equipment, and restrictions.',
    purpose: 'Establish a realistic first week of strength work around your endurance goal.', evidence, constraints, uncertainty,
  };
  if (readiness && String((readiness as unknown as { overall?: string }).overall ?? '').toLowerCase().includes('low')) return {
    title: `Modify ${session.title}`,
    reason: 'Today’s check-in suggests reducing complexity or duration rather than forcing the original session.',
    purpose: 'Preserve the session’s main strength stimulus while reducing unnecessary fatigue.', evidence, constraints, uncertainty,
  };
  return {
    title: session.title,
    reason: recent.length < 3 ? 'This is an intake-based starting recommendation. It uses your goal, availability, equipment, and restrictions before enough training history exists.' : 'This session preserves your planned strength dose while accounting for the training currently recorded.',
    purpose: 'Complete the next useful strength dose without disrupting your current endurance priorities.', evidence, constraints, uncertainty,
  };
}

function buildChangeSummary(session: PlannedStrengthSession | null, readiness: DailyReadinessCheckIn | null, recent: EnduranceActivity[]) {
  if (!session) return { short: 'No active recommendation has been changed.', title: 'Nothing has changed yet', body: 'Build your first plan to create a recommendation and an explainable change history.', history: 'A change history will appear after the first recommendation.' };
  if (readiness && String((readiness as unknown as { overall?: string }).overall ?? '').toLowerCase().includes('low')) return { short: 'Today’s check-in triggered a modification suggestion.', title: 'A lighter version is suggested', body: 'The session purpose is preserved, but duration or complexity should be reduced based on today’s check-in.', history: 'Review the lighter option before accepting it.' };
  if (recent.length < 3) return { short: 'No material change from the intake-based plan.', title: 'The planned session is unchanged', body: 'There is not yet enough recorded history to justify changing the approved session. Side Quest is using the conservative intake-based placement.', history: 'Complete the session or add a check-in; the next recommendation will use that response.' };
  return { short: 'Recent training was reviewed; the planned dose remains appropriate.', title: 'The session remains on plan', body: 'Recent activity adds context, but it does not justify removing or substantially changing today’s planned strength work.', history: 'Your completion and post-workout feedback will inform the next decision.' };
}

function buildUpcomingSummary(block: TrainingBlockPlan | null, session: PlannedStrengthSession | null) {
  if (!block || !session) return { short: 'Create a plan to see upcoming coaching decisions.', title: 'No upcoming decision yet', body: 'Once a plan exists, Side Quest will surface schedule conflicts and meaningful proposed changes here.' };
  const planned = block.weeks.flatMap((week) => week.sessions).filter((item) => item.completionStatus === 'planned').sort((a, b) => a.date.localeCompare(b.date));
  const next = planned.find((item) => item.date > session.date);
  if (!next) return { short: 'No additional planned strength session is waiting.', title: 'Today is the current focus', body: 'There is no later planned strength session requiring attention in the current block.' };
  return { short: `${next.title} is next on ${next.date}.`, title: 'Next planned decision', body: `${next.title} remains scheduled for ${next.date}. Side Quest will surface a proposal here if new training or availability creates a meaningful conflict.` };
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 22, paddingTop: 20 }, intro: { gap: 6 }, eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: tokens.accent }, title: { fontSize: 30, lineHeight: 36, fontWeight: '900', color: tokens.text }, body: { fontSize: 15, lineHeight: 21, color: tokens.textMuted },
    hero: { gap: 16, padding: 20 }, heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1, color: tokens.accent }, heroTitle: { fontSize: 27, lineHeight: 33, fontWeight: '900', color: tokens.text }, heroReason: { fontSize: 15.5, lineHeight: 22, color: tokens.textMuted },
    linkRow: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 6 }, linkButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center' }, link: { fontSize: 14.5, fontWeight: '800', color: tokens.accent },
    explanationSection: { gap: 10 }, sectionTitle: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '800', paddingHorizontal: 2 }, panel: { paddingHorizontal: 18, paddingVertical: 16, gap: 12, backgroundColor: tokens.surfaceMuted, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border }, panelLast: { borderBottomWidth: 0 }, panelTitle: { fontSize: 16.5, lineHeight: 21, fontWeight: '800', color: tokens.text }, panelBody: { fontSize: 14.5, lineHeight: 20, color: tokens.textMuted }, panelNote: { fontSize: 13.5, lineHeight: 19, color: tokens.textMuted, fontStyle: 'italic' },
    fact: { gap: 3 }, factLabel: { fontSize: 10.5, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7, color: tokens.accent }, factValue: { fontSize: 14.5, lineHeight: 20, color: tokens.text }, inlineAction: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 10 }, inlineActionText: { fontSize: 14.5, lineHeight: 19, fontWeight: '800', color: tokens.accent },
    historyLink: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 8 }, historyLinkTitle: { color: tokens.text, fontSize: 17, lineHeight: 22, fontWeight: '800' }, historyLinkBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 18, marginTop: 2 }, historyPanel: { gap: 14 }, historyStep: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' }, historyNumber: { width: 27, height: 27, borderRadius: 14, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center' }, historyNumberText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' }, historyCopy: { flex: 1, gap: 2 }, historyTitle: { fontSize: 14.5, lineHeight: 19, fontWeight: '800', color: tokens.text }, historyBody: { fontSize: 13.5, lineHeight: 19, color: tokens.textMuted }, pressed: { opacity: 0.7 },
  });
}
