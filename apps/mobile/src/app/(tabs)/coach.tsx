import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { V23Card, V23Icon, V23PrimaryButton, V23ScenicBanner, V23Screen } from '@/components/v23-ui';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export default function CoachTab() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return <V23Screen contentStyle={styles.page}>
    <View style={styles.intro}><Text style={styles.eyebrow}>TODAY'S CALL</Text><Text style={styles.title}>Start with the week.</Text><Text style={styles.body}>Side Quest can make a better recommendation after you set a goal, availability, and race priority.</Text></View>
    <V23ScenicBanner variant="morning" />
    <V23Card elevated style={styles.callCard}>
      <View style={styles.callTop}><View><Text style={styles.callLabel}>BEST NEXT MOVE</Text><Text style={styles.callTitle}>Build a provisional week</Text></View><View style={styles.icon}><V23Icon name="goal" color={tokens.accent} size={22} /></View></View>
      <Text style={styles.callBody}>You do not need perfect data. Start with what you know, then let the plan adapt as workouts arrive.</Text>
      <V23PrimaryButton onPress={() => router.push('/goal-catalog' as Href)}>Create my week</V23PrimaryButton>
    </V23Card>
    <View style={styles.questions}>
      {[
        ['Why this?', 'See the evidence behind today’s recommendation.', '/side-quest-coach'],
        ['What changed?', 'Review recent adjustments and activity matches.', '/weekly-review'],
        ['What needs attention?', 'Open the training body map and regional priorities.', '/insights'],
      ].map(([title, body, route]) => <Pressable key={title} onPress={() => router.push(route as Href)} style={({ pressed }) => [styles.question, pressed && styles.pressed]}><View style={styles.questionCopy}><Text style={styles.questionTitle}>{title}</Text><Text style={styles.questionBody}>{body}</Text></View><V23Icon name="chevron" color={tokens.textMuted} size={17} /></Pressable>)}
    </View>
  </V23Screen>;
}
function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  page: { gap: 18, paddingTop: 22 }, intro: { gap: 6 }, eyebrow: { color: tokens.accent, fontSize: 11, lineHeight: 14, fontWeight: '900', letterSpacing: 1.25 }, title: { color: tokens.text, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -0.7 }, body: { color: tokens.textMuted, fontSize: 15.5, lineHeight: 22 }, callCard: { gap: 16, padding: 20 }, callTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, callLabel: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.1 }, callTitle: { color: tokens.text, fontSize: 23, lineHeight: 28, fontWeight: '900', marginTop: 3 }, callBody: { color: tokens.textMuted, fontSize: 15, lineHeight: 22 }, icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' }, questions: { backgroundColor: tokens.surface, borderRadius: 22, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' }, question: { minHeight: 78, paddingHorizontal: 17, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border }, questionCopy: { flex: 1, gap: 2 }, questionTitle: { color: tokens.text, fontSize: 16.5, lineHeight: 21, fontWeight: '800' }, questionBody: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 }, pressed: { opacity: 0.7 },
}); }
