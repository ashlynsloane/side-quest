import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { V23Card, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import { V31_BETA_SCENARIOS, type BetaScenarioId } from '@/data/v31-beta-scenarios';
import { useTheme } from '@/state/theme-context';

export default function BetaScenariosScreen() {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [selectedId, setSelectedId] = useState<BetaScenarioId>('cold-start');
  const selected = V31_BETA_SCENARIOS.find((scenario) => scenario.id === selectedId) ?? V31_BETA_SCENARIOS[0];

  return <V23Screen>
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>BETA REVIEW</Text>
      <Text style={styles.title}>Product scenarios</Text>
      <Text style={styles.body}>Stable reference states for reviewing copy, hierarchy, safeguards, and cross-screen continuity. These scenarios do not overwrite your training data.</Text>
    </View>

    <View style={styles.scenarioGrid}>
      {V31_BETA_SCENARIOS.map((scenario) => {
        const selectedState = scenario.id === selected.id;
        return <Pressable key={scenario.id} onPress={() => setSelectedId(scenario.id)} style={({ pressed }) => [styles.scenarioButton, selectedState && styles.scenarioButtonSelected, pressed && styles.pressed]}>
          <Text style={[styles.scenarioLabel, selectedState && styles.scenarioLabelSelected]}>{scenario.label}</Text>
          <Text style={[styles.scenarioStatus, selectedState && styles.scenarioStatusSelected]}>{scenario.status}</Text>
        </Pressable>;
      })}
    </View>

    <V23Card style={styles.summaryCard}>
      <Text style={styles.cardLabel}>SCENARIO PURPOSE</Text>
      <Text style={styles.cardTitle}>{selected.label}</Text>
      <Text style={styles.body}>{selected.purpose}</Text>
    </V23Card>

    <V23SectionHeader>Athlete context</V23SectionHeader>
    <V23Card style={styles.listCard}>
      {selected.athleteContext.map((item) => <View key={item} style={styles.listRow}><Text style={styles.bullet}>•</Text><Text style={styles.listText}>{item}</Text></View>)}
    </V23Card>

    <V23SectionHeader>Expected product behavior</V23SectionHeader>
    <V23Card style={styles.listCard}>
      {selected.expectedSurfaces.map((item) => <View key={item} style={styles.listRow}><Text style={styles.check}>✓</Text><Text style={styles.listText}>{item}</Text></View>)}
    </V23Card>

    <V23SectionHeader>Review questions</V23SectionHeader>
    <V23Card style={styles.listCard}>
      {selected.reviewQuestions.map((item) => <View key={item} style={styles.listRow}><Text style={styles.question}>?</Text><Text style={styles.listText}>{item}</Text></View>)}
    </V23Card>

    <V23Card style={styles.noteCard}>
      <Text style={styles.noteTitle}>Fixture boundary</Text>
      <Text style={styles.body}>V31.7G adds deterministic review fixtures only. It does not seed the database, impersonate real athletes, alter planner outputs, or enable hidden production behavior.</Text>
    </V23Card>
  </V23Screen>;
}

function makeStyles(tokens: ReturnType<typeof useTheme>['tokens']) { return StyleSheet.create({
  intro: { gap: 6, marginBottom: 4 },
  eyebrow: { color: tokens.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: tokens.text, fontSize: 28, lineHeight: 33, fontWeight: '900' },
  body: { color: tokens.textMuted, fontSize: 14, lineHeight: 20 },
  scenarioGrid: { gap: 9 },
  scenarioButton: { minHeight: 62, borderWidth: 1, borderColor: tokens.border, borderRadius: 16, backgroundColor: tokens.surface, paddingHorizontal: 15, paddingVertical: 11, justifyContent: 'center' },
  scenarioButtonSelected: { borderColor: tokens.accent, backgroundColor: tokens.surfaceMuted },
  scenarioLabel: { color: tokens.text, fontSize: 15, lineHeight: 19, fontWeight: '800' },
  scenarioLabelSelected: { color: tokens.accent },
  scenarioStatus: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  scenarioStatusSelected: { color: tokens.text },
  summaryCard: { gap: 7 },
  cardLabel: { color: tokens.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 },
  cardTitle: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  listCard: { gap: 10 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { color: tokens.accent, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  check: { color: tokens.accent, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  question: { color: tokens.text, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  listText: { flex: 1, color: tokens.text, fontSize: 14, lineHeight: 20 },
  noteCard: { gap: 6 },
  noteTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  pressed: { opacity: 0.72 },
}); }
