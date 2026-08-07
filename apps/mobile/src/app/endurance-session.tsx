import { buildEndurancePrescription } from '@circuit/planner/endurance-prescription';
import type { PlannedMultisportSession } from '@circuit/planner/multisport';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EnduranceSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ session?: string }>();
  const session = useMemo(() => parseSession(params.session), [params.session]);
  const prescription = useMemo(() => session ? buildEndurancePrescription(session) : null, [session]);

  if (!session || !prescription) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹ Week</Text></Pressable>
          <Text style={styles.topTitle}>Session</Text>
        </View>
        <View style={styles.emptyCard}>
          <Text style={styles.title}>Session unavailable</Text>
          <Text style={styles.body}>This planned endurance session could not be loaded. Return to Week and open it again.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹ Week</Text></Pressable>
        <Text style={styles.topTitle}>{disciplineLabel(session.discipline)}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{session.date} · {ownershipLabel(session.ownership)}</Text>
          <Text style={styles.title}>{prescription.title}</Text>
          <Text style={styles.heroMeta}>{prescription.totalMinutes} min · {session.intensity} · {session.priority}</Text>
          <Text style={styles.body}>{prescription.objective}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Effort target</Text>
          <Text style={styles.body}>{prescription.effortGuide}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Workout</Text>
          {prescription.steps.map((step, index) => (
            <View key={`${step.label}-${index}`} style={[styles.step, index === prescription.steps.length - 1 && styles.stepLast]}>
              <View style={styles.stepTime}><Text style={styles.stepMinutes}>{step.minutes}</Text><Text style={styles.stepUnit}>min</Text></View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{step.label} · {step.effort}</Text>
                <Text style={styles.body}>{step.instruction}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Why this is here</Text>
          {prescription.whyThisSession.map((reason, index) => <Text key={index} style={styles.bullet}>• {reason}</Text>)}
        </View>

        <View style={styles.guardrailCard}>
          <Text style={styles.sectionTitle}>Guardrails</Text>
          {prescription.guardrails.map((guardrail, index) => <Text key={index} style={styles.bullet}>• {guardrail}</Text>)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function parseSession(value: string | undefined): PlannedMultisportSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as PlannedMultisportSession;
    if (!parsed?.id || !parsed?.date || !parsed?.discipline) return null;
    return parsed;
  } catch {
    return null;
  }
}

function disciplineLabel(value: PlannedMultisportSession['discipline']) {
  if (value === 'swim') return 'Swim';
  if (value === 'bike') return 'Bike';
  if (value === 'run') return 'Run';
  return 'Session';
}

function ownershipLabel(value: PlannedMultisportSession['ownership']) {
  if (value === 'fixed') return 'Fixed';
  if (value === 'preferred') return 'Preferred';
  return 'Side Quest planned';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F7F5' },
  topBar: { minHeight: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D7E2DE', backgroundColor: '#FFFFFF' },
  backButton: { width: 92, minHeight: 44, justifyContent: 'center' },
  backText: { color: '#267A70', fontSize: 16, fontWeight: '700' },
  topTitle: { flex: 1, marginRight: 92, textAlign: 'center', color: '#153B35', fontSize: 17, fontWeight: '800' },
  content: { padding: 18, paddingBottom: 40, gap: 12 },
  hero: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, gap: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D7E2DE' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#D7E2DE' },
  guardrailCard: { backgroundColor: '#EEF4F1', borderRadius: 18, padding: 18, gap: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: '#CBDAD4' },
  emptyCard: { margin: 18, padding: 20, borderRadius: 18, backgroundColor: '#FFFFFF' },
  eyebrow: { color: '#397D73', fontSize: 12, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  title: { color: '#153B35', fontSize: 28, lineHeight: 34, fontWeight: '850' },
  heroMeta: { color: '#5D736E', fontSize: 15, fontWeight: '700' },
  sectionTitle: { color: '#153B35', fontSize: 18, lineHeight: 23, fontWeight: '800' },
  body: { color: '#526B65', fontSize: 15, lineHeight: 22 },
  bullet: { color: '#526B65', fontSize: 15, lineHeight: 22 },
  step: { flexDirection: 'row', gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2EAE7' },
  stepLast: { borderBottomWidth: 0 },
  stepTime: { width: 44, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 1 },
  stepMinutes: { color: '#267A70', fontSize: 20, fontWeight: '850' },
  stepUnit: { color: '#71847F', fontSize: 11, fontWeight: '700' },
  stepCopy: { flex: 1, gap: 4 },
  stepTitle: { color: '#183F38', fontSize: 15, lineHeight: 20, fontWeight: '800' },
});
