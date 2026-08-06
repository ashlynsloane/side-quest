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
import type { V29TrainAction, V29TrainVisibleScreenModel, V29TrainWorkoutVisibleCard } from '@circuit/domain';

export interface TrainWorkspaceScreenProps {
  model: V29TrainVisibleScreenModel;
  onAction: (action: V29TrainAction) => void;
}

type ViewStyleName =
  | 'content' | 'activeCard' | 'builderCard' | 'card' | 'presetRow' | 'presetCard'
  | 'section' | 'actionRow' | 'action' | 'primaryAction' | 'preferenceGrid'
  | 'preferenceCell' | 'workoutList' | 'workoutCard' | 'togetherCard' | 'disabledCard';

type TextStyleName =
  | 'screenTitle' | 'screenSubtitle' | 'eyebrow' | 'activeTitle' | 'cardTitle'
  | 'sectionTitle' | 'body' | 'meta' | 'reason' | 'actionText' | 'primaryActionText'
  | 'preferenceLabel' | 'preferenceValue' | 'unavailable';

const viewStyles = StyleSheet.create<Record<ViewStyleName, ViewStyle>>({
  content: { paddingHorizontal: 18, paddingTop: 12, gap: 16 },
  activeCard: { borderRadius: 24, padding: 20, gap: 9, backgroundColor: '#15233B' },
  builderCard: { borderRadius: 24, borderWidth: 1, padding: 20, gap: 12, backgroundColor: '#FFFFFF' },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 8, backgroundColor: '#FFFFFF' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  presetCard: { width: '48%', minHeight: 144 },
  section: { gap: 9 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  action: { minHeight: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  primaryAction: { backgroundColor: '#15233B', borderColor: '#15233B' },
  preferenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preferenceCell: { minWidth: '47%', flexGrow: 1, borderRadius: 14, padding: 12, backgroundColor: '#F4F2ED' },
  workoutList: { gap: 10 },
  workoutCard: { minHeight: 154 },
  togetherCard: { backgroundColor: '#F4F2ED' },
  disabledCard: { opacity: 0.72 },
});

const textStyles = StyleSheet.create<Record<TextStyleName, TextStyle>>({
  screenTitle: { fontSize: 28, lineHeight: 33, fontWeight: '700' },
  screenSubtitle: { fontSize: 16, lineHeight: 22, opacity: 0.7 },
  eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, opacity: 0.64 },
  activeTitle: { fontSize: 25, lineHeight: 30, fontWeight: '700', color: '#FFFFFF' },
  cardTitle: { fontSize: 19, lineHeight: 24, fontWeight: '700' },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, opacity: 0.8 },
  meta: { fontSize: 14, lineHeight: 20, opacity: 0.67 },
  reason: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  actionText: { fontSize: 15, fontWeight: '600' },
  primaryActionText: { color: '#FFFFFF' },
  preferenceLabel: { fontSize: 12, fontWeight: '600', opacity: 0.58, textTransform: 'uppercase' },
  preferenceValue: { fontSize: 15, fontWeight: '600', marginTop: 3 },
  unavailable: { fontSize: 13, lineHeight: 18, opacity: 0.72 },
});

