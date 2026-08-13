import type { EquipmentId } from '@circuit/domain';
import { equipmentSeed } from '@circuit/exercise-content';
import type { EquipmentCapability, TrainingSpaceProfile } from '@circuit/generator';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { V23Icon, V23Screen } from '@/components/v23-ui';
import {
  basicHomeTemplate,
  commercialGymTemplate,
  defaultTrainingSpacePreferences,
  loadTrainingSpacePreferences,
  saveTrainingSpacePreferences,
  type StrengthLocationPreference,
  type TrainingSpacePreferences,
} from '@/services/training-spaces';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const EQUIPMENT_GROUPS: Array<{ title: string; ids: EquipmentId[] }> = [
  { title: 'Free weights', ids: ['dumbbell', 'kettlebell', 'barbell', 'weight_plate', 'trap_bar', 'medicine_ball'] },
  { title: 'Home + portable', ids: ['bench', 'bosu', 'stability_ball', 'slider', 'mini_band', 'long_band', 'trx', 'box', 'pullup_bar'] },
  { title: 'Gym equipment', ids: ['cable_machine', 'leg_press'] },
];

const RANGE_EQUIPMENT = new Set<EquipmentId>(['dumbbell', 'kettlebell']);
const MAX_LOAD_EQUIPMENT: EquipmentId[] = ['medicine_ball', 'barbell', 'trap_bar'];

export default function TrainingSpacesScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [preferences, setPreferences] = useState<TrainingSpacePreferences>(defaultTrainingSpacePreferences());
  const [editingId, setEditingId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    setPreferences(loadTrainingSpacePreferences());
  }, []));

  const persist = (next: TrainingSpacePreferences) => {
    setPreferences(next);
    saveTrainingSpacePreferences(next);
  };

  const home = preferences.spaces.find((space) => space.environment === 'home');
  const gym = preferences.spaces.find((space) => space.environment === 'gym');
  const editing = preferences.spaces.find((space) => space.id === editingId);

  function addTemplate(kind: 'home' | 'gym') {
    const template = kind === 'home' ? basicHomeTemplate() : commercialGymTemplate();
    const withoutSameEnvironment = preferences.spaces.filter((space) => space.environment !== kind);
    const spaces = [...withoutSameEnvironment, template];
    const hasOther = preferences.spaces.some((space) => space.environment === (kind === 'home' ? 'gym' : 'home'));
    persist({
      ...preferences,
      spaces,
      strengthLocationPreference: hasOther ? 'mixed' : kind === 'home' ? 'home_only' : 'gym_only',
    });
    setEditingId(template.id);
  }

  function removeSpace(spaceId: string) {
    const spaces = preferences.spaces.filter((space) => space.id !== spaceId);
    const hasHome = spaces.some((space) => space.environment === 'home');
    const hasGym = spaces.some((space) => space.environment === 'gym');
    const strengthLocationPreference: StrengthLocationPreference = hasHome && hasGym
      ? 'mixed'
      : hasHome
        ? 'home_only'
        : hasGym
          ? 'gym_only'
          : 'custom';
    persist({ ...preferences, spaces, strengthLocationPreference });
    setEditingId(null);
  }

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>TRAINING SETUP</Text>
        <Text style={styles.title}>Training spaces</Text>
        <Text style={styles.subtitle}>Tell Side Quest what is actually available at home and at the gym. Location changes exercise selection; it does not override the week’s training priorities.</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}>
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </View>

    <SectionHeader eyebrow="LOCATIONS" title="Where you strength train" styles={styles} />
    <View style={styles.locationStack}>
      <LocationCard
        title={home?.name ?? 'Home'}
        body={home ? spaceSummary(home) : 'Start with bodyweight, then add only equipment you actually own.'}
        icon="equipment"
        action={home ? 'Edit setup' : 'Add home'}
        onPress={() => home ? setEditingId(home.id) : addTemplate('home')}
        styles={styles}
        tokens={tokens}
      />
      <LocationCard
        title={gym?.name ?? 'Gym'}
        body={gym ? spaceSummary(gym) : 'Add a commercial gym only if you actually have access to one.'}
        icon="equipment"
        action={gym ? 'Edit setup' : 'Add gym'}
        onPress={() => gym ? setEditingId(gym.id) : addTemplate('gym')}
        styles={styles}
        tokens={tokens}
      />
    </View>

    <SectionHeader eyebrow="WEEKLY USE" title="How Side Quest should use them" styles={styles} />
    <View style={styles.preferenceCard}>
      <PreferenceRow label="All strength at home" value="home_only" enabled={Boolean(home)} preferences={preferences} persist={persist} styles={styles} />
      <PreferenceRow label="All strength at the gym" value="gym_only" enabled={Boolean(gym)} preferences={preferences} persist={persist} styles={styles} />
      <PreferenceRow label="Use both when available" value="mixed" enabled={Boolean(home && gym)} preferences={preferences} persist={persist} styles={styles} last={!(home && gym && preferences.strengthLocationPreference === 'mixed')} />
      {home && gym && preferences.strengthLocationPreference === 'mixed' ? <>
        <CountRow label="Home sessions per week" value={preferences.preferredHomeSessions} onChange={(value) => persist({ ...preferences, preferredHomeSessions: value })} styles={styles} tokens={tokens} />
        <CountRow label="Gym sessions per week" value={preferences.preferredGymSessions} onChange={(value) => persist({ ...preferences, preferredGymSessions: value })} styles={styles} tokens={tokens} />
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>Prefer gym strength on swim days</Text>
            <Text style={styles.switchBody}>Use this as a convenience preference when the pool and weight room are part of the same trip.</Text>
          </View>
          <Switch value={preferences.preferGymOnSwimDays} onValueChange={(value) => persist({ ...preferences, preferGymOnSwimDays: value })} />
        </View>
      </> : null}
    </View>

    <View style={styles.infoCard}>
      <View style={styles.infoIcon}><V23Icon name="insights" color={tokens.accent} size={18} /></View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoTitle}>Gym time should earn its place.</Text>
        <Text style={styles.infoBody}>When both locations are available, Side Quest can reserve gym sessions for movements that materially benefit from heavier loading, machines, cables, or equipment you cannot reproduce at home.</Text>
      </View>
    </View>

    {editing ? <SpaceEditor
      key={editing.id}
      space={editing}
      onCancel={() => setEditingId(null)}
      onDelete={() => removeSpace(editing.id)}
      onSave={(space) => {
        persist({ ...preferences, spaces: preferences.spaces.map((item) => item.id === space.id ? space : item) });
        setEditingId(null);
      }}
    /> : null}
  </V23Screen>;
}

