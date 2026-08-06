import React from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type {
  SideQuestPrimaryTab,
  SideQuestShellModel,
  V29PlanAction,
  V29PlanVisibleScreenModel,
  V29ProgressAction,
  V29ProgressVisibleScreenModel,
  V29TodayAction,
  V29TodayVisibleScreenModel,
  V29TrainAction,
  V29TrainVisibleScreenModel,
  V29YouAction,
  V29YouVisibleScreenModel,
} from '@circuit/domain';
import { TodayWorkspaceScreen } from './TodayWorkspaceScreen';
import { TrainWorkspaceScreen } from './TrainWorkspaceScreen';
import { PlanWorkspaceScreen } from './PlanWorkspaceScreen';
import { ProgressWorkspaceScreen } from './ProgressWorkspaceScreen';
import { YouWorkspaceScreen } from './YouWorkspaceScreen';

export interface SideQuestWorkspaceModels {
  today: V29TodayVisibleScreenModel;
  train: V29TrainVisibleScreenModel;
  plan: V29PlanVisibleScreenModel;
  progress: V29ProgressVisibleScreenModel;
  you: V29YouVisibleScreenModel;
}

export interface SideQuestWorkspaceHandlers {
  today: (action: V29TodayAction) => void;
  train: (action: V29TrainAction) => void;
  plan?: (action: V29PlanAction) => void;
  progress?: (action: V29ProgressAction) => void;
  you?: (action: V29YouAction) => void;
}

export interface SideQuestWorkspaceShellProps {
  shell: SideQuestShellModel;
  models: SideQuestWorkspaceModels;
  handlers: SideQuestWorkspaceHandlers;
  onTabChange: (tab: SideQuestPrimaryTab) => void;
  onHeaderAction?: (action: SideQuestShellModel['masthead']['action']) => void;
  onResumeWorkout?: (workoutId: string) => void;
}

function Workspace({ shell, models, handlers }: Pick<SideQuestWorkspaceShellProps, 'shell' | 'models' | 'handlers'>) {
  switch (shell.activeTab) {
    case 'today':
      return <TodayWorkspaceScreen model={models.today} onAction={handlers.today} />;
    case 'train':
      return <TrainWorkspaceScreen model={models.train} onAction={handlers.train} />;
    case 'plan':
      return <PlanWorkspaceScreen model={models.plan} onAction={handlers.plan} />;
    case 'progress':
      return <ProgressWorkspaceScreen model={models.progress} onAction={handlers.progress} />;
    case 'you':
      return <YouWorkspaceScreen model={models.you} onAction={handlers.you} />;
  }
}