function ActionRow({ actions, onAction, dark = false }: { actions: V29TrainAction[]; onAction: (action: V29TrainAction) => void; dark?: boolean }) {
  return (
    <View style={viewStyles.actionRow}>
      {actions.map((action) => (
        <Pressable
          key={action.actionId}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          onPress={() => onAction(action)}
          style={[viewStyles.action, action.primary ? viewStyles.primaryAction : undefined]}
        >
          <Text style={[textStyles.actionText, action.primary || dark ? textStyles.primaryActionText : undefined]}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function WorkoutCard({ workout, onAction }: { workout: V29TrainWorkoutVisibleCard; onAction: (action: V29TrainAction) => void }) {
  return (
    <View style={[viewStyles.card, viewStyles.workoutCard, workout.unavailableMessage ? viewStyles.disabledCard : undefined]}>
      <Text style={textStyles.eyebrow}>{workout.eyebrow}</Text>
      <Text style={textStyles.cardTitle}>{workout.title}</Text>
      <Text style={textStyles.meta}>{workout.metaLine}</Text>
      {workout.emphasisLabel ? <Text style={textStyles.meta}>{workout.emphasisLabel}</Text> : null}
      {workout.reason ? <Text style={textStyles.reason}>{workout.reason}</Text> : null}
      {workout.unavailableMessage ? <Text style={textStyles.unavailable}>{workout.unavailableMessage}</Text> : null}
      <ActionRow actions={workout.actions} onAction={onAction} />
    </View>
  );
}

export function TrainWorkspaceScreen({ model, onAction }: TrainWorkspaceScreenProps) {
  return (
    <ScrollView contentContainerStyle={[viewStyles.content, { paddingBottom: model.bottomInsetForNavigation }]} showsVerticalScrollIndicator={false}>
      <View accessibilityRole="header">
        <Text style={textStyles.screenTitle}>Train</Text>
        <Text style={textStyles.screenSubtitle}>Choose what fits your body, time, and equipment right now.</Text>
      </View>

      {model.activeWorkout ? (
        <View style={viewStyles.activeCard}>
          <Text style={[textStyles.eyebrow, textStyles.primaryActionText]}>{model.activeWorkout.eyebrow}</Text>
          <Text style={textStyles.activeTitle}>{model.activeWorkout.title}</Text>
          <Text style={[textStyles.body, textStyles.primaryActionText]}>{model.activeWorkout.progressLabel} · {model.activeWorkout.stationLabel}</Text>
          <ActionRow actions={model.activeWorkout.actions} onAction={onAction} dark />
        </View>
      ) : null}

      <View style={viewStyles.builderCard}>
        <Text style={textStyles.eyebrow}>Workout builder</Text>
        <Text style={textStyles.cardTitle}>{model.builder.title}</Text>
        <Text style={textStyles.body}>{model.builder.summary}</Text>
        <View style={viewStyles.preferenceGrid}>
          {[
            ['Time', model.builder.durationLabel],
            ['Focus', model.builder.focusLabel],
            ['Equipment', model.builder.equipmentLabel],
            ['Intensity', model.builder.intensityLabel],
            ['Location', model.builder.locationLabel],
          ].map(([label, value]) => (
            <View key={label} style={viewStyles.preferenceCell}>
              <Text style={textStyles.preferenceLabel}>{label}</Text>
              <Text style={textStyles.preferenceValue}>{value}</Text>
            </View>
          ))}
        </View>
        {model.builder.restrictionLabel ? <Text style={textStyles.meta}>Working around: {model.builder.restrictionLabel}</Text> : null}
        <ActionRow actions={model.builder.actions} onAction={onAction} />
      </View>

      {model.presets.length > 0 ? (
        <View style={viewStyles.section}>
          <Text style={textStyles.sectionTitle}>Quick starts</Text>
          <View style={viewStyles.presetRow}>
            {model.presets.map((preset) => (
              <View key={preset.id} style={[viewStyles.card, viewStyles.presetCard]}>
                <Text style={textStyles.cardTitle}>{preset.title}</Text>
                <Text style={textStyles.meta}>{preset.description}</Text>
                <ActionRow actions={[preset.action]} onAction={onAction} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {model.recommended.length > 0 ? (
        <View style={viewStyles.section}>
          <Text style={textStyles.sectionTitle}>Recommended for you</Text>
          <View style={viewStyles.workoutList}>{model.recommended.map((workout) => <WorkoutCard key={workout.workoutId} workout={workout} onAction={onAction} />)}</View>
        </View>
      ) : null}

      {model.savedAndRecent.length > 0 ? (
        <View style={viewStyles.section}>
          <Text style={textStyles.sectionTitle}>Saved and recent</Text>
          <View style={viewStyles.workoutList}>{model.savedAndRecent.map((workout) => <WorkoutCard key={workout.workoutId} workout={workout} onAction={onAction} />)}</View>
        </View>
      ) : null}

      {model.workoutTogether ? (
        <View style={[viewStyles.card, viewStyles.togetherCard]}>
          <Text style={textStyles.eyebrow}>Workout Together</Text>
          <Text style={textStyles.cardTitle}>{model.workoutTogether.title}</Text>
          <Text style={textStyles.body}>{model.workoutTogether.detail}</Text>
          <ActionRow actions={[model.workoutTogether.action]} onAction={onAction} />
        </View>
      ) : null}
    </ScrollView>
  );
}
