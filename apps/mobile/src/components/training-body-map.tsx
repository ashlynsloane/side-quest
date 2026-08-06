import type { BodyRegion } from '@circuit/domain';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import type { AppPalette } from '@/theme';

export type RegionMemory = {
  exposure: number;
  lastCompletedAt?: string;
  statusLabel?: string;
  statusColor?: string;
  detail?: string;
  sportDemand?: 'insufficient_history' | 'low' | 'typical' | 'above_usual' | 'much_above_usual';
  warning?: boolean;
};
export type BodyPresentation = 'woman_lean' | 'woman_average' | 'woman_softer' | 'man_lean' | 'man_average' | 'man_softer';
type Sex = 'woman' | 'man';
type BodyView = 'front' | 'back';
type ProfileKey = `${Sex}_${BodyView}`;
type HitArea = { x: number; y: number; rx: number; ry: number };
type ZoneAsset = { id: string; region: BodyRegion; source: number; hits: HitArea[] };

const FIGURE_WIDTH = 700;
const FIGURE_HEIGHT = 1400;
const BODY_WIDTH = 300;
const BODY_SCALE = BODY_WIDTH / FIGURE_WIDTH;
const BODY_HEIGHT = FIGURE_HEIGHT * BODY_SCALE;

const BODY_ASSETS: Record<ProfileKey, number> = {
  woman_front: require('../../assets/anatomy-atlas-v5/woman_front_base.png'),
  woman_back: require('../../assets/anatomy-atlas-v5/woman_back_base.png'),
  man_front: require('../../assets/anatomy-atlas-v5/man_front_base.png'),
  man_back: require('../../assets/anatomy-atlas-v5/man_back_base.png'),
};

const BOUNDARY_ASSETS: Record<ProfileKey, number> = {
  woman_front: require('../../assets/anatomy-atlas-v5/woman_front__boundaries.png'),
  woman_back: require('../../assets/anatomy-atlas-v5/woman_back__boundaries.png'),
  man_front: require('../../assets/anatomy-atlas-v5/man_front__boundaries.png'),
  man_back: require('../../assets/anatomy-atlas-v5/man_back__boundaries.png'),
};

