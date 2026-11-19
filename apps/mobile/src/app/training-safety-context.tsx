import {
  type AthleteTrainingIntent, type ProtectedMovement,
  type AthleteTrainingSafetyContext, type TrainingSafetyPolicy,
} from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getAthleteTrainingSafetyPolicy, recordAthleteTrainingSafetyContext,
} from '@/services/database';
import { useAuth } from '@/state/auth-context';

const intentChoices: Array<{ id: AthleteTrainingIntent; title: string; description: string }> = [
  {
    id: 'general_training', title: 'General training',
    description: 'Everyday fitness and strength, without assuming a medical restriction.',
  },
  {
    id: 'injury_rehabilitation', title: 'Injury rehabilitation',
    description: 'Training around a current injury and rehabilitation limitations.',
  },
  {
    id: 'return_to_sport', title: 'Return to sport',
    description: 'Gradually resuming an activity after an injury or an extended interruption.',
  },
];
const movementChoices: Array<{ id: ProtectedMovement; title: string }> = [
  { id: 'impact_running', title: 'Running and impact' },
  { id: 'loaded_spinal_rotation', title: 'Loaded spinal rotation' },
  { id: 'shoulder_loading', title: 'Shoulder loading' },
  { id: 'deep_hip_flexion', title: 'Deep hip flexion' },
  { id: 'other_movement', title: 'Another movement or activity' },
];

const colors = {
  background: '#E4EBE3', paper: '#FFFDF8', ink: '#01234D',
  muted: '#536761', border: '#B7CDC0', accent: '#153E2F',
  warning: '#6E2C2C', soft: '#ECF3EA',
};