function SectionHeader({ eyebrow, title, styles }: { eyebrow: string; title: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.sectionHeading}><Text style={styles.sectionEyebrow}>{eyebrow}</Text><Text style={styles.sectionTitle}>{title}</Text></View>;
}

function LocationCard({ title, body, action, onPress, styles, tokens }: {
  title: string;
  body: string;
  icon: Parameters<typeof V23Icon>[0]['name'];
  action: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.locationCard, pressed && styles.pressed]}>
    <View style={styles.locationIcon}><V23Icon name="equipment" color={tokens.accent} size={20} /></View>
    <View style={styles.locationCopy}><Text style={styles.locationTitle}>{title}</Text><Text style={styles.locationBody}>{body}</Text><Text style={styles.locationAction}>{action}</Text></View>
    <V23Icon name="chevron" color={tokens.textMuted} size={15} />
  </Pressable>;
}

function PreferenceRow({ label, value, enabled, preferences, persist, styles, last = false }: {
  label: string;
  value: StrengthLocationPreference;
  enabled: boolean;
  preferences: TrainingSpacePreferences;
  persist: (next: TrainingSpacePreferences) => void;
  styles: ReturnType<typeof makeStyles>;
  last?: boolean;
}) {
  const active = preferences.strengthLocationPreference === value;
  return <Pressable
    disabled={!enabled}
    onPress={() => persist({ ...preferences, strengthLocationPreference: value })}
    style={({ pressed }) => [styles.preferenceRow, last && styles.lastRow, !enabled && styles.disabled, pressed && styles.pressed]}
  >
    <View style={[styles.radioOuter, active && styles.radioOuterActive]}>{active ? <View style={styles.radioInner} /> : null}</View>
    <Text style={styles.preferenceLabel}>{label}</Text>
  </Pressable>;
}

function CountRow({ label, value, onChange, styles, tokens }: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <View style={styles.countRow}>
    <Text style={styles.countLabel}>{label}</Text>
    <TextInput
      value={value?.toString() ?? ''}
      onChangeText={(text) => {
        const parsed = Number(text);
        onChange(text.trim() === '' ? undefined : Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : value);
      }}
      keyboardType="number-pad"
      placeholder="Auto"
      placeholderTextColor={tokens.textMuted}
      style={styles.countInput}
    />
  </View>;
}