const ZONE_ASSETS: Record<ProfileKey, ZoneAsset[]> = {
  woman_front: [
    { id: 'shoulders', region: 'shoulders', source: require('../../assets/anatomy-atlas-v5/woman_front__shoulders.png'), hits: [{ x: 222, y: 300, rx: 55, ry: 45 }, { x: 478, y: 300, rx: 55, ry: 45 }] },
    { id: 'chest', region: 'chest', source: require('../../assets/anatomy-atlas-v5/woman_front__chest.png'), hits: [{ x: 292, y: 350, rx: 75, ry: 65 }, { x: 408, y: 350, rx: 75, ry: 65 }] },
    { id: 'biceps', region: 'biceps', source: require('../../assets/anatomy-atlas-v5/woman_front__biceps.png'), hits: [{ x: 224, y: 438, rx: 32, ry: 82 }, { x: 476, y: 438, rx: 32, ry: 82 }] },
    { id: 'forearms_grip', region: 'forearms_grip', source: require('../../assets/anatomy-atlas-v5/woman_front__forearms_grip.png'), hits: [{ x: 221, y: 640, rx: 28, ry: 96 }, { x: 479, y: 640, rx: 28, ry: 96 }] },
    { id: 'core_anterior', region: 'core_anterior', source: require('../../assets/anatomy-atlas-v5/woman_front__core_anterior.png'), hits: [{ x: 350, y: 555, rx: 58, ry: 155 }] },
    { id: 'core_rotation', region: 'core_rotation', source: require('../../assets/anatomy-atlas-v5/woman_front__core_rotation.png'), hits: [{ x: 280, y: 555, rx: 40, ry: 145 }, { x: 420, y: 555, rx: 40, ry: 145 }] },
    { id: 'hip_flexors', region: 'hip_flexors', source: require('../../assets/anatomy-atlas-v5/woman_front__hip_flexors.png'), hits: [{ x: 307, y: 765, rx: 32, ry: 42 }, { x: 393, y: 765, rx: 32, ry: 42 }] },
    { id: 'quadriceps', region: 'quadriceps', source: require('../../assets/anatomy-atlas-v5/woman_front__quadriceps.png'), hits: [{ x: 290, y: 890, rx: 55, ry: 150 }, { x: 410, y: 890, rx: 55, ry: 150 }] },
    { id: 'hip_adductors', region: 'hip_adductors', source: require('../../assets/anatomy-atlas-v5/woman_front__hip_adductors.png'), hits: [{ x: 322, y: 890, rx: 27, ry: 145 }, { x: 378, y: 890, rx: 27, ry: 145 }] },
    { id: 'tibialis_anterior', region: 'tibialis_anterior', source: require('../../assets/anatomy-atlas-v5/woman_front__tibialis_anterior.png'), hits: [{ x: 285, y: 1135, rx: 26, ry: 102 }, { x: 415, y: 1135, rx: 26, ry: 102 }] },
    { id: 'feet_ankles', region: 'feet_ankles', source: require('../../assets/anatomy-atlas-v5/woman_front__feet_ankles.png'), hits: [{ x: 275, y: 1305, rx: 72, ry: 65 }, { x: 425, y: 1305, rx: 72, ry: 65 }] }
  ],
  woman_back: [
    { id: 'shoulders', region: 'shoulders', source: require('../../assets/anatomy-atlas-v5/woman_back__shoulders.png'), hits: [{ x: 222, y: 300, rx: 55, ry: 45 }, { x: 478, y: 300, rx: 55, ry: 45 }] },
    { id: 'triceps', region: 'triceps', source: require('../../assets/anatomy-atlas-v5/woman_back__triceps.png'), hits: [{ x: 224, y: 442, rx: 32, ry: 88 }, { x: 476, y: 442, rx: 32, ry: 88 }] },
    { id: 'forearms_grip', region: 'forearms_grip', source: require('../../assets/anatomy-atlas-v5/woman_back__forearms_grip.png'), hits: [{ x: 221, y: 643, rx: 28, ry: 94 }, { x: 479, y: 643, rx: 28, ry: 94 }] },
    { id: 'upper_back', region: 'upper_back', source: require('../../assets/anatomy-atlas-v5/woman_back__upper_back.png'), hits: [{ x: 350, y: 380, rx: 115, ry: 130 }] },
    { id: 'lats', region: 'lats', source: require('../../assets/anatomy-atlas-v5/woman_back__lats.png'), hits: [{ x: 275, y: 520, rx: 55, ry: 170 }, { x: 425, y: 520, rx: 55, ry: 170 }] },
    { id: 'lower_back', region: 'lower_back', source: require('../../assets/anatomy-atlas-v5/woman_back__lower_back.png'), hits: [{ x: 350, y: 620, rx: 42, ry: 82 }] },
    { id: 'core_lateral', region: 'core_lateral', source: require('../../assets/anatomy-atlas-v5/woman_back__core_lateral.png'), hits: [{ x: 280, y: 675, rx: 38, ry: 70 }, { x: 420, y: 675, rx: 38, ry: 70 }] },
    { id: 'glutes', region: 'glutes', source: require('../../assets/anatomy-atlas-v5/woman_back__glutes.png'), hits: [{ x: 290, y: 765, rx: 65, ry: 70 }, { x: 410, y: 765, rx: 65, ry: 70 }] },
    { id: 'hip_abductors', region: 'hip_abductors', source: require('../../assets/anatomy-atlas-v5/woman_back__hip_abductors.png'), hits: [{ x: 250, y: 730, rx: 35, ry: 65 }, { x: 450, y: 730, rx: 35, ry: 65 }] },
    { id: 'hamstrings', region: 'hamstrings', source: require('../../assets/anatomy-atlas-v5/woman_back__hamstrings.png'), hits: [{ x: 290, y: 910, rx: 55, ry: 120 }, { x: 410, y: 910, rx: 55, ry: 120 }] },
    { id: 'gastrocnemius', region: 'gastrocnemius', source: require('../../assets/anatomy-atlas-v5/woman_back__gastrocnemius.png'), hits: [{ x: 290, y: 1110, rx: 48, ry: 100 }, { x: 410, y: 1110, rx: 48, ry: 100 }] },
    { id: 'soleus', region: 'soleus', source: require('../../assets/anatomy-atlas-v5/woman_back__soleus.png'), hits: [{ x: 290, y: 1230, rx: 34, ry: 65 }, { x: 410, y: 1230, rx: 34, ry: 65 }] },
    { id: 'feet_ankles', region: 'feet_ankles', source: require('../../assets/anatomy-atlas-v5/woman_back__feet_ankles.png'), hits: [{ x: 275, y: 1305, rx: 72, ry: 65 }, { x: 425, y: 1305, rx: 72, ry: 65 }] }
  ],
  man_front: [
    { id: 'shoulders', region: 'shoulders', source: require('../../assets/anatomy-atlas-v5/man_front__shoulders.png'), hits: [{ x: 200, y: 300, rx: 55, ry: 45 }, { x: 500, y: 300, rx: 55, ry: 45 }] },
    { id: 'chest', region: 'chest', source: require('../../assets/anatomy-atlas-v5/man_front__chest.png'), hits: [{ x: 292, y: 350, rx: 75, ry: 65 }, { x: 408, y: 350, rx: 75, ry: 65 }] },
    { id: 'biceps', region: 'biceps', source: require('../../assets/anatomy-atlas-v5/man_front__biceps.png'), hits: [{ x: 195, y: 438, rx: 37, ry: 82 }, { x: 505, y: 438, rx: 37, ry: 82 }] },
    { id: 'forearms_grip', region: 'forearms_grip', source: require('../../assets/anatomy-atlas-v5/man_front__forearms_grip.png'), hits: [{ x: 192, y: 640, rx: 30, ry: 96 }, { x: 508, y: 640, rx: 30, ry: 96 }] },
    { id: 'core_anterior', region: 'core_anterior', source: require('../../assets/anatomy-atlas-v5/man_front__core_anterior.png'), hits: [{ x: 350, y: 555, rx: 58, ry: 155 }] },
    { id: 'core_rotation', region: 'core_rotation', source: require('../../assets/anatomy-atlas-v5/man_front__core_rotation.png'), hits: [{ x: 280, y: 555, rx: 40, ry: 145 }, { x: 420, y: 555, rx: 40, ry: 145 }] },
    { id: 'hip_flexors', region: 'hip_flexors', source: require('../../assets/anatomy-atlas-v5/man_front__hip_flexors.png'), hits: [{ x: 307, y: 765, rx: 32, ry: 42 }, { x: 393, y: 765, rx: 32, ry: 42 }] },
    { id: 'quadriceps', region: 'quadriceps', source: require('../../assets/anatomy-atlas-v5/man_front__quadriceps.png'), hits: [{ x: 290, y: 890, rx: 55, ry: 150 }, { x: 410, y: 890, rx: 55, ry: 150 }] },
    { id: 'hip_adductors', region: 'hip_adductors', source: require('../../assets/anatomy-atlas-v5/man_front__hip_adductors.png'), hits: [{ x: 322, y: 890, rx: 27, ry: 145 }, { x: 378, y: 890, rx: 27, ry: 145 }] },
    { id: 'tibialis_anterior', region: 'tibialis_anterior', source: require('../../assets/anatomy-atlas-v5/man_front__tibialis_anterior.png'), hits: [{ x: 285, y: 1135, rx: 26, ry: 102 }, { x: 415, y: 1135, rx: 26, ry: 102 }] },
    { id: 'feet_ankles', region: 'feet_ankles', source: require('../../assets/anatomy-atlas-v5/man_front__feet_ankles.png'), hits: [{ x: 275, y: 1305, rx: 72, ry: 65 }, { x: 425, y: 1305, rx: 72, ry: 65 }] }
  ],
  man_back: [
    { id: 'shoulders', region: 'shoulders', source: require('../../assets/anatomy-atlas-v5/man_back__shoulders.png'), hits: [{ x: 200, y: 300, rx: 55, ry: 45 }, { x: 500, y: 300, rx: 55, ry: 45 }] },
    { id: 'triceps', region: 'triceps', source: require('../../assets/anatomy-atlas-v5/man_back__triceps.png'), hits: [{ x: 195, y: 442, rx: 37, ry: 88 }, { x: 505, y: 442, rx: 37, ry: 88 }] },
    { id: 'forearms_grip', region: 'forearms_grip', source: require('../../assets/anatomy-atlas-v5/man_back__forearms_grip.png'), hits: [{ x: 192, y: 643, rx: 30, ry: 94 }, { x: 508, y: 643, rx: 30, ry: 94 }] },
    { id: 'upper_back', region: 'upper_back', source: require('../../assets/anatomy-atlas-v5/man_back__upper_back.png'), hits: [{ x: 350, y: 380, rx: 115, ry: 130 }] },
    { id: 'lats', region: 'lats', source: require('../../assets/anatomy-atlas-v5/man_back__lats.png'), hits: [{ x: 275, y: 520, rx: 55, ry: 170 }, { x: 425, y: 520, rx: 55, ry: 170 }] },
    { id: 'lower_back', region: 'lower_back', source: require('../../assets/anatomy-atlas-v5/man_back__lower_back.png'), hits: [{ x: 350, y: 620, rx: 42, ry: 82 }] },
    { id: 'core_lateral', region: 'core_lateral', source: require('../../assets/anatomy-atlas-v5/man_back__core_lateral.png'), hits: [{ x: 280, y: 675, rx: 38, ry: 70 }, { x: 420, y: 675, rx: 38, ry: 70 }] },
    { id: 'glutes', region: 'glutes', source: require('../../assets/anatomy-atlas-v5/man_back__glutes.png'), hits: [{ x: 290, y: 765, rx: 65, ry: 70 }, { x: 410, y: 765, rx: 65, ry: 70 }] },
    { id: 'hip_abductors', region: 'hip_abductors', source: require('../../assets/anatomy-atlas-v5/man_back__hip_abductors.png'), hits: [{ x: 250, y: 730, rx: 35, ry: 65 }, { x: 450, y: 730, rx: 35, ry: 65 }] },
    { id: 'hamstrings', region: 'hamstrings', source: require('../../assets/anatomy-atlas-v5/man_back__hamstrings.png'), hits: [{ x: 290, y: 910, rx: 55, ry: 120 }, { x: 410, y: 910, rx: 55, ry: 120 }] },
    { id: 'gastrocnemius', region: 'gastrocnemius', source: require('../../assets/anatomy-atlas-v5/man_back__gastrocnemius.png'), hits: [{ x: 290, y: 1110, rx: 48, ry: 100 }, { x: 410, y: 1110, rx: 48, ry: 100 }] },
    { id: 'soleus', region: 'soleus', source: require('../../assets/anatomy-atlas-v5/man_back__soleus.png'), hits: [{ x: 290, y: 1230, rx: 34, ry: 65 }, { x: 410, y: 1230, rx: 34, ry: 65 }] },
    { id: 'feet_ankles', region: 'feet_ankles', source: require('../../assets/anatomy-atlas-v5/man_back__feet_ankles.png'), hits: [{ x: 275, y: 1305, rx: 72, ry: 65 }, { x: 425, y: 1305, rx: 72, ry: 65 }] }
  ],
};