export default function TrainingSafetyContextScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const athleteId = user?.id;
  const currentAthlete = useRef(athleteId);
  currentAthlete.current = athleteId;
  const [context, setContext] = useState<AthleteTrainingSafetyContext | null>(null);
  const [policy, setPolicy] = useState<TrainingSafetyPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    setContext(null);
    setPolicy(null);
    setError(null);
    if (!athleteId) {
      setLoading(false);
      setError('Select an athlete profile to inspect training safeguards.');
      return () => { live = false; };
    }
    setLoading(true);
    void getAthleteTrainingSafetyPolicy(athleteId)
      .then(result => {
        if (!live) return;
        setContext(result.context);
        setPolicy(result.policy);
      })
      .catch(() => {
        if (live) setError('The safety history could not be verified. No restrictions were changed.');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [athleteId]));

  const save = async (choice: {
    intent?: AthleteTrainingIntent; protectedMovement?: ProtectedMovement;
  }) => {
    if (!athleteId || !context || busy || currentAthlete.current !== athleteId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await recordAthleteTrainingSafetyContext({
        athleteId, ...choice, expectedLastEventId: context.latestEventId,
      });
      if (currentAthlete.current !== athleteId) return;
      setContext(result.context);
      setPolicy(result.policy);
    } catch {
      if (currentAthlete.current === athleteId) {
        setError('The safety update could not be confirmed. Reopen this screen to refresh history.');
      }
    } finally {
      if (currentAthlete.current === athleteId) setBusy(false);
    }
  };

  const confirm = (choice: {
    intent?: AthleteTrainingIntent; protectedMovement?: ProtectedMovement;
  }, title: string) => {
    if (!context || busy) return;
    Alert.alert(
      title,
      choice.intent
        ? 'This changes the training context only. It cannot remove earlier restrictions or approve a workout.'
        : 'Keep this movement protected in future safety reviews. No exercise will be automatically cleared or modified.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Record', onPress: () => { void save(choice); } },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" style={styles.back}
          onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Profile</Text>
        </Pressable>
        <Text style={styles.headerText}>Training safety context</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>TRAINING · SAFETY CONTEXT</Text>
        <Text style={styles.title}>Training, with your restrictions intact.</Text>
        <Text style={styles.description}>
          Ordinary training does not require a clinician-issued document.
          When an injury or protected movement is reported, Side Quest must
          account for it rather than treating a good day as clearance.
        </Text>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Preview only — no workout approval</Text>
          <Text style={styles.noticeText}>
            This page records context for future planning. Movement-level
            filtering, rehabilitation progression, and executable workout
            authorization are not yet enabled in this development build.
          </Text>
        </View>
        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator/>
            <Text style={styles.helper}>Verifying the athlete's safety history…</Text>
          </View>
        ) : error && !context ? (
          <View style={styles.card}><Text style={styles.error}>{error}</Text></View>
        ) : context && policy ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {policy.track === 'routine_training_review' ? 'Routine training context'
                  : policy.track === 'restriction_aware_review'
                    ? 'Restriction-aware review'
                    : policy.track === 'rehabilitation_review'
                      ? 'Rehabilitation and return-to-sport review'
                      : 'Training context not yet selected'}
              </Text>
              <Text style={styles.helper}>
                Recorded mode: {context.intent.replaceAll('_', ' ')}
              </Text>
              <Text style={styles.helper}>
                Protected movements: {context.activeProtectedMovements.length}
                {context.legacyRestrictionReported ? ' · Earlier draft restriction also reported' : ''}
              </Text>
              {context.ptProfile === 'active' ? (
                <Text style={styles.hold}>Active in-app PT restrictions remain in effect.</Text>
              ) : null}
              {policy.reasons.map((reason, i) => (
                <Text style={styles.helper} key={i}>• {reason}</Text>
              ))}
              <Text style={styles.noticeText}>
                No new exercise has been approved. A mode change never removes
                previously reported restrictions.
              </Text>
            </View>
            <Text style={styles.section}>Choose your training context</Text>
            {intentChoices.map(choice => (
              <Pressable key={choice.id} accessibilityRole="button"
                accessibilityLabel={'Record ' + choice.title}
                disabled={busy}
                style={[styles.card, busy && styles.disabled]}
                onPress={() => confirm({ intent: choice.id }, choice.title)}>
                <Text style={styles.cardTitle}>
                  {context.intent === choice.id ? '✓ ' : ''}{choice.title}
                </Text>
                <Text style={styles.helper}>{choice.description}</Text>
              </Pressable>
            ))}
            <Text style={styles.section}>Protect a movement</Text>
            <View style={styles.card}>
              <Text style={styles.helper}>
                Report a movement that needs to remain limited while you
                train. This is a conservative self-report, not a clinical diagnosis.
                Removing or changing restrictions will require a separate,
                explicitly reviewed workflow.
              </Text>
              {movementChoices.map(choice => {
                const active = context.activeProtectedMovements.includes(choice.id);
                return (
                  <Pressable key={choice.id} accessibilityRole="button"
                    accessibilityLabel={active
                      ? choice.title + ' already protected' : 'Protect ' + choice.title}
                    disabled={busy || active}
                    style={[styles.movement, (busy || active) && styles.disabled]}
                    onPress={() => confirm(
                      { protectedMovement: choice.id }, 'Protect ' + choice.title + '?',
                    )}>
                    <Text style={styles.movementText}>
                      {active ? 'Protected · ' : '+ '}{choice.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.footer}>
              Changes are stored in an append-only, athlete-specific history.
              These reports are not independently verified medical records.
              Current workouts remain unchanged.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.paper, borderBottomWidth: 1,
    borderBottomColor: colors.border, paddingHorizontal: 18, gap: 8 },
  back: { paddingVertical: 10, paddingRight: 8 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  headerText: { color: colors.ink, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  content: { padding: 20, gap: 14, paddingBottom: 64 },
  eyebrow: { fontSize: 11, color: colors.accent, letterSpacing: 1.1, fontWeight: '800' },
  title: { color: colors.ink, fontSize: 27, fontWeight: '800' },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { padding: 17, borderRadius: 16, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.border, gap: 9 },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  notice: { padding: 16, borderRadius: 15, backgroundColor: colors.soft, gap: 7 },
  noticeTitle: { fontSize: 15, color: colors.warning, fontWeight: '800' },
  noticeText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  hold: { color: colors.warning, fontSize: 13, fontWeight: '700' },
  section: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 8 },
  movement: { padding: 13, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, minHeight: 48, justifyContent: 'center' },
  movementText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.52 },
  error: { fontSize: 13, color: colors.warning, fontWeight: '700' },
  footer: { fontSize: 12, color: colors.muted, lineHeight: 19 },
});
