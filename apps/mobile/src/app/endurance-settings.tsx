import type { BikeEnvironment, RunEnvironment, SwimEnvironment } from '@circuit/planner/endurance-prescription';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { V23Card, V23Icon, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import {
  RETURN_TO_RUN_STAGE_OPTIONS,
  formatCssPace,
  loadEndurancePrescriptionProfile,
  parseCssPace,
  saveEndurancePrescriptionProfile,
  selectedReturnToRunStage,
  type EndurancePrescriptionProfile,
} from '@/services/endurance-profile';
import { refreshLatestWholeAthletePlan } from '@/services/whole-athlete-plan-runtime';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export default function EnduranceSettingsScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [profile, setProfile] = useState<EndurancePrescriptionProfile>(() => loadEndurancePrescriptionProfile());
  const [cssText, setCssText] = useState(() => formatCssPace(profile.cssSecondsPer100));
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedStage = selectedReturnToRunStage(profile)?.id;

  function choosePool(length: 25 | 50, unit: 'yd' | 'm') {
    const unitChanged = unit !== profile.swimDistanceUnit;
    setProfile((current) => ({
      ...current,
      swimEnvironment: 'pool',
      poolLength: length,
      swimDistanceUnit: unit,
      ...(unitChanged ? { cssSecondsPer100: undefined } : {}),
    }));
    if (unitChanged) setCssText('');
  }

  async function save() {
    setMessage(null);
    const css = cssText.trim() ? parseCssPace(cssText) : undefined;
    if (cssText.trim() && css === undefined) {
      setMessage('Enter CSS as m:ss per 100, for example 1:25.');
      return;
    }
    setSaving(true);
    try {
      const saved = saveEndurancePrescriptionProfile({
        ...profile,
        ...(css !== undefined ? { cssSecondsPer100: css } : { cssSecondsPer100: undefined }),
      });
      setProfile(saved);
      await refreshLatestWholeAthletePlan().catch(() => null);
      setMessage('Endurance setup saved. Your generated workouts will use these settings.');
    } finally {
      setSaving(false);
    }
  }

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>ENDURANCE SETUP</Text>
      <Text style={styles.title}>How you train</Text>
      <Text style={styles.subtitle}>These details let Side Quest prescribe sport-specific sessions instead of generic cardio blocks.</Text>
    </View>

    <View>
      <V23SectionHeader>SWIM</V23SectionHeader>
      <V23Card style={styles.card}>
        <Text style={styles.label}>Environment</Text>
        <OptionRow options={[
          ['pool', 'Pool'],
          ['open_water', 'Open water'],
        ] as Array<[SwimEnvironment, string]>} selected={profile.swimEnvironment} onSelect={(value) => setProfile((current) => ({ ...current, swimEnvironment: value }))} styles={styles} />

        {profile.swimEnvironment === 'pool' ? <>
          <Text style={styles.label}>Pool</Text>
          <View style={styles.options}>
            <Choice label="25 yd" selected={profile.poolLength === 25 && profile.swimDistanceUnit === 'yd'} onPress={() => choosePool(25, 'yd')} styles={styles} />
            <Choice label="25 m" selected={profile.poolLength === 25 && profile.swimDistanceUnit === 'm'} onPress={() => choosePool(25, 'm')} styles={styles} />
            <Choice label="50 m" selected={profile.poolLength === 50 && profile.swimDistanceUnit === 'm'} onPress={() => choosePool(50, 'm')} styles={styles} />
          </View>

          <View style={styles.fieldHeader}>
            <View style={styles.fieldCopy}>
              <Text style={styles.label}>CSS pace</Text>
              <Text style={styles.helper}>Optional · per 100 {profile.swimDistanceUnit}. Used to calculate interval pace ranges.</Text>
            </View>
          </View>
          <TextInput
            value={cssText}
            onChangeText={setCssText}
            placeholder="1:25"
            placeholderTextColor={tokens.textMuted}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
          <Text style={styles.note}>If CSS is blank, Side Quest still writes distance-based sets but keeps the target effort-based rather than inventing a pace.</Text>
        </> : <Text style={styles.note}>Open-water sessions use time and effort with sighting/navigation cues rather than pool send-offs.</Text>}
      </V23Card>
    </View>

    <View>
      <V23SectionHeader>BIKE</V23SectionHeader>
      <V23Card style={styles.card}>
        <Text style={styles.label}>Default environment</Text>
        <OptionRow options={[
          ['outdoor', 'Outdoor'],
          ['indoor_trainer', 'Indoor trainer'],
          ['mountain_bike', 'Mountain bike'],
        ] as Array<[BikeEnvironment, string]>} selected={profile.bikeEnvironment} onSelect={(value) => setProfile((current) => ({ ...current, bikeEnvironment: value }))} styles={styles} />
        <Text style={styles.note}>Course terrain from your goal is layered on top of this—for example, hilly outdoor rides can use climbs for work intervals.</Text>
      </V23Card>
    </View>

    <View>
      <V23SectionHeader>RUN</V23SectionHeader>
      <V23Card style={styles.card}>
        <Text style={styles.label}>Default environment</Text>
        <OptionRow options={[
          ['outdoor', 'Outdoor'],
          ['treadmill', 'Treadmill'],
          ['track', 'Track'],
          ['trail', 'Trail'],
        ] as Array<[RunEnvironment, string]>} selected={profile.runEnvironment} onSelect={(value) => setProfile((current) => ({ ...current, runEnvironment: value }))} styles={styles} />
        <Text style={styles.note}>Terrain changes the workout cue. Hills use effort on climbs; technical trail work avoids pretending flat-road pace is meaningful.</Text>
      </V23Card>
    </View>

    <View>
      <V23SectionHeader>RETURN TO RUN</V23SectionHeader>
      <V23Card style={styles.card}>
        <Text style={styles.sectionTitle}>Run / walk stage</Text>
        <Text style={styles.note}>Select a stage only when it matches the return-to-run progression you are currently using. Side Quest will not automatically advance this stage.</Text>
        <Pressable onPress={() => setProfile((current) => ({ ...current, returnToRunProtocol: undefined }))} style={[styles.stageRow, !selectedStage && styles.stageSelected]}>
          <View style={styles.stageCopy}><Text style={styles.stageTitle}>No stage configured</Text><Text style={styles.stageDetail}>Do not generate a run/walk prescription yet.</Text></View>
          {!selectedStage ? <V23Icon name="check" color={tokens.accent} size={17} /> : null}
        </Pressable>
        {RETURN_TO_RUN_STAGE_OPTIONS.map((option) => <Pressable key={option.id} onPress={() => setProfile((current) => ({ ...current, returnToRunProtocol: option.protocol }))} style={[styles.stageRow, selectedStage === option.id && styles.stageSelected]}>
          <View style={styles.stageCopy}><Text style={styles.stageTitle}>{option.label}</Text><Text style={styles.stageDetail}>{option.detail}</Text></View>
          {selectedStage === option.id ? <V23Icon name="check" color={tokens.accent} size={17} /> : null}
        </Pressable>)}
      </V23Card>
    </View>

    {message ? <Text style={styles.message}>{message}</Text> : null}
    <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.saveButton, saving && styles.disabled]}>
      <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save endurance setup'}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>Back</Text></Pressable>
  </V23Screen>;
}

