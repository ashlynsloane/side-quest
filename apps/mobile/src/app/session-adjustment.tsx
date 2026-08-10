import { buildDailyAdjustmentOptions, normalizeStrengthSession, type AdjustmentReason, type DailyAdjustmentResult } from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { V23Card, V23Icon, V23PageIntro, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import { getLatestTrainingBlock } from '@/services/database';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const REASONS: Array<{ id: AdjustmentReason; title: string; detail: string }> = [
  { id: 'fatigue', title: 'I’m too tired', detail: 'Reduce today’s cost without treating fatigue as a failure.' },
  { id: 'time', title: 'I have less time', detail: 'Keep the highest-priority work and trim optional volume.' },
  { id: 'access', title: 'Location or equipment unavailable', detail: 'Adapt around a closed gym, missing equipment, or changed setup.' },
  { id: 'pain', title: 'I have pain or symptoms', detail: 'Health and restrictions override the planned session.' },
  { id: 'preference', title: 'I need something different', detail: 'Move, replace, or recover based on the rest of the week.' },
];

export default function SessionAdjustmentScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [reason, setReason] = useState<AdjustmentReason>('fatigue');
  const [result, setResult] = useState<DailyAdjustmentResult | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);

  const requestAction = useMemo(() => reason === 'time' ? 'shorter' : reason === 'fatigue' ? 'easier' : reason === 'pain' ? 'skip' : 'different', [reason]);

  const load = useCallback(() => {
    void getLatestTrainingBlock().then((saved) => {
      const today = new Date().toISOString().slice(0, 10);
      const sessions = saved?.block.weeks.flatMap((week) => week.sessions) ?? [];
      const planned = sessions.find((session) => session.date === today && session.completionStatus !== 'completed' && session.completionStatus !== 'skipped');
      if (!planned) {
        setSessionTitle(null);
        setResult(null);
        return;
      }
      setSessionTitle(planned.title);
      const unified = normalizeStrengthSession(planned);
      const week = sessions
        .filter((session) => Math.abs(new Date(session.date).getTime() - new Date(today).getTime()) <= 6 * 86400000)
        .map(normalizeStrengthSession);
      const availableDates = Array.from({ length: 6 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index + 1);
        return date.toISOString().slice(0, 10);
      });
      setResult(buildDailyAdjustmentOptions({
        sessionId: unified.id,
        reason,
        requestedAction: requestAction,
        availableMinutes: reason === 'time' ? Math.max(15, Math.round(unified.durationMinutes * 0.5)) : undefined,
        availableDisciplines: reason === 'access' ? ['bike', 'run', 'strength', 'mobility'] : undefined,
        symptomSeverity: reason === 'pain' ? 3 : undefined,
        focalPain: reason === 'pain',
      }, {
        plannedSession: unified,
        weekSessions: week,
        availableDates,
        recentFatigueTrend: reason === 'fatigue' ? 'stable' : undefined,
      }));
    });
  }, [reason, requestAction]);

  useFocusEffect(load);

  return <V23Screen contentStyle={styles.page}>
    <V23PageIntro
      label="ADJUST SESSION"
      title="What changed?"
      body="Tell Side Quest what is different today. The goal is to preserve the useful training stimulus without forcing the original plan."
    />

    <View style={styles.reasonList}>
      {REASONS.map((item) => {
        const selected = reason === item.id;
        return <Pressable
          accessibilityRole="button"
          key={item.id}
          onPress={() => setReason(item.id)}
          style={({ pressed }) => [styles.reasonCard, selected && styles.reasonSelected, pressed && styles.pressed]}
        >
          <View style={styles.reasonCopy}>
            <Text style={styles.reasonTitle}>{item.title}</Text>
            <Text style={styles.helper}>{item.detail}</Text>
          </View>
          <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}>
            {selected ? <V23Icon name="check" color="#FFFFFF" size={14} /> : null}
          </View>
        </Pressable>;
      })}
    </View>

    <View>
      <V23SectionHeader>PLANNED</V23SectionHeader>
      {sessionTitle ? <V23Card style={styles.sessionCard}>
        <View style={styles.sessionIcon}><V23Icon name="plan" color={tokens.accent} size={19} /></View>
        <View style={styles.sessionCopy}>
          <Text style={styles.sessionEyebrow}>TODAY’S STRENGTH</Text>
          <Text style={styles.sessionTitle}>{sessionTitle}</Text>
        </View>
      </V23Card> : <V23Card style={styles.emptyCard}>
        <View style={styles.sessionIcon}><V23Icon name="adjust" color={tokens.accent} size={19} /></View>
        <View style={styles.sessionCopy}>
          <Text style={styles.emptyTitle}>No strength session to adjust today</Text>
          <Text style={styles.helper}>This adjustment flow currently edits planned strength sessions. Open a swim, bike, or run workout to adapt that session with Coach.</Text>
        </View>
      </V23Card>}
    </View>

    {result ? <View>
      <V23SectionHeader>{result.headline.toUpperCase()}</V23SectionHeader>
      <View style={styles.optionsSection}>
        {result.safetyMessage ? <V23Card style={styles.safetyCard}><Text style={styles.safety}>{result.safetyMessage}</Text></V23Card> : null}
        {result.options.map((option) => {
          const recommended = option.id === result.recommendedOptionId;
          return <V23Card key={option.id} style={[styles.optionCard, recommended && styles.recommendedCard]}>
            <Text style={[styles.optionLabel, recommended && styles.optionLabelRecommended]}>{recommended ? 'RECOMMENDED' : option.recommendationLevel.toUpperCase()}</Text>
            <Text style={styles.optionTitle}>{option.title}</Text>
            <Text style={styles.helper}>{option.description}</Text>
            {option.rationale.map((line) => <Text key={line} style={styles.bullet}>• {line}</Text>)}
            <Text style={styles.consequenceTitle}>Effect on the week</Text>
            {option.weeklyConsequences.map((line) => <Text key={line} style={styles.bullet}>• {line}</Text>)}
          </V23Card>;
        })}
        <Text style={styles.footer}>Major changes remain proposals until you approve them. Missed work is never automatically compressed into later days.</Text>
      </View>
    </View> : null}

    <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
      <V23Icon name="chevron" color={tokens.accent} size={15} />
      <Text style={styles.backText}>Back to plan</Text>
    </Pressable>
  </V23Screen>;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { paddingTop: 16, paddingBottom: 36, gap: 22 },
    reasonList: { gap: 9 },
    reasonCard: { minHeight: 78, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    reasonSelected: { borderColor: tokens.accent, backgroundColor: tokens.surfaceMuted },
    reasonCopy: { flex: 1, gap: 3 },
    reasonTitle: { color: tokens.text, fontSize: 16, lineHeight: 20, fontWeight: '850' as never },
    helper: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
    choiceIcon: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    choiceIconSelected: { borderColor: tokens.accent, backgroundColor: tokens.accent },
    sessionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
    emptyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
    sessionIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    sessionCopy: { flex: 1, gap: 3 },
    sessionEyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.1 },
    sessionTitle: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '900' },
    emptyTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '850' as never },
    optionsSection: { gap: 10 },
    safetyCard: { padding: 14, backgroundColor: tokens.surfaceMuted },
    safety: { color: tokens.text, fontSize: 13, lineHeight: 19, fontWeight: '750' as never },
    optionCard: { padding: 16, gap: 6 },
    recommendedCard: { borderColor: tokens.accent, borderWidth: 1.5 },
    optionLabel: { color: tokens.textMuted, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1 },
    optionLabelRecommended: { color: tokens.accent },
    optionTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
    bullet: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
    consequenceTitle: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '850' as never, marginTop: 4 },
    footer: { color: tokens.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 },
    backButton: { alignSelf: 'flex-start', minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
    backText: { color: tokens.accent, fontSize: 13, fontWeight: '850' as never },
    pressed: { opacity: 0.72 },
  });
}
