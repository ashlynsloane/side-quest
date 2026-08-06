import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { V29TodayAction, V29TodayVisibleScreenModel } from '@circuit/domain';

export interface TodayWorkspaceScreenProps {
  model: V29TodayVisibleScreenModel;
  onAction: (action: V29TodayAction) => void;
}

type ViewStyleName =
  | 'content'
  | 'contextHeader'
  | 'hero'
  | 'card'
  | 'recoveryCard'
  | 'attentionCard'
  | 'section'
  | 'actionRow'
  | 'action'
  | 'primaryAction'
  | 'timelineRow'
  | 'divider'
  | 'timelineContent'
  | 'upcomingRow'
  | 'upcomingCard';

type TextStyleName =
  | 'date'
  | 'phase'
  | 'eyebrow'
  | 'heroTitle'
  | 'cardTitle'
  | 'sectionTitle'
  | 'rowTitle'
  | 'body'
  | 'meta'
  | 'source'
  | 'actionText'
  | 'primaryActionText'
  | 'time'
  | 'status'
  | 'conflict';

const viewStyles = StyleSheet.create<Record<ViewStyleName, ViewStyle>>({
  content: { paddingHorizontal: 18, paddingTop: 12, gap: 14 },
  contextHeader: { paddingHorizontal: 2, paddingBottom: 2 },
  hero: { borderRadius: 24, borderWidth: 1, padding: 20, gap: 9, backgroundColor: '#FFFFFF' },
  card: { borderRadius: 22, borderWidth: 1, padding: 17, gap: 8, backgroundColor: '#FFFFFF' },
  recoveryCard: { backgroundColor: '#F6F3EC' },
  attentionCard: { backgroundColor: '#FFF8EE' },
  section: { gap: 0 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 7 },
  action: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAction: { backgroundColor: '#15233B', borderColor: '#15233B' },
  timelineRow: { minHeight: 64, flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, gap: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  timelineContent: { flex: 1, gap: 3 },
  upcomingRow: { flexDirection: 'row', gap: 10 },
  upcomingCard: { flex: 1, minHeight: 118 },
});

const textStyles = StyleSheet.create<Record<TextStyleName, TextStyle>>({
  date: { fontSize: 24, fontWeight: '700' },
  phase: { fontSize: 15, marginTop: 4, opacity: 0.72 },
  eyebrow: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, opacity: 0.65 },
  heroTitle: { fontSize: 28, lineHeight: 33, fontWeight: '700' },
  cardTitle: { fontSize: 19, lineHeight: 24, fontWeight: '700' },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, opacity: 0.82 },
  meta: { fontSize: 14, lineHeight: 20, opacity: 0.67 },
  source: { fontSize: 13, opacity: 0.58 },
  actionText: { fontSize: 15, fontWeight: '600' },
  primaryActionText: { color: '#FFFFFF' },
  time: { width: 72, fontSize: 13, fontWeight: '600', paddingTop: 2 },
  status: { fontSize: 12, fontWeight: '600', opacity: 0.66 },
  conflict: { fontSize: 13, lineHeight: 18, marginTop: 3 },
});

const ActionRow = ({ actions, onAction }: { actions: V29TodayAction[]; onAction: (action: V29TodayAction) => void }) => (
  <View style={viewStyles.actionRow}>
    {actions.map((item) => (
      <Pressable
        key={item.actionId}
        accessibilityRole="button"
        accessibilityLabel={item.accessibilityLabel}
        onPress={() => onAction(item)}
        style={[viewStyles.action, item.primary ? viewStyles.primaryAction : undefined]}
      >
        <Text style={[textStyles.actionText, item.primary ? textStyles.primaryActionText : undefined]}>{item.label}</Text>
      </Pressable>
    ))}
  </View>
);