const FRONT_REGIONS: BodyRegion[] = [
  'shoulders', 'chest', 'biceps', 'forearms_grip', 'core_anterior', 'core_rotation',
  'hip_flexors', 'quadriceps', 'hip_adductors', 'tibialis_anterior', 'feet_ankles',
];
const BACK_REGIONS: BodyRegion[] = [
  'shoulders', 'triceps', 'forearms_grip', 'upper_back', 'lats', 'lower_back',
  'core_lateral', 'glutes', 'hip_abductors', 'hamstrings', 'gastrocnemius', 'soleus',
  'feet_ankles',
];
const LABELS: Partial<Record<BodyRegion, string>> = {
  shoulders: 'Shoulders',
  chest: 'Chest',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms_grip: 'Forearms + grip',
  core_anterior: 'Anterior core',
  core_rotation: 'Rotational core',
  core_lateral: 'Lateral core',
  lower_back: 'Lower back',
  quadriceps: 'Quadriceps',
  hamstrings: 'Hamstrings',
  hip_flexors: 'Hip flexors',
  hip_adductors: 'Adductors',
  hip_abductors: 'Lateral hips',
  glutes: 'Glutes',
  tibialis_anterior: 'Tibialis anterior',
  gastrocnemius: 'Calves',
  soleus: 'Soleus',
  feet_ankles: 'Feet + ankles',
  upper_back: 'Upper back',
  lats: 'Lats',
};

