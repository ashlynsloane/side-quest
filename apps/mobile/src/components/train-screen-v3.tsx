import type { PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActiveWorkoutResumeCard } from '@/components/active-workout-resume-card';
import { ProductDisclosure } from '@/components/product-ui';
import { SportIcon } from '@/components/sport-icon';
import { V23Icon, V23ScenicBanner, V23Screen } from '@/components/v23-ui';
import { getLatestTrainingBlock } from '@/services/database';
import { useTheme } from '@/state/theme-context';
import { useWorkoutContext } from '@/state/workout-context';
import type { DesignTokens } from '@/theme';

export default function TrainScreenV3() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const {
    activeWorkout,
    activePlanLink,
    openPlannedWorkoutPreview,
  } = useWorkoutContext();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    void getLatestTrainingBlock().then((saved) => {
      if (live) setBlock(saved?.block ?? null);
    });
    return () => { live = false; };
  }, []));

  const next = useMemo(() => nextSession(block), [block]);

  function reviewRecommended() {
    if (!next) {
      router.push('/generate' as Href);
      return;
    }
    openPlannedWorkoutPreview(next, { goal: block?.goal });
    router.push('/workout-preview' as Href);
  }

  return <V23Screen contentStyle={styles.page}>
    <View style={styles.header}>
      <Text style={styles.title}>Train</Text>
      <Text style={styles.subtitle}>Strength that fits the rest of the week.</Text>
    </View>

    {activeWorkout ? <ActiveWorkoutResumeCard
      workout={activeWorkout}
      planLink={activePlanLink}
      onResume={() => router.push('/active-workout' as Href)}
      compact
    /> : null}

    <View style={styles.hero}>
      <View style={styles.scene}><V23ScenicBanner variant="strength" /></View>
      <View style={styles.heroBody}>
        <View style={styles.heroTop}>
          <View style={styles.heroKickerRow}>
            <SportIcon kind="strength" color={tokens.accent} backgroundColor={tokens.accentSoft} size={19} />
            <Text style={styles.kicker}>{next ? 'NEXT PLANNED STRENGTH' : 'BUILD A SESSION'}</Text>
          </View>
          {next ? <View style={styles.loadPill}><Text style={styles.loadPillText}>{friendlyLoad(next.intendedLoad)}</Text></View> : null}
        </View>
        <Text style={styles.heroTitle}>{next?.title ?? 'Build around today’s constraints.'}</Text>
        <Text style={styles.heroMeta}>{next
          ? `${formatDate(next.date)} · ${Math.round(next.workout.estimatedElapsedSeconds / 60)} min · ${next.workout.stations.length} stations`
          : 'Set time, equipment, and any temporary limitations.'}</Text>
        <Text style={styles.heroReason}>{next
          ? 'This is the strength session currently placed in the whole-athlete plan. Review it before you start, swap, or edit.'
          : 'Side Quest will generate one session without changing the rest of your plan.'}</Text>
        <Pressable accessibilityRole="button" onPress={reviewRecommended} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>{next ? 'Review workout' : 'Build quick workout'}</Text>
          <V23Icon name="chevron" color="#FFFFFF" size={17} />
        </Pressable>
      </View>
    </View>

    <View style={styles.builderSection}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionEyebrow}>CHOOSE YOUR PATH</Text>
        <Text style={styles.sectionTitle}>Train the plan, or build around the day.</Text>
      </View>
      <View style={styles.actionStack}>
        <ActionRow
          icon="clock"
          title="Quick workout"
          body="Choose time, equipment, emphasis, and temporary limitations."
          onPress={() => router.push('/generate' as Href)}
          tokens={tokens}
          styles={styles}
        />
        <ActionRow
          icon="heart"
          title="Saved workouts"
          body="Return to a favorite without digging through workout history."
          onPress={() => router.push('/favorites' as Href)}
          tokens={tokens}
          styles={styles}
        />
        <ActionRow
          icon="search"
          title="Exercise library"
          body="Browse movements, demos, and exercise details."
          onPress={() => router.push('/exercise-library' as Href)}
          tokens={tokens}
          styles={styles}
        />
      </View>
    </View>

    <ProductDisclosure
      title="More training tools"
      summary="Logging and rescue tools stay available without competing with the workout flow."
      expanded={toolsOpen}
      onPress={() => setToolsOpen((value) => !value)}
    >
      <View style={styles.toolList}>
        <CompactTool
          title="Log a completed session"
          body="Record strength you completed elsewhere."
          onPress={() => router.push('/log-workout' as Href)}
          tokens={tokens}
          styles={styles}
        />
        <CompactTool
          title="Shorten or rescue a session"
          body="Keep the intent with less volume when the day changes."
          onPress={() => router.push('/session-rescue' as Href)}
          tokens={tokens}
          styles={styles}
        />
      </View>
    </ProductDisclosure>
  </V23Screen>;
}

