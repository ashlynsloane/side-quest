import type { Exercise } from '@circuit/domain';
import { Image } from 'expo-image';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { visualGuideForExercise } from '@/services/exercise-media';

export function ExerciseDemoModal({
  exercise,
  visible,
  onClose,
}: {
  exercise: Exercise | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!exercise) return null;
  const visual = visualGuideForExercise(exercise);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>EXERCISE GUIDE</Text>
            <Text style={styles.title}>{exercise.name}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {visual ? <IllustratedGuide source={visual.source} /> : <WrittenDemoCard exercise={exercise} />}
          <Text style={styles.description}>{exercise.shortDescription}</Text>

          <View style={styles.variationCard}>
            <Text style={styles.variationEyebrow}>EXERCISE LADDER</Text>
            <Text style={styles.variationTitle}>Need a different level?</Text>
            <Text style={styles.variationText}><Text style={styles.variationStrong}>Easier: </Text>{easierVariationHint(exercise)}</Text>
            <Text style={styles.variationText}><Text style={styles.variationStrong}>Harder: </Text>{harderVariationHint(exercise)}</Text>
            <Text style={styles.variationNote}>In a workout, tap Swap → Make this easier or Make this harder. Side Quest prioritizes the same movement family before considering a different exercise.</Text>
          </View>

          <InstructionSection title="Set up" items={exercise.instructions.setup} />
          <InstructionSection title="Movement" items={exercise.instructions.execution} />
          <InstructionSection title="Useful cues" items={exercise.instructions.cues} />
          <InstructionSection title="Common mistakes" items={exercise.instructions.commonMistakes} />

          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Primary category</Text>
            <Text style={styles.metaValue}>{exercise.category}</Text>
            <Text style={styles.metaLabel}>Equipment options</Text>
            <Text style={styles.metaValue}>{exercise.equipmentOptions.map((option) => option.label).join(' · ')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function IllustratedGuide({ source }: { source: number }) {
  return (
    <View style={styles.illustrationCard}>
      <Image source={source} style={styles.illustration} contentFit="contain" transition={120} />
    </View>
  );
}

function WrittenDemoCard({ exercise }: { exercise: Exercise }) {
  const setup = exercise.instructions.setup[0] ?? 'Establish a stable starting position.';
  const movement = exercise.instructions.execution[0] ?? 'Move through the exercise under control.';
  const cue = exercise.instructions.cues[0] ?? 'Use a controlled range and stop if the movement is painful.';
  return (
    <View style={styles.writtenCard}>
      <Text style={styles.storyboardTitle}>Written movement guide</Text>
      <View style={styles.writtenStep}><Text style={styles.frameNumberText}>1</Text><View style={styles.writtenCopy}><Text style={styles.frameLabel}>SET UP</Text><Text style={styles.frameCue}>{setup}</Text></View></View>
      <View style={styles.writtenStep}><Text style={styles.frameNumberText}>2</Text><View style={styles.writtenCopy}><Text style={styles.frameLabel}>MOVE</Text><Text style={styles.frameCue}>{movement}</Text></View></View>
      <View style={styles.writtenStep}><Text style={styles.frameNumberText}>3</Text><View style={styles.writtenCopy}><Text style={styles.frameLabel}>FOCUS</Text><Text style={styles.frameCue}>{cue}</Text></View></View>
    </View>
  );
}

function easierVariationHint(exercise: Exercise) {
  if (exercise.laterality === 'unilateral') return 'Use the bilateral version, add light hand support, or reduce the range and repetitions.';
  if (exercise.impactLevel >= 3) return 'Remove the jump or impact component and use a controlled strength version.';
  if (exercise.balanceDemand >= 3) return 'Use support or a more stable surface before reducing the entire movement.';
  return 'Reduce repetitions or time, use a comfortable range, or choose the closest lower-demand variation.';
}

function harderVariationHint(exercise: Exercise) {
  const loadable = exercise.equipmentOptions.some((option) => option.items.some((item) => item.equipmentId !== 'bodyweight'));
  if (exercise.laterality === 'bilateral') return 'Build toward the top of the rep range, then consider a unilateral version or the smallest practical external load.';
  if (loadable) return 'Increase repetitions or time first; then use the next real implement size while returning to the lower end of the rep range.';
  return 'Increase repetitions or time first, then use slower tempo, pauses, greater range, or a harder related variation.';
}

function InstructionSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item, index) => (
        <View key={`${title}-${index}`} style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const colors = {
  background: '#F4F6F3',
  card: '#FFFFFF',
  ink: '#17211B',
  muted: '#627067',
  border: '#D9E0DA',
  accent: '#173A2B',
  accentSoft: '#DDE9E1',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  closeButton: { backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 9 },
  closeText: { color: colors.accent, fontWeight: '800' },
  content: { padding: 14, paddingBottom: 38, gap: 16 },
  illustrationCard: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  illustration: { width: '100%', aspectRatio: 3 / 2, backgroundColor: '#FFFFFF' },
  writtenCard: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  storyboardTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  writtenStep: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  writtenCopy: { flex: 1, gap: 3 },
  frameNumberText: { width: 27, height: 27, borderRadius: 14, textAlign: 'center', textAlignVertical: 'center', backgroundColor: colors.accent, color: '#FFFFFF', fontWeight: '800', lineHeight: 27 },
  frameLabel: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  frameCue: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  description: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  variationCard: { backgroundColor: colors.accentSoft, borderRadius: 18, padding: 16, gap: 6 },
  variationEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  variationTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  variationText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  variationStrong: { fontWeight: '800', color: colors.accent },
  variationNote: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  section: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 9 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  bulletRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  bullet: { color: colors.accent, fontSize: 18, lineHeight: 22 },
  bulletText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 22 },
  metaCard: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, gap: 5 },
  metaLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  metaValue: { color: colors.ink, fontSize: 15, lineHeight: 21, marginBottom: 7 },
});
