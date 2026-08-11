import type { Exercise } from '@circuit/domain';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductDisclosure } from '@/components/product-ui';
import { V23Icon } from '@/components/v23-ui';
import { visualGuideForExercise } from '@/services/exercise-media';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function ExerciseDemoModal({
  exercise,
  visible,
  onClose,
}: {
  exercise: Exercise | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [ladderOpen, setLadderOpen] = useState(false);
  const [mistakesOpen, setMistakesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!exercise) return null;
  const visual = visualGuideForExercise(exercise);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close exercise guide" onPress={onClose} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
            <V23Icon name="back" color={tokens.text} size={18} /><Text style={styles.headerActionText}>Close</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Exercise guide</Text>
          <View style={styles.headerAction} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>MOVEMENT GUIDE</Text>
            <Text style={styles.title}>{exercise.name}</Text>
            <Text style={styles.description}>{exercise.shortDescription}</Text>
          </View>

          {visual ? <IllustratedGuide source={visual.source} styles={styles} /> : <WrittenDemoCard exercise={exercise} styles={styles} />}

          <View style={styles.primaryGuide}>
            <InstructionSection number="1" title="Set up" items={exercise.instructions.setup} styles={styles} tokens={tokens} />
            <InstructionSection number="2" title="Move" items={exercise.instructions.execution} styles={styles} tokens={tokens} />
            <InstructionSection number="3" title="Focus" items={exercise.instructions.cues} styles={styles} tokens={tokens} />
          </View>

          <ProductDisclosure
            title="Need an easier or harder version?"
            summary="See how Side Quest thinks about the exercise ladder."
            expanded={ladderOpen}
            onPress={() => setLadderOpen((value) => !value)}
          >
            <View style={styles.variationGrid}>
              <View style={styles.variationItem}>
                <Text style={styles.variationLabel}>EASIER</Text>
                <Text style={styles.variationText}>{easierVariationHint(exercise)}</Text>
              </View>
              <View style={styles.variationItem}>
                <Text style={styles.variationLabel}>HARDER</Text>
                <Text style={styles.variationText}>{harderVariationHint(exercise)}</Text>
              </View>
            </View>
            <Text style={styles.disclosureNote}>In a workout, use Swap → Make this easier or Make this harder. Side Quest prioritizes the same movement family before considering an unrelated exercise.</Text>
          </ProductDisclosure>

          {exercise.instructions.commonMistakes.length ? <ProductDisclosure
            title="Common mistakes"
            summary={`${exercise.instructions.commonMistakes.length} thing${exercise.instructions.commonMistakes.length === 1 ? '' : 's'} to watch for.`}
            expanded={mistakesOpen}
            onPress={() => setMistakesOpen((value) => !value)}
          >
            <BulletList items={exercise.instructions.commonMistakes} styles={styles} />
          </ProductDisclosure> : null}

          <ProductDisclosure
            title="Exercise details"
            summary={`${exercise.category} · ${equipmentSummary(exercise)}`}
            expanded={detailsOpen}
            onPress={() => setDetailsOpen((value) => !value)}
          >
            <View style={styles.detailRows}>
              <DetailRow label="Category" value={exercise.category} styles={styles} />
              <DetailRow label="Laterality" value={formatLaterality(exercise.laterality)} styles={styles} />
              <DetailRow label="Equipment" value={exercise.equipmentOptions.map((option) => option.label).join(' · ') || 'Bodyweight'} styles={styles} />
            </View>
          </ProductDisclosure>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}>
            <Text style={styles.doneButtonText}>Back to workout</Text><V23Icon name="check" color="#FFFFFF" size={16} />
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function IllustratedGuide({ source, styles }: { source: number; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.illustrationCard}>
    <Image source={source} style={styles.illustration} contentFit="contain" transition={120} />
  </View>;
}

function WrittenDemoCard({ exercise, styles }: { exercise: Exercise; styles: ReturnType<typeof makeStyles> }) {
  const setup = exercise.instructions.setup[0] ?? 'Establish a stable starting position.';
  const movement = exercise.instructions.execution[0] ?? 'Move through the exercise under control.';
  const cue = exercise.instructions.cues[0] ?? 'Use a controlled range and stop if the movement is painful.';
  return <View style={styles.writtenCard}>
    <Text style={styles.writtenEyebrow}>NO ILLUSTRATION AVAILABLE</Text>
    <Text style={styles.writtenTitle}>Three-step movement guide</Text>
    <WrittenStep number="1" label="SET UP" text={setup} styles={styles} />
    <WrittenStep number="2" label="MOVE" text={movement} styles={styles} />
    <WrittenStep number="3" label="FOCUS" text={cue} styles={styles} />
  </View>;
}

function WrittenStep({ number, label, text, styles }: { number: string; label: string; text: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.writtenStep}>
    <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View>
    <View style={styles.writtenStepCopy}><Text style={styles.writtenStepLabel}>{label}</Text><Text style={styles.writtenStepText}>{text}</Text></View>
  </View>;
}

function InstructionSection({
  number,
  title,
  items,
  styles,
  tokens,
}: {
  number: string;
  title: string;
  items: string[];
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  if (items.length === 0) return null;
  return <View style={styles.guideSection}>
    <View style={styles.guideHeader}>
      <View style={styles.guideNumber}><Text style={styles.guideNumberText}>{number}</Text></View>
      <Text style={styles.guideTitle}>{title}</Text>
      {number === '3' ? <V23Icon name="info" color={tokens.textMuted} size={14} /> : null}
    </View>
    <BulletList items={items} styles={styles} />
  </View>;
}

function BulletList({ items, styles }: { items: string[]; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.bulletList}>{items.map((item, index) => <View key={`${index}-${item}`} style={styles.bulletRow}>
    <Text style={styles.bullet}>•</Text><Text style={styles.bulletText}>{item}</Text>
  </View>)}</View>;
}

function DetailRow({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

function easierVariationHint(exercise: Exercise) {
  if (exercise.laterality === 'unilateral') return 'Use the bilateral version, add light hand support, or reduce the range and repetitions.';
  if (exercise.impactLevel >= 3) return 'Remove the jump or impact component and use a controlled strength version.';
  if (exercise.balanceDemand >= 3) return 'Use support or a more stable surface before reducing the whole movement.';
  return 'Reduce repetitions or time, use a comfortable range, or choose the closest lower-demand variation.';
}

function harderVariationHint(exercise: Exercise) {
  const loadable = exercise.equipmentOptions.some((option) => option.items.some((item) => item.equipmentId !== 'bodyweight'));
  if (exercise.laterality === 'bilateral') return 'Build toward the top of the rep range, then consider a unilateral version or the smallest practical external load.';
  if (loadable) return 'Increase repetitions or time first; then use the next real implement size while returning to the lower end of the rep range.';
  return 'Increase repetitions or time first, then use slower tempo, pauses, greater range, or a harder related variation.';
}

function equipmentSummary(exercise: Exercise): string {
  return exercise.equipmentOptions[0]?.label ?? 'Bodyweight';
}

function formatLaterality(value: Exercise['laterality']): string {
  if (value === 'unilateral') return 'One side at a time';
  if (value === 'bilateral') return 'Both sides together';
  return String(value).replaceAll('_', ' ');
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.canvas },
    header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border, backgroundColor: tokens.surface },
    headerAction: { width: 84, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 3 },
    headerActionText: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    headerTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 34, gap: 14 },
    heroCopy: { gap: 4, paddingHorizontal: 2 },
    eyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    title: { color: tokens.text, fontSize: 26, lineHeight: 31, fontWeight: '900', letterSpacing: -0.45 },
    description: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
    illustrationCard: { backgroundColor: tokens.surface, borderRadius: 21, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
    illustration: { width: '100%', aspectRatio: 3 / 2, backgroundColor: tokens.surface },
    writtenCard: { backgroundColor: tokens.surfaceMuted, borderRadius: 20, padding: 14, gap: 10 },
    writtenEyebrow: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
    writtenTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    writtenStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center' },
    stepNumberText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '900' },
    writtenStepCopy: { flex: 1, minWidth: 0, gap: 2 },
    writtenStepLabel: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.75 },
    writtenStepText: { color: tokens.text, fontSize: 11.5, lineHeight: 16 },
    primaryGuide: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    guideSection: { padding: 14, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    guideHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    guideNumber: { width: 27, height: 27, borderRadius: 14, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    guideNumberText: { color: tokens.accent, fontSize: 10, fontWeight: '900' },
    guideTitle: { flex: 1, color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
    bulletList: { gap: 6 },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    bullet: { color: tokens.accent, fontSize: 15, lineHeight: 19, fontWeight: '900' },
    bulletText: { flex: 1, color: tokens.text, fontSize: 12, lineHeight: 18 },
    variationGrid: { gap: 8 },
    variationItem: { borderRadius: 13, backgroundColor: tokens.surfaceMuted, padding: 10, gap: 3 },
    variationLabel: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.75 },
    variationText: { color: tokens.text, fontSize: 11.5, lineHeight: 16 },
    disclosureNote: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15 },
    detailRows: { gap: 0 },
    detailRow: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    detailLabel: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15, fontWeight: '800' },
    detailValue: { flex: 1, color: tokens.text, fontSize: 11.5, lineHeight: 16, fontWeight: '700', textAlign: 'right' },
    footer: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, backgroundColor: tokens.surface },
    doneButton: { minHeight: 47, borderRadius: 14, backgroundColor: tokens.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    doneButtonText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
    pressed: { opacity: 0.72 },
  });
}