function SpaceEditor({ space, onSave, onDelete, onCancel }: {
  space: TrainingSpaceProfile;
  onSave: (space: TrainingSpaceProfile) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [name, setName] = useState(space.name);
  const [capabilities, setCapabilities] = useState<EquipmentCapability[]>(space.capabilities);

  function toggleEquipment(id: EquipmentId) {
    setCapabilities((current) => current.some((item) => item.equipmentId === id)
      ? current.filter((item) => item.equipmentId !== id)
      : [...current, {
          equipmentId: id,
          quantity: id === 'dumbbell' ? 2 : 1,
          adjustable: RANGE_EQUIPMENT.has(id) ? true : undefined,
        }]);
  }

  function setLoad(id: EquipmentId, key: 'minLoadLb' | 'maxLoadLb', value: string) {
    const parsed = Number(value);
    setCapabilities((current) => current.map((item) => item.equipmentId === id
      ? { ...item, [key]: value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined }
      : item));
  }

  return <View style={styles.editorCard}>
    <View style={styles.editorHeader}>
      <View style={styles.editorHeaderCopy}><Text style={styles.editorEyebrow}>EDIT LOCATION</Text><Text style={styles.editorTitle}>{space.environment === 'home' ? 'Home setup' : 'Gym setup'}</Text></View>
      <Pressable onPress={onCancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
    </View>

    <Text style={styles.inputLabel}>Name</Text>
    <TextInput value={name} onChangeText={setName} placeholder="Training space" placeholderTextColor={tokens.textMuted} style={styles.nameInput} />

    {EQUIPMENT_GROUPS.map((group) => <View key={group.title} style={styles.equipmentGroup}>
      <Text style={styles.equipmentGroupTitle}>{group.title}</Text>
      <View style={styles.chipWrap}>{group.ids.map((id) => {
        const active = capabilities.some((item) => item.equipmentId === id);
        return <Pressable key={id} onPress={() => toggleEquipment(id)} style={[styles.chip, active && styles.chipActive]}>
          <Text style={[styles.chipText, active && styles.chipTextActive]}>{equipmentLabel(id)}</Text>
        </Pressable>;
      })}</View>
    </View>)}

    {(['dumbbell', 'kettlebell'] as EquipmentId[]).map((id) => {
      const capability = capabilities.find((item) => item.equipmentId === id);
      if (!capability) return null;
      return <View key={id} style={styles.loadRow}>
        <View style={styles.loadCopy}><Text style={styles.loadTitle}>{equipmentLabel(id)} range</Text><Text style={styles.loadBody}>Lightest to heaviest available</Text></View>
        <View style={styles.rangeWrap}>
          <TextInput value={capability.minLoadLb?.toString() ?? ''} onChangeText={(value) => setLoad(id, 'minLoadLb', value)} keyboardType="decimal-pad" placeholder="Min" placeholderTextColor={tokens.textMuted} style={styles.rangeInput} />
          <Text style={styles.rangeDash}>–</Text>
          <TextInput value={capability.maxLoadLb?.toString() ?? ''} onChangeText={(value) => setLoad(id, 'maxLoadLb', value)} keyboardType="decimal-pad" placeholder="Max" placeholderTextColor={tokens.textMuted} style={styles.rangeInput} />
          <Text style={styles.unit}>lb</Text>
        </View>
      </View>;
    })}

    {MAX_LOAD_EQUIPMENT.map((id) => {
      const capability = capabilities.find((item) => item.equipmentId === id);
      if (!capability) return null;
      return <View key={id} style={styles.loadRow}>
        <Text style={styles.loadTitle}>{equipmentLabel(id)} max load</Text>
        <View style={styles.singleLoad}><TextInput value={capability.maxLoadLb?.toString() ?? ''} onChangeText={(value) => setLoad(id, 'maxLoadLb', value)} keyboardType="decimal-pad" placeholder="Max" placeholderTextColor={tokens.textMuted} style={styles.maxInput} /><Text style={styles.unit}>lb</Text></View>
      </View>;
    })}

    <Pressable onPress={() => onSave({ ...space, name: name.trim() || space.name, capabilities })} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Save setup</Text></Pressable>
    <Pressable onPress={onDelete} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><Text style={styles.deleteText}>Remove this location</Text></Pressable>
  </View>;
}

function equipmentLabel(id: EquipmentId): string {
  return equipmentSeed.find((item) => item.id === id)?.label ?? id;
}

function spaceSummary(space: TrainingSpaceProfile): string {
  const visible = space.capabilities.filter((item) => item.equipmentId !== 'bodyweight');
  if (visible.length === 0) return 'Bodyweight only';
  const names = visible.slice(0, 4).map((item) => equipmentLabel(item.equipmentId));
  return `${names.join(', ')}${visible.length > 4 ? ` +${visible.length - 4}` : ''}`;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 18, paddingTop: 14, paddingBottom: 42 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    headerCopy: { flex: 1, gap: 4 },
    eyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.05 },
    title: { color: tokens.text, fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -0.45 },
    subtitle: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
    doneButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 },
    doneText: { color: tokens.accent, fontSize: 13.5, fontWeight: '900' },
    sectionHeading: { gap: 2, paddingHorizontal: 2, marginTop: 2 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    sectionTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900', letterSpacing: -0.15 },
    locationStack: { gap: 10 },
    locationCard: { minHeight: 94, borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    locationIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    locationCopy: { flex: 1, minWidth: 0, gap: 2 },
    locationTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    locationBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    locationAction: { color: tokens.accent, fontSize: 11.5, lineHeight: 16, fontWeight: '900', marginTop: 2 },
    preferenceCard: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    preferenceRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    lastRow: { borderBottomWidth: 0 },
    radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' },
    radioOuterActive: { borderColor: tokens.accent },
    radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.accent },
    preferenceLabel: { flex: 1, color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    disabled: { opacity: 0.34 },
    countRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    countLabel: { flex: 1, color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    countInput: { width: 68, minHeight: 38, borderWidth: 1, borderColor: tokens.border, borderRadius: 12, color: tokens.text, textAlign: 'center', fontSize: 13, fontWeight: '800' },
    switchRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 10 },
    switchCopy: { flex: 1, minWidth: 0, gap: 2 },
    switchTitle: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '900' },
    switchBody: { color: tokens.textMuted, fontSize: 11, lineHeight: 15 },
    infoCard: { borderRadius: 20, backgroundColor: tokens.surfaceMuted, padding: 15, flexDirection: 'row', gap: 11 },
    infoIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    infoCopy: { flex: 1, minWidth: 0, gap: 3 },
    infoTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    infoBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    editorCard: { borderRadius: 22, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 16, gap: 15 },
    editorHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    editorHeaderCopy: { flex: 1, gap: 2 },
    editorEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    editorTitle: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
    cancelText: { color: tokens.accent, fontSize: 13, fontWeight: '900' },
    inputLabel: { color: tokens.textMuted, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.75 },
    nameInput: { minHeight: 46, borderWidth: 1, borderColor: tokens.border, borderRadius: 13, color: tokens.text, paddingHorizontal: 12, fontSize: 14 },
    equipmentGroup: { gap: 8 },
    equipmentGroupTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    chip: { borderWidth: 1, borderColor: tokens.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
    chipActive: { borderColor: tokens.accent, backgroundColor: tokens.accent },
    chipText: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },
    chipTextActive: { color: '#FFFFFF' },
    loadRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
    loadCopy: { flex: 1, minWidth: 0 },
    loadTitle: { flex: 1, color: tokens.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
    loadBody: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14, marginTop: 1 },
    rangeWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    rangeInput: { width: 55, minHeight: 38, borderWidth: 1, borderColor: tokens.border, borderRadius: 11, color: tokens.text, textAlign: 'center', fontSize: 12.5, fontWeight: '800' },
    rangeDash: { color: tokens.textMuted, fontSize: 13, fontWeight: '800' },
    singleLoad: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    maxInput: { width: 66, minHeight: 38, borderWidth: 1, borderColor: tokens.border, borderRadius: 11, color: tokens.text, textAlign: 'center', fontSize: 12.5, fontWeight: '800' },
    unit: { color: tokens.textMuted, fontSize: 10.5, fontWeight: '800' },
    primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
    deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    deleteText: { color: tokens.danger, fontSize: 13, fontWeight: '900' },
    pressed: { opacity: 0.72 },
  });
}