function ActionRow({ icon, title, body, onPress, tokens, styles }: {
  icon: Parameters<typeof V23Icon>[0]['name'];
  title: string;
  body: string;
  onPress: () => void;
  tokens: DesignTokens;
  styles: ReturnType<typeof makeStyles>;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
    <View style={styles.actionIcon}><V23Icon name={icon} color={tokens.accent} size={20} /></View>
    <View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionBody}>{body}</Text></View>
    <V23Icon name="chevron" color={tokens.textMuted} size={16} />
  </Pressable>;
}

function CompactTool({ title, body, onPress, tokens, styles }: { title: string; body: string; onPress: () => void; tokens: DesignTokens; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.toolRow, pressed && styles.pressed]}>
    <View style={styles.toolCopy}><Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolBody}>{body}</Text></View>
    <V23Icon name="chevron" color={tokens.textMuted} size={15} />
  </Pressable>;
}

function nextSession(block: TrainingBlockPlan | null): PlannedStrengthSession | null {
  if (!block) return null;
  const today = localDate();
  return block.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.date >= today && !['completed', 'skipped'].includes(session.completionStatus))
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function friendlyLoad(value: PlannedStrengthSession['intendedLoad']): string {
  return value === 'high' ? 'High load' : value === 'moderate' ? 'Moderate' : 'Light';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 18, paddingTop: 16, paddingBottom: 36 },
    header: { gap: 2, paddingHorizontal: 2 },
    title: { color: tokens.text, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.55 },
    subtitle: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },

    hero: { borderRadius: 25, overflow: 'hidden', borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface },
    scene: { height: 88, overflow: 'hidden', backgroundColor: tokens.surfaceMuted },
    heroBody: { padding: 18, gap: 7 },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    heroKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
    kicker: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    loadPill: { borderRadius: 999, backgroundColor: tokens.accentSoft, paddingHorizontal: 8, paddingVertical: 5 },
    loadPillText: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900' },
    heroTitle: { color: tokens.text, fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -0.55 },
    heroMeta: { color: tokens.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
    heroReason: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
    primaryButton: { minHeight: 46, borderRadius: 14, backgroundColor: tokens.accent, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 18, fontWeight: '900' },

    builderSection: { gap: 10 },
    sectionHeading: { gap: 2, paddingHorizontal: 2 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    sectionTitle: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '900', letterSpacing: -0.2 },
    actionStack: { borderRadius: 19, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    actionRow: { minHeight: 72, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    actionIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    actionCopy: { flex: 1, minWidth: 0, gap: 2 },
    actionTitle: { color: tokens.text, fontSize: 14, lineHeight: 18, fontWeight: '900' },
    actionBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },

    toolList: { gap: 0 },
    toolRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingVertical: 9 },
    toolCopy: { flex: 1, minWidth: 0, gap: 1 },
    toolTitle: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    toolBody: { color: tokens.textMuted, fontSize: 11, lineHeight: 15 },
    pressed: { opacity: 0.74 },
  });
}
