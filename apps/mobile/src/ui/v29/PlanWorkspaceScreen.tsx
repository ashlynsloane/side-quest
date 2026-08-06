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
import type { V29PlanAction, V29PlanVisibleScreenModel } from '@circuit/domain';

export interface PlanWorkspaceScreenProps {
  model: V29PlanVisibleScreenModel;
  onAction?: (action: V29PlanAction) => void;
}

function ActionButton({ action, onPress }: { action: V29PlanAction; onPress?: (action: V29PlanAction) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      onPress={() => onPress?.(action)}
      style={[viewStyles.action, action.primary ? viewStyles.actionPrimary : undefined]}
    >
      <Text style={[textStyles.action, action.primary ? textStyles.actionPrimary : undefined]}>{action.label}</Text>
    </Pressable>
  );
}

export function PlanWorkspaceScreen({ model, onAction }: PlanWorkspaceScreenProps) {
  return (
    <ScrollView
      style={viewStyles.canvas}
      contentContainerStyle={[viewStyles.content, { paddingBottom: model.bottomInsetForNavigation }]}
    >
      <View style={viewStyles.phaseCard}>
        <Text style={textStyles.eyebrow}>{model.phase.eyebrow}</Text>
        <Text style={textStyles.phaseTitle}>{model.phase.title}</Text>
        <Text style={textStyles.phaseWeek}>{model.phase.weekLabel}</Text>
        <Text style={textStyles.body}>{model.phase.objective}</Text>
        {model.phase.goalLine ? <Text style={textStyles.goal}>{model.phase.goalLine}</Text> : null}
      </View>

      {model.alerts.length > 0 ? (
        <View style={viewStyles.section}>
          <Text style={textStyles.sectionTitle}>Needs attention</Text>
          {model.alerts.map((alert) => (
            <View key={alert.alertId} style={[viewStyles.card, alert.tone === 'high' ? viewStyles.highAlert : viewStyles.attentionAlert]}>
              <Text style={textStyles.cardTitle}>{alert.title}</Text>
              <Text style={textStyles.body}>{alert.explanation}</Text>
              <View style={viewStyles.actionRow}>{alert.actions.map((item) => <ActionButton key={item.actionId} action={item} onPress={onAction} />)}</View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={viewStyles.section}>
        <View style={viewStyles.sectionHeadingRow}>
          <View>
            <Text style={textStyles.sectionTitle}>{model.weekLabel}</Text>
            <Text style={textStyles.meta}>{model.totalTimeLabel}</Text>
          </View>
        </View>
        {model.sportSummary.length > 0 ? <Text style={textStyles.sportSummary}>{model.sportSummary.join('  ·  ')}</Text> : null}
        {model.emptyState ? <View style={viewStyles.card}><Text style={textStyles.body}>{model.emptyState}</Text></View> : null}
        {model.days.map((day) => (
          <View key={day.dateKey} style={[viewStyles.dayCard, day.isToday ? viewStyles.todayCard : undefined]}>
            <View style={viewStyles.dayHeader}>
              <Text style={textStyles.dayTitle}>{day.dayLabel}</Text>
              <Text style={textStyles.dayDate}>{day.dateLabel}{day.isToday ? ' · Today' : ''}</Text>
            </View>
            {day.commitmentLabels.map((label) => <Text key={label} style={textStyles.commitment}>{label}</Text>)}
            {day.emptyMessage ? <Text style={textStyles.openDay}>{day.emptyMessage}</Text> : null}
            {day.sessions.map((session) => (
              <View key={session.sessionId} style={viewStyles.sessionRow}>
                <View style={viewStyles.sessionCopy}>
                  <Text style={textStyles.sessionTitle}>{session.title}</Text>
                  <Text style={textStyles.meta}>{session.detail}</Text>
                  <Text style={textStyles.status}>{[session.timeLabel, session.statusLabel, session.priorityLabel].filter(Boolean).join(' · ')}</Text>
                </View>
                <View style={viewStyles.actionRow}>{session.actions.map((item) => <ActionButton key={item.actionId} action={item} onPress={onAction} />)}</View>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={viewStyles.section}>
        <Text style={textStyles.sectionTitle}>Adjust plan</Text>
        <View style={viewStyles.controlGrid}>{model.controls.map((item) => <ActionButton key={item.actionId} action={item} onPress={onAction} />)}</View>
      </View>

      {model.roadmap.length > 0 ? (
        <View style={viewStyles.section}>
          <Text style={textStyles.sectionTitle}>Roadmap</Text>
          {model.roadmap.map((block) => (
            <View key={block.blockId} style={[viewStyles.card, block.current ? viewStyles.currentRoadmap : undefined]}>
              <Text style={textStyles.eyebrow}>{block.stateLabel}</Text>
              <Text style={textStyles.cardTitle}>{block.title}</Text>
              <Text style={textStyles.meta}>{block.dateRangeLabel}</Text>
              <Text style={textStyles.body}>{block.emphasis}</Text>
              <View style={viewStyles.actionRow}>{block.actions.map((item) => <ActionButton key={item.actionId} action={item} onPress={onAction} />)}</View>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const viewStyles = StyleSheet.create<Record<string, ViewStyle>>({
  canvas: { flex: 1, backgroundColor: '#F5F3EE' },
  content: { paddingHorizontal: 18, paddingTop: 12, gap: 18 },
  phaseCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: '#E1DED6', gap: 5 },
  section: { gap: 10 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E1DED6', gap: 7 },
  attentionAlert: { borderColor: '#CBA968' },
  highAlert: { borderColor: '#A76A63', borderWidth: 2 },
  dayCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, borderWidth: 1, borderColor: '#E1DED6', gap: 9 },
  todayCard: { borderWidth: 2, borderColor: '#244A57' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sessionRow: { borderTopWidth: 1, borderTopColor: '#ECE9E2', paddingTop: 11, gap: 9 },
  sessionCopy: { gap: 3 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#C9C6BE', justifyContent: 'center', alignItems: 'center' },
  actionPrimary: { backgroundColor: '#173E4A', borderColor: '#173E4A' },
  controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  currentRoadmap: { borderWidth: 2, borderColor: '#557F78' },
});

const textStyles = StyleSheet.create<Record<string, TextStyle>>({
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: '#55706F' },
  phaseTitle: { fontSize: 27, lineHeight: 32, fontWeight: '700', color: '#162E36' },
  phaseWeek: { fontSize: 15, fontWeight: '600', color: '#365A62' },
  goal: { marginTop: 5, fontSize: 14, fontWeight: '600', color: '#244A57' },
  sectionTitle: { fontSize: 21, lineHeight: 26, fontWeight: '700', color: '#172F36' },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: '#172F36' },
  body: { fontSize: 15, lineHeight: 21, color: '#35484C' },
  meta: { fontSize: 13, lineHeight: 18, color: '#5C6A6C' },
  sportSummary: { fontSize: 13, lineHeight: 18, color: '#405B61' },
  dayTitle: { fontSize: 17, fontWeight: '700', color: '#172F36' },
  dayDate: { fontSize: 13, fontWeight: '600', color: '#50666A' },
  commitment: { fontSize: 13, lineHeight: 18, color: '#655D4E' },
  openDay: { fontSize: 14, lineHeight: 20, color: '#647073' },
  sessionTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: '#1C343B' },
  status: { fontSize: 12, lineHeight: 17, fontWeight: '600', color: '#48656A' },
  action: { fontSize: 14, fontWeight: '600', color: '#244A57' },
  actionPrimary: { color: '#FFFFFF' },
});
