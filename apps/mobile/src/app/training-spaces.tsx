import type { EquipmentId } from '@circuit/domain';
import { equipmentSeed } from '@circuit/exercise-content';
import type { EquipmentCapability, TrainingSpaceProfile } from '@circuit/generator';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { V23GroupedList, V23Row, V23Screen, V23SectionHeader } from '@/components/v23-ui';
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

  function persist(next: TrainingSpacePreferences) {
    setPreferences(next);
    saveTrainingSpacePreferences(next);
  }

  function addTemplate(kind: 'home' | 'gym') {
    const template = kind === 'home' ? basicHomeTemplate() : commercialGymTemplate();
    const withoutSameEnvironment = preferences.spaces.filter((space) => space.environment !== kind);
    const spaces = [...withoutSameEnvironment, template];
    const nextPreference: StrengthLocationPreference = kind === 'home'
      ? preferences.spaces.some((space) => space.environment === 'gym') ? 'mixed' : 'home_only'
      : preferences.spaces.some((space) => space.environment === 'home') ? 'mixed' : 'gym_only';
    persist({ ...preferences, spaces, strengthLocationPreference: nextPreference });
    setEditingId(template.id);
  }

  function removeSpace(spaceId: string) {
    const spaces = preferences.spaces.filter((space) => space.id !== spaceId);
    const hasHome = spaces.some((space) => space.environment === 'home');
    const hasGym = spaces.some((space) => space.environment === 'gym');
    const strengthLocationPreference: StrengthLocationPreference = hasHome && hasGym ? 'mixed' : hasHome ? 'home_only' : hasGym ? 'gym_only' : 'custom';
    persist({ ...preferences, spaces, strengthLocationPreference });
    setEditingId(null);
  }

  const home = preferences.spaces.find((space) => space.environment === 'home');
  const gym = preferences.spaces.find((space) => space.environment === 'gym');
  const editing = preferences.spaces.find((space) => space.id === editingId);

  return <V23Screen>
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>TRAINING SPACES</Text>
        <Text style={styles.title}>Where do you strength train?</Text>
        <Text style={styles.subtitle}>Add only the places you actually use. Side Quest will never assume you own equipment or have a gym membership.</Text>
      </View>
      <Pressable onPress={() => router.back()}><Text style={styles.done}>Done</Text></Pressable>
    </View>

    <V23SectionHeader>Locations</V23SectionHeader>
    <V23GroupedList>
      {home
        ? <V23Row title={home.name} detail={spaceSummary(home)} onPress={() => setEditingId(home.id)} />
        : <V23Row title="Add Home" detail="Bodyweight only is fine. Add equipment only if you own it." onPress={() => addTemplate('home')} />}
      {gym
        ? <V23Row title={gym.name} detail={spaceSummary(gym)} onPress={() => setEditingId(gym.id)} last />
        : <V23Row title="Add Gym" detail="Only add this if you have access to a gym." onPress={() => addTemplate('gym')} last />}
    </V23GroupedList>

    <V23SectionHeader>Weekly preference</V23SectionHeader>
    <View style={styles.preferenceCard}>
      {([
        ['home_only', 'All strength at home'],
        ['gym_only', 'All strength at the gym'],
        ['mixed', 'Use both when available'],
      ] as const).map(([value, label]) => {
        const disabled = (value === 'home_only' && !home) || (value === 'gym_only' && !gym) || (value === 'mixed' && (!home || !gym));
        const active = preferences.strengthLocationPreference === value;
        return <Pressable key={value} disabled={disabled} onPress={() => persist({ ...preferences, strengthLocationPreference: value })} style={[styles.preferenceOption, active && styles.preferenceActive, disabled && styles.disabled]}>
          <Text style={[styles.preferenceText, active && styles.preferenceTextActive]}>{label}</Text>
        </Pressable>;
      })}
      {home && gym && preferences.strengthLocationPreference === 'mixed' ? <>
        <CountRow label="Home sessions per week" value={preferences.preferredHomeSessions} onChange={(value) => persist({ ...preferences, preferredHomeSessions: value })} />
        <CountRow label="Gym sessions per week" value={preferences.preferredGymSessions} onChange={(value) => persist({ ...preferences, preferredGymSessions: value })} />
        <View style={styles.switchRow}><View style={{ flex: 1 }}><Text style={styles.switchTitle}>Prefer gym strength on swim days</Text><Text style={styles.switchDetail}>Useful when the pool and weight room are in the same trip.</Text></View><Switch value={preferences.preferGymOnSwimDays} onValueChange={(value) => persist({ ...preferences, preferGymOnSwimDays: value })} /></View>
      </> : null}
    </View>

    {editing ? <SpaceEditor key={editing.id} space={editing} onSave={(space) => {
      persist({ ...preferences, spaces: preferences.spaces.map((item) => item.id === space.id ? space : item) });
      setEditingId(null);
    }} onDelete={() => removeSpace(editing.id)} onCancel={() => setEditingId(null)} /> : null}
  </V23Screen>;
}

