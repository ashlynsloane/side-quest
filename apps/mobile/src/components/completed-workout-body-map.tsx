import type { BodyRegion } from '@circuit/domain';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';

const FIGURE_WIDTH = 700;
const FIGURE_HEIGHT = 1400;
const DISPLAY_WIDTH = 118;
const DISPLAY_HEIGHT = FIGURE_HEIGHT * (DISPLAY_WIDTH / FIGURE_WIDTH);

type Figure = 'woman_front' | 'woman_back' | 'man_front' | 'man_back';

const BASE: Record<Figure, number> = {
  woman_front: require('../../assets/anatomy-atlas-v5/woman_front_base.png'),
  woman_back: require('../../assets/anatomy-atlas-v5/woman_back_base.png'),
  man_front: require('../../assets/anatomy-atlas-v5/man_front_base.png'),
  man_back: require('../../assets/anatomy-atlas-v5/man_back_base.png'),
};
const BOUNDARIES: Record<Figure, number> = {
  woman_front: require('../../assets/anatomy-atlas-v5/woman_front__boundaries.png'),
  woman_back: require('../../assets/anatomy-atlas-v5/woman_back__boundaries.png'),
  man_front: require('../../assets/anatomy-atlas-v5/man_front__boundaries.png'),
  man_back: require('../../assets/anatomy-atlas-v5/man_back__boundaries.png'),
};
const ZONES: Record<Figure, Partial<Record<BodyRegion, number>>> = {
  woman_front: {
    shoulders: require('../../assets/anatomy-atlas-v5/woman_front__shoulders.png'), chest: require('../../assets/anatomy-atlas-v5/woman_front__chest.png'), biceps: require('../../assets/anatomy-atlas-v5/woman_front__biceps.png'), forearms_grip: require('../../assets/anatomy-atlas-v5/woman_front__forearms_grip.png'), core_anterior: require('../../assets/anatomy-atlas-v5/woman_front__core_anterior.png'), core_rotation: require('../../assets/anatomy-atlas-v5/woman_front__core_rotation.png'), hip_flexors: require('../../assets/anatomy-atlas-v5/woman_front__hip_flexors.png'), quadriceps: require('../../assets/anatomy-atlas-v5/woman_front__quadriceps.png'), hip_adductors: require('../../assets/anatomy-atlas-v5/woman_front__hip_adductors.png'), tibialis_anterior: require('../../assets/anatomy-atlas-v5/woman_front__tibialis_anterior.png'), feet_ankles: require('../../assets/anatomy-atlas-v5/woman_front__feet_ankles.png'),
  },
  woman_back: {
    shoulders: require('../../assets/anatomy-atlas-v5/woman_back__shoulders.png'), triceps: require('../../assets/anatomy-atlas-v5/woman_back__triceps.png'), forearms_grip: require('../../assets/anatomy-atlas-v5/woman_back__forearms_grip.png'), upper_back: require('../../assets/anatomy-atlas-v5/woman_back__upper_back.png'), lats: require('../../assets/anatomy-atlas-v5/woman_back__lats.png'), lower_back: require('../../assets/anatomy-atlas-v5/woman_back__lower_back.png'), core_lateral: require('../../assets/anatomy-atlas-v5/woman_back__core_lateral.png'), glutes: require('../../assets/anatomy-atlas-v5/woman_back__glutes.png'), hip_abductors: require('../../assets/anatomy-atlas-v5/woman_back__hip_abductors.png'), hamstrings: require('../../assets/anatomy-atlas-v5/woman_back__hamstrings.png'), gastrocnemius: require('../../assets/anatomy-atlas-v5/woman_back__gastrocnemius.png'), soleus: require('../../assets/anatomy-atlas-v5/woman_back__soleus.png'), feet_ankles: require('../../assets/anatomy-atlas-v5/woman_back__feet_ankles.png'),
  },
  man_front: {
    shoulders: require('../../assets/anatomy-atlas-v5/man_front__shoulders.png'), chest: require('../../assets/anatomy-atlas-v5/man_front__chest.png'), biceps: require('../../assets/anatomy-atlas-v5/man_front__biceps.png'), forearms_grip: require('../../assets/anatomy-atlas-v5/man_front__forearms_grip.png'), core_anterior: require('../../assets/anatomy-atlas-v5/man_front__core_anterior.png'), core_rotation: require('../../assets/anatomy-atlas-v5/man_front__core_rotation.png'), hip_flexors: require('../../assets/anatomy-atlas-v5/man_front__hip_flexors.png'), quadriceps: require('../../assets/anatomy-atlas-v5/man_front__quadriceps.png'), hip_adductors: require('../../assets/anatomy-atlas-v5/man_front__hip_adductors.png'), tibialis_anterior: require('../../assets/anatomy-atlas-v5/man_front__tibialis_anterior.png'), feet_ankles: require('../../assets/anatomy-atlas-v5/man_front__feet_ankles.png'),
  },
  man_back: {
    shoulders: require('../../assets/anatomy-atlas-v5/man_back__shoulders.png'), triceps: require('../../assets/anatomy-atlas-v5/man_back__triceps.png'), forearms_grip: require('../../assets/anatomy-atlas-v5/man_back__forearms_grip.png'), upper_back: require('../../assets/anatomy-atlas-v5/man_back__upper_back.png'), lats: require('../../assets/anatomy-atlas-v5/man_back__lats.png'), lower_back: require('../../assets/anatomy-atlas-v5/man_back__lower_back.png'), core_lateral: require('../../assets/anatomy-atlas-v5/man_back__core_lateral.png'), glutes: require('../../assets/anatomy-atlas-v5/man_back__glutes.png'), hip_abductors: require('../../assets/anatomy-atlas-v5/man_back__hip_abductors.png'), hamstrings: require('../../assets/anatomy-atlas-v5/man_back__hamstrings.png'), gastrocnemius: require('../../assets/anatomy-atlas-v5/man_back__gastrocnemius.png'), soleus: require('../../assets/anatomy-atlas-v5/man_back__soleus.png'), feet_ankles: require('../../assets/anatomy-atlas-v5/man_back__feet_ankles.png'),
  },
};