export function SideQuestWorkspaceShell({
  shell,
  models,
  handlers,
  onTabChange,
  onHeaderAction,
  onResumeWorkout,
}: SideQuestWorkspaceShellProps) {
  const showHeaderAction = shell.masthead.action !== 'none';

  return (
    <SafeAreaView style={viewStyles.safeArea}>
      <View style={viewStyles.shell}>
        <View accessibilityRole="header" style={viewStyles.masthead}>
          <View style={viewStyles.mastheadCopy}>
            <Text style={textStyles.wordmark}>{shell.masthead.wordmark}</Text>
            <Text style={textStyles.pageLabel}>{shell.masthead.pageLabel}</Text>
            {shell.masthead.contextLabel ? (
              <Text numberOfLines={1} style={textStyles.contextLabel}>{shell.masthead.contextLabel}</Text>
            ) : null}
          </View>
          {showHeaderAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${shell.masthead.action} action`}
              onPress={() => onHeaderAction?.(shell.masthead.action)}
              style={viewStyles.headerAction}
            >
              <Text style={textStyles.headerActionLabel}>{shell.masthead.action}</Text>
              {shell.masthead.attentionCount ? (
                <View style={viewStyles.badge}><Text style={textStyles.badge}>{shell.masthead.attentionCount}</Text></View>
              ) : null}
            </Pressable>
          ) : null}
        </View>

        <View accessibilityLabel="Page content" style={viewStyles.workspace}>
          <Workspace shell={shell} models={models} handlers={handlers} />
        </View>

        {shell.activeWorkout ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Resume ${shell.activeWorkout.workoutName}, ${shell.activeWorkout.progressLabel}`}
            onPress={() => onResumeWorkout?.(shell.activeWorkout?.workoutId ?? '')}
            style={viewStyles.activeWorkout}
          >
            <View style={viewStyles.activeWorkoutCopy}>
              <Text numberOfLines={1} style={textStyles.activeWorkoutName}>{shell.activeWorkout.workoutName}</Text>
              <Text style={textStyles.activeWorkoutProgress}>{shell.activeWorkout.progressLabel}</Text>
            </View>
            <Text style={textStyles.resume}>{shell.activeWorkout.resumeLabel}</Text>
          </Pressable>
        ) : null}

        {!shell.hideBottomNavigation ? (
          <View accessibilityRole="tablist" style={viewStyles.navigation}>
            {shell.navigation.map((item) => {
              const selected = item.tab === shell.activeTab;
              return (
                <Pressable
                  key={item.tab}
                  accessibilityRole="tab"
                  accessibilityLabel={item.accessibilityLabel}
                  accessibilityState={{ selected }}
                  onPress={() => onTabChange(item.tab)}
                  style={[viewStyles.navigationItem, selected ? viewStyles.navigationItemSelected : undefined]}
                >
                  <View style={[viewStyles.navigationMarker, selected ? viewStyles.navigationMarkerSelected : undefined]} />
                  <Text style={[textStyles.navigationLabel, selected ? textStyles.navigationLabelSelected : undefined]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

type ViewStyleName =
  | 'safeArea' | 'shell' | 'masthead' | 'mastheadCopy' | 'headerAction' | 'badge'
  | 'workspace' | 'activeWorkout' | 'activeWorkoutCopy' | 'navigation' | 'navigationItem'
  | 'navigationItemSelected' | 'navigationMarker' | 'navigationMarkerSelected';

type TextStyleName =
  | 'wordmark' | 'pageLabel' | 'contextLabel' | 'headerActionLabel' | 'badge'
  | 'activeWorkoutName' | 'activeWorkoutProgress' | 'resume' | 'navigationLabel'
  | 'navigationLabelSelected';

const viewStyles = StyleSheet.create<Record<ViewStyleName, ViewStyle>>({
  safeArea: { flex: 1, backgroundColor: '#F4F2ED' },
  shell: { flex: 1, backgroundColor: '#F4F2ED' },
  masthead: { minHeight: 60, paddingHorizontal: 18, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8D3C9', backgroundColor: '#FFFFFF' },
  mastheadCopy: { flex: 1, minWidth: 0 },
  headerAction: { minWidth: 44, minHeight: 44, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: 2, top: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15233B' },
  workspace: { flex: 1 },
  activeWorkout: { minHeight: 64, marginHorizontal: 12, marginBottom: 8, borderRadius: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#15233B' },
  activeWorkoutCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  navigation: { minHeight: 76, paddingHorizontal: 8, paddingTop: 7, paddingBottom: 8, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#D8D3C9', backgroundColor: '#FFFFFF' },
  navigationItem: { flex: 1, minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5 },
  navigationItemSelected: { backgroundColor: '#EEEAE2' },
  navigationMarker: { width: 18, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  navigationMarkerSelected: { backgroundColor: '#15233B' },
});

const textStyles = StyleSheet.create<Record<TextStyleName, TextStyle>>({
  wordmark: { fontSize: 19, lineHeight: 22, fontWeight: '700', color: '#15233B' },
  pageLabel: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: '#4E596B' },
  contextLabel: { fontSize: 12, lineHeight: 15, color: '#6D746F' },
  headerActionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize', color: '#15233B' },
  badge: { fontSize: 10, lineHeight: 12, fontWeight: '700', color: '#FFFFFF' },
  activeWorkoutName: { fontSize: 16, lineHeight: 20, fontWeight: '700', color: '#FFFFFF' },
  activeWorkoutProgress: { fontSize: 13, lineHeight: 17, color: '#D9DFE8' },
  resume: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  navigationLabel: { fontSize: 12, lineHeight: 15, fontWeight: '600', color: '#6A7180' },
  navigationLabelSelected: { color: '#15233B' },
});
