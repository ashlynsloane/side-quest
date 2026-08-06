import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import type { V29ProgressAction, V29ProgressVisibleScreenModel } from '@circuit/domain';

export interface ProgressWorkspaceScreenProps {
  model: V29ProgressVisibleScreenModel;
  onAction?: (action: V29ProgressAction) => void;
}

function ActionButton({ action, onPress }: { action: V29ProgressAction; onPress?: (action: V29ProgressAction) => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} onPress={() => onPress?.(action)} style={[viewStyles.action, action.primary ? viewStyles.actionPrimary : undefined]}>
      <Text style={[textStyles.action, action.primary ? textStyles.actionPrimary : undefined]}>{action.label}</Text>
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={textStyles.sectionTitle}>{children}</Text>;
}

export function ProgressWorkspaceScreen({ model, onAction }: ProgressWorkspaceScreenProps) {
  return (
    <ScrollView style={viewStyles.canvas} contentContainerStyle={[viewStyles.content, { paddingBottom: model.bottomInsetForNavigation }]}>
      <View style={viewStyles.overviewCard}>
        <Text style={textStyles.eyebrow}>{model.overview.eyebrow}</Text>
        <Text style={textStyles.overviewTitle}>{model.overview.title}</Text>
        <Text style={textStyles.body}>{model.overview.interpretation}</Text>
        <View style={viewStyles.primaryMessage}><Text style={textStyles.primaryMessage}>{model.overview.primaryMessage}</Text></View>
      </View>

      {model.emptyState ? <View style={viewStyles.card}><Text style={textStyles.body}>{model.emptyState}</Text></View> : null}

      {model.regionalStatus.length > 0 ? <View style={viewStyles.section}>
        <SectionTitle>How your body is responding</SectionTitle>
        {model.regionalStatus.map((region) => <View key={region.regionId} style={[viewStyles.card, region.tone === 'attention' ? viewStyles.attentionCard : undefined, region.tone === 'recovery' ? viewStyles.recoveryCard : undefined]}>
          <View style={viewStyles.rowBetween}><Text style={textStyles.cardTitle}>{region.regionLabel}</Text><Text style={textStyles.state}>{region.stateLabel}</Text></View>
          <Text style={textStyles.body}>{region.interpretation}</Text>
          {region.sportLine ? <Text style={textStyles.meta}>{region.sportLine}</Text> : null}
          {region.nextStep ? <Text style={textStyles.nextStep}>{region.nextStep}</Text> : null}
          <View style={viewStyles.actionRow}>{region.actions.map((item) => <ActionButton key={item.actionId} action={item} onPress={onAction} />)}</View>
        </View>)}
      </View> : null}

      {model.trainingWins.length > 0 ? <View style={viewStyles.section}>
        <SectionTitle>Training wins</SectionTitle>
        {model.trainingWins.map((win) => <View key={win.improvementId} style={viewStyles.card}>
          <Text style={textStyles.cardTitle}>{win.title}</Text><Text style={textStyles.body}>{win.explanation}</Text><Text style={textStyles.meta}>{win.occurredAtLabel}</Text>
        </View>)}
      </View> : null}

      {model.movementTrends.length > 0 ? <View style={viewStyles.section}>
        <SectionTitle>Movement trends</SectionTitle>
        {model.movementTrends.map((trend) => <View key={trend.movementId} style={viewStyles.card}>
          <View style={viewStyles.rowBetween}><Text style={textStyles.cardTitle}>{trend.movementLabel}</Text><Text style={textStyles.state}>{trend.directionLabel}</Text></View>
          <Text style={textStyles.body}>{trend.summary}</Text>
          <Text style={textStyles.meta}>{[trend.evidenceLabel, trend.latestValueLabel].filter(Boolean).join(' · ')}</Text>
          {trend.nextProgression ? <Text style={textStyles.nextStep}>{trend.nextProgression}</Text> : null}
          <View style={viewStyles.actionRow}>{trend.actions.map((item) => <ActionButton key={item.actionId} action={item} onPress={onAction} />)}</View>
        </View>)}
      </View> : null}

      <View style={viewStyles.section}>
        <SectionTitle>Training balance</SectionTitle>
        <View style={viewStyles.card}><Text style={textStyles.body}>{model.trainingBalance.summary}</Text>
          {model.trainingBalance.sections.map((section) => <View key={section.label} style={viewStyles.balanceSection}><Text style={textStyles.balanceLabel}>{section.label}</Text><Text style={textStyles.meta}>{section.items.join(' · ')}</Text></View>)}
          <View style={viewStyles.actionRow}>{model.trainingBalance.actions.map((item) => <ActionButton key={item.actionId} action={item} onPress={onAction} />)}</View>
        </View>
      </View>

      {model.recentHistory.length > 0 ? <View style={viewStyles.section}>
        <SectionTitle>Recent workouts</SectionTitle>
        {model.recentHistory.map((item) => <View key={item.workoutId} style={viewStyles.card}>
          <Text style={textStyles.cardTitle}>{item.name}</Text><Text style={textStyles.meta}>{item.completedAtLabel} · {item.detail}</Text><Text style={textStyles.state}>{item.statusLabel}</Text>
          {item.note ? <Text style={textStyles.body}>{item.note}</Text> : null}
          <View style={viewStyles.actionRow}>{item.actions.map((action) => <ActionButton key={action.actionId} action={action} onPress={onAction} />)}</View>
        </View>)}
      </View> : null}

      {model.milestones.length > 0 ? <View style={viewStyles.section}>
        <SectionTitle>Milestones</SectionTitle>
        {model.milestones.map((item) => <View key={item.milestoneId} style={viewStyles.card}>
          <Text style={textStyles.eyebrow}>{item.categoryLabel}</Text><Text style={textStyles.cardTitle}>{item.title}</Text><Text style={textStyles.body}>{item.detail}</Text><Text style={textStyles.meta}>{item.achievedAtLabel}</Text>
        </View>)}
      </View> : null}
    </ScrollView>
  );
}