export function TrainingBodyMap({
  memory,
  onSelect,
  onSelectRegion,
  initialPresentation,
}: {
  memory: Partial<Record<BodyRegion, RegionMemory>>;
  onSelect?: (region: BodyRegion) => void;
  onSelectRegion?: (region: BodyRegion) => void;
  initialPresentation?: BodyPresentation;
}) {
  const { user } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const sex: Sex = user?.anatomyFigure ?? (initialPresentation?.startsWith('man_') ? 'man' : 'woman');
  const [view, setView] = useState<BodyView>('front');
  const [selected, setSelected] = useState<BodyRegion | null>(null);

  const profileKey = `${sex}_${view}` as ProfileKey;
  const zones = ZONE_ASSETS[profileKey];
  const visibleRegions = view === 'front' ? FRONT_REGIONS : BACK_REGIONS;

  const select = (region: BodyRegion) => {
    setSelected(region);
    onSelect?.(region);
    onSelectRegion?.(region);
  };

  function selectFromBody(x: number, y: number) {
    // locationX/locationY are already local to the body Pressable.
    const fx = x / BODY_SCALE;
    const fy = y / BODY_SCALE;
    const matches = zones
      .flatMap((zone) => zone.hits.map((hit) => ({ zone, hit })))
      .filter(({ hit }) => {
        const dx = (fx - hit.x) / hit.rx;
        const dy = (fy - hit.y) / hit.ry;
        return dx * dx + dy * dy <= 1;
      })
      .sort((a, b) => a.hit.rx * a.hit.ry - b.hit.rx * b.hit.ry);
    if (matches[0]) select(matches[0].zone.region);
  }

  return (
    <View style={styles.wrap}>
      <SegmentedRow
        options={[['front', 'Front'], ['back', 'Back']] as const}
        value={view}
        onChange={(next) => { setView(next); setSelected(null); }}
        styles={styles}
      />
      <Text style={styles.presentationNote}>
        The map includes all 21 regions used by the exercise catalog, including arm, grip, hip-flexor, lower-back, and lower-leg support regions. Tap the figure or choose a region below.
      </Text>

      <View style={styles.figureWrap}>
        <View style={styles.bodyLayer}>
          <Image source={BODY_ASSETS[profileKey]} style={styles.figureImage} resizeMode="contain" />
          {zones.map((zone) => {
            const status = regionStatus(memory[zone.region]);
            const isSelected = selected === zone.region;
            const dim = selected !== null && !isSelected;
            return (
              <Image
                key={zone.id}
                source={zone.source}
                resizeMode="contain"
                style={[
                  styles.zoneMask,
                  { tintColor: status.color, opacity: dim ? 0.2 : isSelected ? 1 : 0.84 },
                ]}
              />
            );
          })}
          <Image source={BOUNDARY_ASSETS[profileKey]} resizeMode="contain" style={styles.boundaryImage} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${view === 'front' ? 'Front' : 'Back'} training-region figure`}
            accessibilityHint="Tap a shaded region, or choose its labeled button below."
            onPress={(event) => selectFromBody(event.nativeEvent.locationX, event.nativeEvent.locationY)}
            style={styles.bodyPressable}
          />
        </View>
      </View>

      <View style={styles.regionGrid}>
        {visibleRegions.map((region) => (
          <RegionChip
            key={region}
            region={region}
            label={LABELS[region] ?? region.replaceAll('_', ' ')}
            selected={selected === region}
            status={regionStatus(memory[region])}
            onPress={() => select(region)}
            styles={styles}
          />
        ))}
      </View>

      <View style={styles.selectedCard}>
        <Text style={styles.selectedEyebrow}>{selected ? 'SELECTED REGION' : 'CHOOSE A TRAINING REGION'}</Text>
        <Text style={styles.selectedTitle}>
          {selected ? LABELS[selected] ?? selected.replaceAll('_', ' ') : 'Anatomical training memory'}
        </Text>
        <Text style={styles.selectedBody}>
          {selected ? regionStatus(memory[selected]).detail : 'Select the figure or a region button to review its completed-exercise exposure.'}
        </Text>
      </View>

      <View style={styles.legend}>
        <Legend color="#8E6DB5" label="Strength opportunity" />
        <Legend color="#C6922E" label="Sport-loaded + strength needed" />
        <Legend color="#1E6B46" label="On plan" />
        <Legend color="#4E789B" label="Recently loaded" />
        <Legend color="#B45D2D" label="Review" />
        <Legend color="#A53D45" label="Restricted" />
      </View>
      <Text style={styles.note}>
        Fill reflects the current strength-planning status. A ring on a region button means sport demand is above the athlete’s own recent baseline. An exclamation mark means symptoms or restrictions need review.
      </Text>
    </View>
  );
}

function RegionChip({
  region,
  label,
  selected,
  status,
  onPress,
  styles,
}: {
  region: BodyRegion;
  label: string;
  selected: boolean;
  status: ReturnType<typeof regionStatus>;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}: ${status.label}${status.sportLoaded ? ', sport demand above usual' : ''}${status.warning ? ', review needed' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.regionChip,
        status.sportLoaded && styles.regionChipSportLoaded,
        selected && styles.regionChipSelected,
        pressed && styles.regionChipPressed,
      ]}
    >
      <View style={[styles.regionDot, { backgroundColor: selected ? '#FFFFFF' : status.color }]} />
      <Text numberOfLines={2} style={[styles.regionChipText, selected && styles.regionChipTextSelected]}>
        {label}
      </Text>
      {status.warning ? <Text style={[styles.warningMark, selected && styles.regionChipTextSelected]}>!</Text> : null}
    </Pressable>
  );
}

function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
  styles,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.segmentRow}>
      {options.map(([option, label]) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && styles.segmentPressed]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function regionStatus(memory?: RegionMemory) {
  if (memory?.statusLabel && memory.statusColor) {
    return {
      label: memory.statusLabel,
      color: memory.statusColor,
      detail: memory.detail ?? memory.statusLabel,
      sportLoaded: memory.sportDemand === 'above_usual' || memory.sportDemand === 'much_above_usual',
      warning: Boolean(memory.warning),
    };
  }
  if (!memory?.lastCompletedAt) return { label: 'No status available', color: '#AEB8B1', detail: 'No regional status has been calculated yet.', sportLoaded: false, warning: false };
  const hours = (Date.now() - new Date(memory.lastCompletedAt).getTime()) / 3_600_000;
  return {
    label: 'History available',
    color: '#AEB8B1',
    detail: `The last recorded exposure was ${hours < 48 ? `${Math.max(1, Math.round(hours))} hours` : `${Math.round(hours / 24)} days`} ago.`,
    sportLoaded: false,
    warning: false,
  };
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={base.legendItem}>
      <View style={[base.dot, { backgroundColor: color }]} />
      <Text style={base.legendText}>{label}</Text>
    </View>
  );
}

const base = StyleSheet.create({
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 10, color: '#627067', fontWeight: '700' },
});

function makeStyles(p: AppPalette) {
  return StyleSheet.create({
    wrap: { gap: 12 },
    segmentRow: { flexDirection: 'row', gap: 8 },
    segment: { flex: 1, minHeight: 47, borderWidth: 1, borderColor: p.border, borderRadius: 14, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: p.canvas },
    segmentActive: { backgroundColor: p.forest, borderColor: p.forest },
    segmentPressed: { opacity: 0.72 },
    segmentText: { color: p.ink, fontSize: 13, fontWeight: '900', textAlign: 'center' },
    segmentTextActive: { color: p.white },
    presentationNote: { color: p.inkMuted, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 12 },
    figureWrap: { alignItems: 'center' },
    bodyLayer: { width: BODY_WIDTH, height: BODY_HEIGHT, position: 'relative' },
    figureImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: BODY_WIDTH, height: BODY_HEIGHT },
    zoneMask: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: BODY_WIDTH, height: BODY_HEIGHT },
    boundaryImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: BODY_WIDTH, height: BODY_HEIGHT, opacity: 0.92 },
    bodyPressable: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'transparent' },
    regionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    regionChip: { width: '48.5%', minHeight: 42, borderWidth: 1, borderColor: p.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: p.canvas, flexDirection: 'row', alignItems: 'center', gap: 7 },
    regionChipSportLoaded: { borderWidth: 2, borderColor: '#C6922E' },
    regionChipSelected: { backgroundColor: p.forest, borderColor: p.forest },
    regionChipPressed: { opacity: 0.72 },
    regionDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
    regionChipText: { flex: 1, color: p.ink, fontSize: 11, lineHeight: 14, fontWeight: '900' },
    regionChipTextSelected: { color: p.white },
    warningMark: { position: 'absolute', top: 4, right: 7, color: '#B45D2D', fontWeight: '900', fontSize: 14 },
    selectedCard: { backgroundColor: p.surfaceMuted, borderRadius: 15, padding: 13, gap: 4 },
    selectedEyebrow: { color: p.forest, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
    selectedTitle: { color: p.ink, fontSize: 17, fontWeight: '900' },
    selectedBody: { color: p.inkMuted, fontSize: 12, lineHeight: 18 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
    note: { fontSize: 11, lineHeight: 16, color: p.inkMuted, textAlign: 'center' },
  });
}