function SpaceEditor({ space, onSave, onDelete, onCancel }: { space: TrainingSpaceProfile; onSave: (space: TrainingSpaceProfile) => void; onDelete: () => void; onCancel: () => void }) {
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
      ? { ...item, [key]: Number.isFinite(parsed) && parsed >= 0 && value.trim() !== '' ? parsed : undefined }
      : item));
  }

  return <View style={styles.editorCard}>
    <View style={styles.editorHeader}><Text style={styles.editorTitle}>Edit {space.environment === 'home' ? 'home' : 'gym'} setup</Text><Pressable onPress={onCancel}><Text style={styles.cancel}>Cancel</Text></Pressable></View>
    <Text style={styles.label}>Name</Text>
    <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Training space" placeholderTextColor={tokens.textMuted} />

    {EQUIPMENT_GROUPS.map((group) => <View key={group.title} style={styles.group}>
      <Text style={styles.groupTitle}>{group.title}</Text>
      <View style={styles.chips}>{group.ids.map((id) => {
        const active = capabilities.some((item) => item.equipmentId === id);
        return <Pressable key={id} onPress={() => toggleEquipment(id)} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{equipmentLabel(id)}</Text></Pressable>;
      })}</View>
    </View>)}

    {(['dumbbell', 'kettlebell'] as EquipmentId[]).map((id) => {
      const capability = capabilities.find((item) => item.equipmentId === id);
      if (!capability) return null;
      return <View key={id} style={styles.loadRow}>
        <View style={styles.loadCopy}><Text style={styles.loadLabel}>{equipmentLabel(id)} range</Text><Text style={styles.loadHint}>Lightest to heaviest available, per weight</Text></View>
        <View style={styles.rangeInputs}>
          <TextInput value={capability.minLoadLb?.toString() ?? ''} onChangeText={(value) => setLoad(id, 'minLoadLb', value)} keyboardType="decimal-pad" style={styles.rangeInput} placeholder="Min" placeholderTextColor={tokens.textMuted} />
          <Text style={styles.rangeDash}>–</Text>
          <TextInput value={capability.maxLoadLb?.toString() ?? ''} onChangeText={(value) => setLoad(id, 'maxLoadLb', value)} keyboardType="decimal-pad" style={styles.rangeInput} placeholder="Max" placeholderTextColor={tokens.textMuted} />
          <Text style={styles.unit}>lb</Text>
        </View>
      </View>;
    })}

    {MAX_LOAD_EQUIPMENT.map((id) => {
      const capability = capabilities.find((item) => item.equipmentId === id);
      if (!capability) return null;
      return <View key={id} style={styles.loadRow}><Text style={styles.loadLabel}>{equipmentLabel(id)} max load</Text><View style={styles.singleLoad}><TextInput value={capability.maxLoadLb?.toString() ?? ''} onChangeText={(value) => setLoad(id, 'maxLoadLb', value)} keyboardType="decimal-pad" style={styles.loadInput} placeholder="Max" placeholderTextColor={tokens.textMuted} /><Text style={styles.unit}>lb</Text></View></View>;
    })}

    <Pressable onPress={() => onSave({ ...space, name: name.trim() || space.name, capabilities })} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Save setup</Text></Pressable>
    <Pressable onPress={onDelete} style={styles.deleteButton}><Text style={styles.deleteButtonText}>Remove this location</Text></Pressable>
  </View>;
}

