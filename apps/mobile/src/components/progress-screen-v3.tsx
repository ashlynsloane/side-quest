import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { V23Icon, V23Screen } from '@/components/v23-ui';
import { YouModeSwitch } from '@/components/you-mode-switch';
import {
  loadProgressDashboard,
  type ProgressDashboardData,
  type ProgressDashboardRecentItem,
  type ProgressWindowDays,
} from '@/services/progress-dashboard';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export default function ProgressScreenV3() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [windowDays, setWindowDays] = useState<ProgressWindowDays>(14);
  const [data, setData] = useState<ProgressDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadProgressDashboard(windowDays));
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <V23Screen contentStyle={styles.page}>
    <YouModeSwitch active="progress" />

    <View style={styles.header}>
      <Text style={styles.eyebrow}>PROGRESS</Text>
      <Text style={styles.title}>Training history</Text>
      <Text style={styles.subtitle}>Recent sessions, progression signals, and anything that needs attention.</Text>
    </View>

    <View style={styles.windowSwitch}>
      {([14, 28] as const).map((days) => <Pressable
        key={days}
        accessibilityRole="button"
        accessibilityState={{ selected: windowDays === days }}
        onPress={() => setWindowDays(days)}
        style={[styles.windowButton, windowDays === days && styles.windowButtonActive]}
      >
        <Text style={[styles.windowText, windowDays === days && styles.windowTextActive]}>{days} days</Text>
      </Pressable>)}
    </View>

    <View style={styles.metrics}>
      <Metric value={data?.trainingDays ?? 0} label="training days" styles={styles} />
      <Metric value={data?.strengthSessions ?? 0} label="strength" styles={styles} />
      <Metric value={data?.enduranceSessions ?? 0} label="endurance" styles={styles} />
    </View>

    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>LAST {windowDays} DAYS</Text>
      <Text style={styles.summaryTitle}>{loading && !data ? 'Loading training…' : `${data?.totalMinutes ?? 0} min across ${data?.sessions ?? 0} session${data?.sessions === 1 ? '' : 's'}`}</Text>
      {data ? <Text style={styles.summaryBody}>{comparisonSummary(data.comparisonMessage)}</Text> : null}
    </View>

    <View style={styles.sectionHeading}>
      <Text style={styles.sectionEyebrow}>BODY AREAS</Text>
      <Text style={styles.sectionTitle}>Anything that needs attention</Text>
    </View>

    <View style={styles.regionalCard}>
      <View style={styles.regionalMetrics}>
        <SmallMetric value={data?.onPlanCount ?? 0} label="on plan / recent" styles={styles} />
        <SmallMetric value={data?.opportunityCount ?? 0} label="opportunities" styles={styles} />
        <SmallMetric value={data?.reviewCount ?? 0} label="review" styles={styles} />
      </View>

      {data?.regionalPriorities.map((item) => <Pressable
        key={item.region}
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/training-region', params: { region: item.region } } as never)}
        style={({ pressed }) => [styles.regionRow, pressed && styles.pressed]}
      >
        <View style={[styles.regionDot, item.warning && styles.regionDotWarning]} />
        <View style={styles.regionCopy}>
          <View style={styles.rowTop}>
            <Text style={styles.regionName}>{item.regionLabel}</Text>
            <Text style={styles.regionState}>{item.stateLabel}</Text>
          </View>
          <Text style={styles.regionDetail}>{item.detail}</Text>
          <Text style={styles.regionNext}>{item.recommendation}</Text>
        </View>
        <V23Icon name="chevron" color={tokens.textMuted} size={15} />
      </Pressable>)}

      {data && data.regionalPriorities.length === 0 ? <View style={styles.noPriority}>
        <Text style={styles.noPriorityTitle}>Nothing needs special attention right now</Text>
        <Text style={styles.noPriorityBody}>No body area has a current review flag.</Text>
      </View> : null}

      <Pressable accessibilityRole="button" onPress={() => router.push('/insights' as Href)} style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}>
        <Text style={styles.inlineActionText}>Open training body map</Text>
        <V23Icon name="chevron" color={tokens.accent} size={15} />
      </Pressable>
    </View>

    <View style={styles.sectionHeading}>
      <Text style={styles.sectionEyebrow}>RECENT</Text>
      <Text style={styles.sectionTitle}>Recent sessions</Text>
    </View>

    <View style={styles.historyCard}>
      {data?.recent.map((item) => <RecentRow key={item.id} item={item} onPress={() => {
        if (item.kind === 'strength') router.push({ pathname: '/workout-detail', params: { id: item.routeId } } as never);
        else router.push({ pathname: '/activity-review', params: { id: item.routeId } } as never);
      }} styles={styles} tokens={tokens} />)}
      {data && data.recent.length === 0 ? <View style={styles.emptyHistory}>
        <Text style={styles.noPriorityTitle}>No recent sessions yet</Text>
        <Text style={styles.noPriorityBody}>Complete a workout or sync endurance training to see it here.</Text>
      </View> : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/training-history' as Href)} style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}>
        <Text style={styles.inlineActionText}>View full training history</Text>
        <V23Icon name="chevron" color={tokens.accent} size={15} />
      </Pressable>
    </View>

    <View style={styles.sectionHeading}>
      <Text style={styles.sectionEyebrow}>MORE</Text>
      <Text style={styles.sectionTitle}>More detail</Text>
    </View>

    <View style={styles.actionStack}>
      <ActionRow icon="plan" title="Strength progression" body="Exercise-specific increase, hold, and re-entry recommendations." onPress={() => router.push('/progressions' as Href)} styles={styles} tokens={tokens} />
      <ActionRow icon="insights" title="Training body map" body="Strength, sport load, and restrictions by area." onPress={() => router.push('/insights' as Href)} styles={styles} tokens={tokens} />
      <ActionRow icon="clock" title="Weekly review" body="See how this week changed." onPress={() => router.push('/weekly-review' as Href)} styles={styles} tokens={tokens} />
    </View>
  </V23Screen>;
}