export function CompletedWorkoutBodyMap({ regionLoads }: { regionLoads: Partial<Record<BodyRegion, number>> }) {
  const { user } = useAuth();
  const { tokens } = useTheme();
  const sex = user?.anatomyFigure ?? 'woman';
  return <View style={[styles.card, { backgroundColor: tokens.surfaceMuted, borderColor: tokens.border }]}>
    <View style={styles.header}><View><Text style={[styles.eyebrow, { color: tokens.accent }]}>AREAS TRAINED</Text><Text style={[styles.title, { color: tokens.text }]}>What this workout actually used</Text></View><Text style={[styles.note, { color: tokens.textMuted }]}>Darker fill = more direct work</Text></View>
    <View style={styles.figures}>
      <FigureView figure={`${sex}_front` as Figure} label="Front" regionLoads={regionLoads} accent={tokens.accentStrong} textColor={tokens.textMuted} />
      <FigureView figure={`${sex}_back` as Figure} label="Back" regionLoads={regionLoads} accent={tokens.accentStrong} textColor={tokens.textMuted} />
    </View>
  </View>;
}

function FigureView({ figure, label, regionLoads, accent, textColor }: { figure: Figure; label: string; regionLoads: Partial<Record<BodyRegion, number>>; accent: string; textColor: string }) {
  const zones = ZONES[figure];
  return <View style={styles.figureColumn}><View style={styles.figure}>
    <Image source={BASE[figure]} resizeMode="contain" style={styles.image} />
    {(Object.entries(zones) as Array<[BodyRegion, number]>).map(([region, source]) => {
      const intensity = regionLoads[region] ?? 0;
      if (intensity <= 0) return null;
      return <Image key={region} source={source} resizeMode="contain" style={[styles.overlay, { tintColor: accent, opacity: 0.38 + intensity * 0.62 }]} />;
    })}
    <Image source={BOUNDARIES[figure]} resizeMode="contain" style={styles.overlay} />
  </View><Text style={[styles.figureLabel, { color: textColor }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, padding: 15, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 10.5, lineHeight: 13, fontWeight: '900', letterSpacing: 1.1 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '800', marginTop: 3 },
  note: { maxWidth: 110, fontSize: 10.5, lineHeight: 14, textAlign: 'right' },
  figures: { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  figureColumn: { alignItems: 'center' },
  figure: { width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT, position: 'relative' },
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT },
  figureLabel: { fontSize: 11.5, fontWeight: '700', marginTop: -4 },
});
