import { buildDailyAdjustmentOptions, normalizeStrengthSession, type AdjustmentReason, type DailyAdjustmentResult } from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLatestTrainingBlock } from '@/services/database';

const REASONS: Array<{ id: AdjustmentReason; title: string; detail: string }> = [
  { id: 'fatigue', title: 'I’m too tired', detail: 'Use current fatigue without treating it as a failure.' },
  { id: 'time', title: 'I have less time', detail: 'Keep the highest-priority work and remove optional volume.' },
  { id: 'access', title: 'Location or equipment unavailable', detail: 'Pool closed, gym unavailable, or equipment changed.' },
  { id: 'pain', title: 'I have pain or symptoms', detail: 'Health overrides the planned session.' },
  { id: 'preference', title: 'I need something different', detail: 'Move, replace, or recover based on the whole week.' },
];

export default function SessionAdjustmentScreen() {
  const router = useRouter();
  const [reason, setReason] = useState<AdjustmentReason>('fatigue');
  const [result, setResult] = useState<DailyAdjustmentResult | null>(null);
  const [sessionTitle, setSessionTitle] = useState('Today’s session');

  const requestAction = useMemo(() => reason === 'time' ? 'shorter' : reason === 'fatigue' ? 'easier' : reason === 'pain' ? 'skip' : 'different', [reason]);

  const load = useCallback(() => {
    void getLatestTrainingBlock().then((saved) => {
      const today = new Date().toISOString().slice(0, 10);
      const sessions = saved?.block.weeks.flatMap((week) => week.sessions) ?? [];
      const planned = sessions.find((session) => session.date === today && session.completionStatus !== 'completed' && session.completionStatus !== 'skipped');
      if (!planned) {
        setResult(null);
        return;
      }
      setSessionTitle(planned.title);
      const unified = normalizeStrengthSession(planned);
      const week = sessions.filter((session) => Math.abs(new Date(session.date).getTime() - new Date(today).getTime()) <= 6 * 86400000).map(normalizeStrengthSession);
      const availableDates = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(); date.setDate(date.getDate() + index + 1); return date.toISOString().slice(0, 10);
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹ Today</Text></Pressable>
        <Text style={styles.topTitle}>Adjust session</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>ATHLETE-FIRST REPLANNING</Text>
        <Text style={styles.title}>What changed?</Text>
        <Text style={styles.subtitle}>Side Quest protects mental and physical health before performance or completion percentage.</Text>

        <View style={styles.reasonList}>
          {REASONS.map((item) => (
            <Pressable key={item.id} onPress={() => setReason(item.id)} style={[styles.reasonCard, reason === item.id && styles.selectedCard]}>
              <Text style={styles.reasonTitle}>{item.title}</Text>
              <Text style={styles.helper}>{item.detail}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sessionCard}>
          <Text style={styles.cardEyebrow}>PLANNED</Text>
          <Text style={styles.sessionTitle}>{sessionTitle}</Text>
        </View>

        {result ? (
          <View style={styles.optionsSection}>
            <Text style={styles.sectionTitle}>{result.headline}</Text>
            {result.safetyMessage ? <Text style={styles.safety}>{result.safetyMessage}</Text> : null}
            {result.options.map((option) => (
              <View key={option.id} style={[styles.optionCard, option.id === result.recommendedOptionId && styles.recommendedCard]}>
                <Text style={styles.optionLabel}>{option.id === result.recommendedOptionId ? 'RECOMMENDED' : option.recommendationLevel.toUpperCase()}</Text>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.helper}>{option.description}</Text>
                {option.rationale.map((line) => <Text key={line} style={styles.bullet}>• {line}</Text>)}
                <Text style={styles.consequenceTitle}>Effect on the week</Text>
                {option.weeklyConsequences.map((line) => <Text key={line} style={styles.bullet}>• {line}</Text>)}
              </View>
            ))}
            <Text style={styles.footer}>Major changes remain proposals until the athlete approves them. Missed work is never automatically compressed into later days.</Text>
          </View>
        ) : <Text style={styles.helper}>No adjustable planned strength session was found for today.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const colors = { background: '#E4EBE3', card: '#FFFDF8', ink: '#01234D', muted: '#6B7770', border: '#164C73', accent: '#153E2F', soft: '#D8E9DF', warning: '#6E2C2C' };
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  backButton: { flex: 1, paddingVertical: 6 }, backText: { color: colors.accent, fontSize: 16, fontWeight: '700' }, topTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 56, gap: 15 }, eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700' }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 }, helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  reasonList: { gap: 8 }, reasonCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 3 }, selectedCard: { backgroundColor: colors.soft, borderColor: colors.accent }, reasonTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  sessionCard: { backgroundColor: colors.accent, borderRadius: 18, padding: 17, gap: 4 }, cardEyebrow: { color: '#C7D9CE', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, sessionTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  optionsSection: { gap: 10 }, sectionTitle: { color: colors.ink, fontSize: 22, fontWeight: '700' }, safety: { color: colors.warning, fontWeight: '700', lineHeight: 20 },
  optionCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, gap: 6 }, recommendedCard: { backgroundColor: colors.soft, borderColor: colors.accent, borderWidth: 2 }, optionLabel: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 }, optionTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' }, bullet: { color: colors.muted, fontSize: 13, lineHeight: 19 }, consequenceTitle: { color: colors.ink, fontSize: 13, fontWeight: '800', marginTop: 4 }, footer: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
});