function comparisonSummary(message: string): string {
  const end = message.indexOf('.');
  return end >= 0 ? message.slice(0, end + 1) : message;
}

function Metric({ value, label, styles }: { value: number; label: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function SmallMetric({ value, label, styles }: { value: number; label: string; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.smallMetric}><Text style={styles.smallMetricValue}>{value}</Text><Text style={styles.smallMetricLabel}>{label}</Text></View>;
}

function RecentRow({ item, onPress, styles, tokens }: {
  item: ProgressDashboardRecentItem;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}>
    <View style={styles.historyDate}><Text style={styles.historyDateText}>{item.dateLabel}</Text></View>
    <View style={styles.historyCopy}>
      <View style={styles.rowTop}>
        <Text style={styles.historyTitle}>{item.title}</Text>
        {item.needsReview ? <Text style={styles.reviewPill}>REVIEW</Text> : null}
      </View>
      <Text style={styles.historyMeta}>{item.typeLabel} · {item.durationMinutes} min</Text>
    </View>
    <V23Icon name="chevron" color={tokens.textMuted} size={15} />
  </Pressable>;
}

function ActionRow({ icon, title, body, onPress, styles, tokens }: {
  icon: Parameters<typeof V23Icon>[0]['name'];
  title: string;
  body: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
    <View style={styles.actionIcon}><V23Icon name={icon} color={tokens.accent} size={19} /></View>
    <View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionBody}>{body}</Text></View>
    <V23Icon name="chevron" color={tokens.textMuted} size={15} />
  </Pressable>;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 17, paddingTop: 14, paddingBottom: 38 },
    header: { gap: 4, paddingHorizontal: 2 },
    eyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.05 },
    title: { color: tokens.text, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.4 },
    subtitle: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },

    windowSwitch: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 13, backgroundColor: tokens.surfaceMuted, padding: 3, gap: 3 },
    windowButton: { minHeight: 36, borderRadius: 10, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
    windowButtonActive: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border },
    windowText: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '800' },
    windowTextActive: { color: tokens.text },

    metrics: { flexDirection: 'row', gap: 8 },
    metric: { flex: 1, minHeight: 78, borderRadius: 17, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 12, justifyContent: 'center' },
    metricValue: { color: tokens.text, fontSize: 23, lineHeight: 27, fontWeight: '900' },
    metricLabel: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14, marginTop: 3 },

    summaryCard: { borderRadius: 18, backgroundColor: tokens.surfaceMuted, padding: 14, gap: 4 },
    summaryLabel: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    summaryTitle: { color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
    summaryBody: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },

    sectionHeading: { gap: 2, paddingHorizontal: 2 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    sectionTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '800', letterSpacing: -0.15 },

    regionalCard: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    regionalMetrics: { flexDirection: 'row', gap: 1, backgroundColor: tokens.border },
    smallMetric: { flex: 1, minHeight: 64, backgroundColor: tokens.surface, paddingHorizontal: 10, paddingVertical: 11, justifyContent: 'center' },
    smallMetricValue: { color: tokens.text, fontSize: 18, lineHeight: 22, fontWeight: '900' },
    smallMetricLabel: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 13, marginTop: 2 },
    regionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    regionDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: tokens.accent, marginTop: 5 },
    regionDotWarning: { backgroundColor: tokens.danger },
    regionCopy: { flex: 1, minWidth: 0, gap: 2 },
    rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    regionName: { flex: 1, color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    regionState: { color: tokens.accent, fontSize: 9.5, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase' },
    regionDetail: { color: tokens.textMuted, fontSize: 11, lineHeight: 15 },
    regionNext: { color: tokens.text, fontSize: 11, lineHeight: 16, fontWeight: '700' },
    noPriority: { padding: 15, gap: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    noPriorityTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    noPriorityBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17 },
    inlineAction: { minHeight: 44, paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    inlineActionText: { color: tokens.accent, fontSize: 12, lineHeight: 16, fontWeight: '900' },

    historyCard: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    historyRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    historyDate: { width: 68 },
    historyDateText: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 13, fontWeight: '800' },
    historyCopy: { flex: 1, minWidth: 0, gap: 2 },
    historyTitle: { flex: 1, color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    historyMeta: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14 },
    reviewPill: { color: tokens.danger, backgroundColor: tokens.surfaceMuted, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 8.5, lineHeight: 11, fontWeight: '900' },
    emptyHistory: { padding: 15, gap: 3 },

    actionStack: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    actionRow: { minHeight: 68, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    actionIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    actionCopy: { flex: 1, minWidth: 0, gap: 2 },
    actionTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    actionBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    pressed: { opacity: 0.72 },
  });
}