const viewStyles = StyleSheet.create<Record<string, ViewStyle>>({
  canvas: { flex: 1, backgroundColor: '#F5F3EE' },
  content: { paddingHorizontal: 18, paddingTop: 12, gap: 18 },
  overviewCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, borderWidth: 1, borderColor: '#E1DED6', gap: 7 },
  primaryMessage: { marginTop: 5, padding: 13, borderRadius: 14, backgroundColor: '#EDF2F0' },
  section: { gap: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E1DED6', gap: 7 },
  attentionCard: { borderColor: '#A76A63', borderWidth: 2 },
  recoveryCard: { borderColor: '#CBA968' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#C9C6BE', justifyContent: 'center', alignItems: 'center' },
  actionPrimary: { backgroundColor: '#173E4A', borderColor: '#173E4A' },
  balanceSection: { paddingTop: 7, borderTopWidth: 1, borderTopColor: '#ECE9E2', gap: 2 },
});

const textStyles = StyleSheet.create<Record<string, TextStyle>>({
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: '#55706F' },
  overviewTitle: { fontSize: 27, lineHeight: 32, fontWeight: '700', color: '#162E36' },
  sectionTitle: { fontSize: 21, lineHeight: 26, fontWeight: '700', color: '#172F36' },
  cardTitle: { flexShrink: 1, fontSize: 17, lineHeight: 22, fontWeight: '700', color: '#172F36' },
  body: { fontSize: 15, lineHeight: 21, color: '#35484C' },
  primaryMessage: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: '#244A57' },
  meta: { fontSize: 13, lineHeight: 18, color: '#5C6A6C' },
  state: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#48656A' },
  nextStep: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#365A62' },
  balanceLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: '#3D575C' },
  action: { fontSize: 14, fontWeight: '600', color: '#244A57' },
  actionPrimary: { color: '#FFFFFF' },
});