function OptionRow<T extends string>({ options, selected, onSelect, styles }: {
  options: Array<[T, string]>;
  selected: T;
  onSelect: (value: T) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return <View style={styles.options}>{options.map(([value, label]) => <Choice key={value} label={label} selected={selected === value} onPress={() => onSelect(value)} styles={styles} />)}</View>;
}

function Choice({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 20, paddingTop: 18, paddingBottom: 40 },
    intro: { gap: 5 },
    eyebrow: { color: tokens.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.05 },
    title: { color: tokens.text, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.45 },
    subtitle: { color: tokens.textMuted, fontSize: 14, lineHeight: 20 },
    card: { padding: 16, gap: 11 },
    label: { color: tokens.text, fontSize: 12.5, fontWeight: '900' },
    helper: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    note: { color: tokens.textMuted, fontSize: 12, lineHeight: 18 },
    sectionTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choice: { minHeight: 39, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    choiceSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    choiceText: { color: tokens.textMuted, fontSize: 12, fontWeight: '800' },
    choiceTextSelected: { color: tokens.accent },
    fieldHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    fieldCopy: { flex: 1, gap: 2 },
    input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, color: tokens.text, paddingHorizontal: 13, fontSize: 16, fontWeight: '800' },
    stageRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: tokens.border, padding: 12 },
    stageSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    stageCopy: { flex: 1, gap: 2 },
    stageTitle: { color: tokens.text, fontSize: 13, fontWeight: '900' },
    stageDetail: { color: tokens.textMuted, fontSize: 11, lineHeight: 15 },
    message: { color: tokens.accent, fontSize: 12.5, lineHeight: 18, fontWeight: '800' },
    saveButton: { minHeight: 50, borderRadius: 15, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center' },
    saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
    backButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    backButtonText: { color: tokens.textMuted, fontSize: 13, fontWeight: '800' },
    disabled: { opacity: 0.55 },
  });
}
