import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import type { V29YouAction, V29YouVisibleScreenModel } from '@circuit/domain';

type Props = { model: V29YouVisibleScreenModel; onAction?: (action: V29YouAction) => void };

function ActionRow({ actions, onAction }: { actions: V29YouAction[]; onAction?: Props['onAction'] }) {
  if (actions.length === 0) return null;
  return <View style={viewStyles.actionRow}>{actions.map(item => (
    <Pressable key={item.actionId} accessibilityRole="button" accessibilityLabel={item.accessibilityLabel} onPress={() => onAction?.(item)} style={[viewStyles.action, item.primary ? viewStyles.primaryAction : undefined]}>
      <Text style={[textStyles.actionLabel, item.primary ? textStyles.primaryActionLabel : undefined]}>{item.label}</Text>
    </Pressable>
  ))}</View>;
}

export function YouWorkspaceScreen({ model, onAction }: Props) {
  return <ScrollView contentContainerStyle={[viewStyles.screen, { paddingBottom: model.bottomInsetForNavigation }]}>
    <Text style={textStyles.eyebrow}>YOU</Text>
    <Text style={textStyles.pageTitle}>Your athlete profile</Text>
    <Text style={textStyles.pageIntro}>Keep Side Quest aligned with your goals, current context, connected services, and privacy choices.</Text>

    <View style={viewStyles.heroCard}>
      {model.profile.displayName ? <Text style={textStyles.heroName}>{model.profile.displayName}</Text> : null}
      <Text style={textStyles.heroGoal}>{model.profile.primaryGoalLabel}</Text>
      {model.profile.nextEventLabel ? <Text style={textStyles.body}>{model.profile.nextEventLabel}</Text> : null}
      <View style={viewStyles.summaryGrid}>
        <Text style={textStyles.summaryLine}>{model.profile.phaseLabel}</Text>
        <Text style={textStyles.summaryLine}>{model.profile.weeklyAvailabilityLabel}</Text>
        <Text style={textStyles.summaryLine}>{model.profile.strengthFrequencyLabel}</Text>
        <Text style={textStyles.summaryLine}>{model.profile.equipmentProfileLabel}</Text>
      </View>
      <ActionRow actions={model.profile.actions} onAction={onAction} />
    </View>

    <Text style={textStyles.sectionTitle}>Current context</Text>
    {model.currentContext.map(item => <View key={item.contextId} style={[viewStyles.card, item.needsAttention ? viewStyles.attentionCard : undefined]}>
      <View style={viewStyles.rowBetween}><Text style={textStyles.cardTitle}>{item.label}</Text><Text style={textStyles.value}>{item.value}</Text></View>
      {item.detail ? <Text style={textStyles.body}>{item.detail}</Text> : null}
      <ActionRow actions={item.actions} onAction={onAction} />
    </View>)}

    <Text style={textStyles.sectionTitle}>Connections</Text>
    {model.connections.map(item => <View key={item.connectionId} style={[viewStyles.card, item.attention ? viewStyles.attentionCard : undefined]}>
      <View style={viewStyles.rowBetween}><Text style={textStyles.cardTitle}>{item.providerLabel}</Text><Text style={textStyles.status}>{item.stateLabel}</Text></View>
      {item.detail ? <Text style={textStyles.body}>{item.detail}</Text> : null}
      {item.lastSyncLabel ? <Text style={textStyles.caption}>{item.lastSyncLabel}</Text> : null}
      <ActionRow actions={item.actions} onAction={onAction} />
    </View>)}

    <Text style={textStyles.sectionTitle}>Coach access</Text>
    <View style={viewStyles.card}>
      <Text style={textStyles.status}>{model.coachAccess.stateLabel}</Text>
      {model.coachAccess.coachLabel ? <Text style={textStyles.cardTitle}>{model.coachAccess.coachLabel}</Text> : null}
      <Text style={textStyles.body}>{model.coachAccess.detail}</Text>
      <ActionRow actions={model.coachAccess.actions} onAction={onAction} />
    </View>

    <Text style={textStyles.sectionTitle}>Friends and sharing</Text>
    <View style={viewStyles.card}>
      <Text style={textStyles.cardTitle}>{model.social.friendCountLabel}</Text>
      {model.social.invitationLabel ? <Text style={textStyles.status}>{model.social.invitationLabel}</Text> : null}
      <Text style={textStyles.body}>Default: {model.social.sharingDefaultLabel}</Text>
      <Text style={textStyles.body}>Privacy: {model.social.privacyLabel}</Text>
      <ActionRow actions={model.social.actions} onAction={onAction} />
    </View>

    <Text style={textStyles.sectionTitle}>App controls</Text>
    {model.appControls.map(item => <View key={item.settingId} style={[viewStyles.card, item.attention ? viewStyles.attentionCard : undefined]}>
      <View style={viewStyles.rowBetween}><Text style={textStyles.cardTitle}>{item.label}</Text>{item.valueLabel ? <Text style={textStyles.value}>{item.valueLabel}</Text> : null}</View>
      {item.detail ? <Text style={textStyles.body}>{item.detail}</Text> : null}
      <ActionRow actions={item.actions} onAction={onAction} />
    </View>)}
  </ScrollView>;
}

const viewStyles = StyleSheet.create<Record<string, ViewStyle>>({
  screen: { paddingHorizontal: 20, paddingTop: 18, gap: 12 },
  heroCard: { borderRadius: 24, padding: 20, borderWidth: 1, gap: 8 },
  card: { borderRadius: 18, padding: 16, borderWidth: 1, gap: 7 },
  attentionCard: { borderWidth: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  summaryGrid: { gap: 4, marginTop: 4 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  action: { minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  primaryAction: { borderWidth: 2 },
});

const textStyles = StyleSheet.create<Record<string, TextStyle>>({
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  pageTitle: { fontSize: 30, lineHeight: 35, fontWeight: '700' },
  pageIntro: { fontSize: 16, lineHeight: 23 },
  heroName: { fontSize: 15, fontWeight: '600' },
  heroGoal: { fontSize: 24, lineHeight: 29, fontWeight: '700' },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: '700', marginTop: 10 },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 13, lineHeight: 18 },
  status: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  value: { fontSize: 14, lineHeight: 19, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  summaryLine: { fontSize: 14, lineHeight: 20 },
  actionLabel: { fontSize: 14, fontWeight: '600' },
  primaryActionLabel: { fontWeight: '700' },
});
