import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { V23Card, V23PageIntro, V23PrimaryButton, V23Screen } from '@/components/v23-ui';
import type { WholeAthleteHealthPreferences } from '@/services/whole-athlete-plan';
import {
  loadWholeAthleteHealthPreferences,
  saveWholeAthleteHealthPreferences,
} from '@/services/whole-athlete-plan-runtime';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

type Option<T extends string> = { value: T; label: string; detail: string };

export default function TrainingGuardrailsScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [value, setValue] = useState<WholeAthleteHealthPreferences>(() => loadWholeAthleteHealthPreferences());

  function save() {
    saveWholeAthleteHealthPreferences(value);
    router.back();
  }

  return <V23Screen contentStyle={styles.page}>
    <V23PageIntro
      label="PLANNING INPUTS"
      title="Recovery guardrails"
      body="These inputs tell Side Quest whether to progress, hold, simplify, or reduce the training week. They do not replace your injury restrictions or daily check-in."
    />

    <OptionCard
      title="Fueling / energy availability"
      value={value.energyAvailability}
      options={[
        { value: 'adequate', label: 'No concern', detail: 'Normal progression can be considered.' },
        { value: 'uncertain', label: 'Unsure', detail: 'Hold progression until the signal is clearer.' },
        { value: 'concerning', label: 'Concern', detail: 'Reduce avoidable intensity and do not increase total training stress.' },
      ]}
      onChange={(energyAvailability) => setValue((current) => ({ ...current, energyAvailability }))}
      styles={styles}
    />

    <OptionCard
      title="Cycle / hormonal recovery pattern"
      value={value.menstrualRecovery}
      options={[
        { value: 'stable', label: 'Stable', detail: 'No extra planning constraint from this signal.' },
        { value: 'unknown', label: 'Not tracking / unsure', detail: 'This signal will not be used to justify adding load.' },
        { value: 'disrupted', label: 'Disrupted', detail: 'Hold progression and reduce discretionary training stress.' },
      ]}
      onChange={(menstrualRecovery) => setValue((current) => ({ ...current, menstrualRecovery }))}
      styles={styles}
    />

    <OptionCard
      title="Mental energy"
      value={value.mentalEnergy}
      options={[
        { value: 'good', label: 'Good', detail: 'Normal session density can be considered.' },
        { value: 'limited', label: 'Limited', detail: 'Prefer fewer, familiar sessions and less optional work.' },
        { value: 'depleted', label: 'Depleted', detail: 'Recovery takes priority over generated training load.' },
      ]}
      onChange={(mentalEnergy) => setValue((current) => ({ ...current, mentalEnergy }))}
      styles={styles}
    />

    <OptionCard
      title="Life stress"
      value={value.lifeStress}
      options={[
        { value: 'low', label: 'Low', detail: 'No extra training constraint from life load.' },
        { value: 'moderate', label: 'Moderate', detail: 'Keep recovery spacing and avoid unnecessary extras.' },
        { value: 'high', label: 'High', detail: 'Hold progression and simplify the week.' },
        { value: 'overwhelming', label: 'Overwhelming', detail: 'Do not add generated training load.' },
      ]}
      onChange={(lifeStress) => setValue((current) => ({ ...current, lifeStress }))}
      styles={styles}
    />

    <V23PrimaryButton onPress={save} icon="check">Save guardrails</V23PrimaryButton>
  </V23Screen>;
}

function OptionCard<T extends string>({ title, value, options, onChange, styles }: {
  title: string;
  value: T;
  options: Array<Option<T>>;
  onChange: (value: T) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return <V23Card>
    <Text style={styles.cardTitle}>{title}</Text>
    <View style={styles.options}>{options.map((option) => {
      const selected = option.value === value;
      return <Pressable
        key={option.value}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onChange(option.value)}
        style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
      >
        <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
        <View style={styles.copy}>
          <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{option.label}</Text>
          <Text style={styles.optionDetail}>{option.detail}</Text>
        </View>
      </Pressable>;
    })}</View>
  </V23Card>;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 14, paddingBottom: 34 },
    cardTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '800' },
    options: { gap: 8, marginTop: 11 },
    option: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: tokens.surface },
    optionSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    pressed: { opacity: 0.72 },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    radioSelected: { borderColor: tokens.accent },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.accent },
    copy: { flex: 1 },
    optionLabel: { color: tokens.text, fontSize: 15.5, lineHeight: 20, fontWeight: '700' },
    optionLabelSelected: { color: tokens.accent },
    optionDetail: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  });
}