export function TodayWorkspaceScreen({ model, onAction }: TodayWorkspaceScreenProps) {
  return (
    <ScrollView
      contentContainerStyle={[viewStyles.content, { paddingBottom: model.bottomInsetForNavigation }]}
      showsVerticalScrollIndicator={false}
    >
      <View accessibilityRole="header" style={viewStyles.contextHeader}>
        <Text style={textStyles.date}>{model.dateLabel}</Text>
        {model.phaseContext ? <Text style={textStyles.phase}>{model.phaseContext}</Text> : null}
      </View>

      {model.readiness.tone === 'attention' ? (
        <View style={[viewStyles.card, viewStyles.attentionCard]}>
          <Text style={textStyles.cardTitle}>{model.readiness.title}</Text>
          <Text style={textStyles.body}>{model.readiness.interpretation}</Text>
          {model.readiness.restrictionLabel ? <Text style={textStyles.meta}>{model.readiness.restrictionLabel}</Text> : null}
          <ActionRow actions={model.readiness.actions} onAction={onAction} />
        </View>
      ) : null}

      <View
        style={[
          viewStyles.hero,
          model.hero.tone === 'recovery' ? viewStyles.recoveryCard : undefined,
          model.hero.tone === 'attention' ? viewStyles.attentionCard : undefined,
        ]}
      >
        <Text style={textStyles.eyebrow}>{model.hero.eyebrow}</Text>
        <Text style={textStyles.heroTitle}>{model.hero.title}</Text>
        <Text style={textStyles.meta}>{model.hero.metaLine}</Text>
        <Text style={textStyles.body}>{model.hero.purpose}</Text>
        {model.hero.sourceLabel ? <Text style={textStyles.source}>{model.hero.sourceLabel}</Text> : null}
        <ActionRow actions={model.hero.actions} onAction={onAction} />
      </View>

      {model.readiness.tone !== 'attention' ? (
        <View style={viewStyles.card}>
          <Text style={textStyles.cardTitle}>{model.readiness.title}</Text>
          <Text style={textStyles.body}>{model.readiness.interpretation}</Text>
          {model.readiness.restrictionLabel ? <Text style={textStyles.meta}>{model.readiness.restrictionLabel}</Text> : null}
          <ActionRow actions={model.readiness.actions} onAction={onAction} />
        </View>
      ) : null}

      {model.timeline.length > 0 ? (
        <View style={viewStyles.section}>
          <Text style={textStyles.sectionTitle}>Your day</Text>
          <View style={viewStyles.card}>
            {model.timeline.map((row, index) => (
              <View
                key={row.id}
                style={[viewStyles.timelineRow, index < model.timeline.length - 1 ? viewStyles.divider : undefined]}
              >
                <Text style={textStyles.time}>{row.timeLabel}</Text>
                <View style={viewStyles.timelineContent}>
                  <Text style={textStyles.rowTitle}>{row.title}</Text>
                  <Text style={textStyles.meta}>{row.detail}</Text>
                  {row.conflictMessage ? <Text style={textStyles.conflict}>{row.conflictMessage}</Text> : null}
                </View>
                {row.statusLabel ? <Text style={textStyles.status}>{row.statusLabel}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {model.decision ? (
        <View style={[viewStyles.card, viewStyles.attentionCard]}>
          <Text style={textStyles.cardTitle}>{model.decision.title}</Text>
          <Text style={textStyles.body}>{model.decision.explanation}</Text>
          <ActionRow actions={model.decision.actions} onAction={onAction} />
        </View>
      ) : null}

      {model.upcoming.length > 0 ? (
        <View style={viewStyles.section}>
          <Text style={textStyles.sectionTitle}>Coming up</Text>
          <View style={viewStyles.upcomingRow}>
            {model.upcoming.map((item) => (
              <View key={`${item.dayLabel}-${item.title}`} style={[viewStyles.card, viewStyles.upcomingCard]}>
                <Text style={textStyles.eyebrow}>{item.dayLabel}</Text>
                <Text style={textStyles.rowTitle}>{item.title}</Text>
                <Text style={textStyles.meta}>{item.detail}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