function CountRow({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return <View style={styles.countRow}><Text style={styles.countLabel}>{label}</Text><TextInput value={value?.toString() ?? ''} onChangeText={(text) => { const parsed = Number(text); onChange(text.trim() === '' ? undefined : Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : value); }} keyboardType="number-pad" style={styles.countInput} placeholder="Auto" placeholderTextColor={tokens.textMuted} /></View>;
}

function equipmentLabel(id: EquipmentId) { return equipmentSeed.find((item) => item.id === id)?.label ?? id; }
function spaceSummary(space: TrainingSpaceProfile) {
  if (space.capabilities.length === 0) return 'No equipment configured';
  const names = space.capabilities.slice(0, 4).map((item) => equipmentLabel(item.equipmentId));
  return `${names.join(', ')}${space.capabilities.length > 4 ? ` +${space.capabilities.length - 4}` : ''}`;
}

function makeStyles(tokens: ReturnType<typeof useTheme>['tokens']) { return StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, headerCopy: { flex: 1, gap: 5 }, eyebrow: { color: tokens.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 }, title: { color: tokens.text, fontSize: 29, lineHeight: 34, fontWeight: '900' }, subtitle: { color: tokens.textMuted, fontSize: 14, lineHeight: 20 }, done: { color: tokens.accent, fontWeight: '800', fontSize: 15, paddingTop: 4 },
  preferenceCard: { backgroundColor: tokens.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, borderRadius: 18, overflow: 'hidden' }, preferenceOption: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border }, preferenceActive: { backgroundColor: tokens.accent }, preferenceText: { color: tokens.text, fontSize: 15, fontWeight: '700' }, preferenceTextActive: { color: '#FFFFFF' }, disabled: { opacity: 0.35 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }, switchTitle: { color: tokens.text, fontSize: 15, fontWeight: '800' }, switchDetail: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, marginTop: 2 }, countRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border }, countLabel: { flex: 1, color: tokens.text, fontSize: 14, fontWeight: '700' }, countInput: { width: 70, textAlign: 'center', color: tokens.text, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 8 },
  editorCard: { backgroundColor: tokens.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, borderRadius: 18, padding: 16, gap: 14 }, editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, editorTitle: { color: tokens.text, fontSize: 19, fontWeight: '900' }, cancel: { color: tokens.accent, fontSize: 14, fontWeight: '800' }, label: { color: tokens.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 }, input: { color: tokens.text, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }, group: { gap: 8 }, groupTitle: { color: tokens.text, fontSize: 14, fontWeight: '800' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 }, chipActive: { backgroundColor: tokens.accent, borderColor: tokens.accent }, chipText: { color: tokens.textMuted, fontSize: 12, fontWeight: '700' }, chipTextActive: { color: '#FFFFFF' }, loadRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, loadCopy: { flex: 1 }, loadLabel: { flex: 1, color: tokens.text, fontSize: 14, fontWeight: '700' }, loadHint: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14, marginTop: 2 }, rangeInputs: { flexDirection: 'row', alignItems: 'center', gap: 5 }, rangeInput: { width: 58, color: tokens.text, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 8, textAlign: 'center' }, rangeDash: { color: tokens.textMuted, fontSize: 14 }, unit: { color: tokens.textMuted, fontSize: 12, fontWeight: '700' }, singleLoad: { flexDirection: 'row', alignItems: 'center', gap: 5 }, loadInput: { width: 70, color: tokens.text, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, textAlign: 'right' }, primaryButton: { backgroundColor: tokens.accent, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, deleteButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, deleteButtonText: { color: tokens.danger, fontSize: 14, fontWeight: '800' },
}); }
