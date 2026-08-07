import Storage from 'expo-sqlite/kv-store';

import { ACTIVE_WORKOUT_INDEX_KEY } from './active-workout-persistence';
import { clearPainContextMemory } from './athlete-context-memory';
import { clearCoachClosedLoopState, exportCoachClosedLoopState } from './coach-closed-loop-state';
import { clearCoachConversationState } from './coach-conversation-state';
import { clearCoachObservedOutcomes, exportCoachObservedOutcomes } from './coach-observed-outcomes';
import { clearAllSideQuestPlanSessionOverrides } from './side-quest-plan-overrides';
import { clearWholeAthleteHealthPreferences } from './whole-athlete-plan-runtime';

const COACH_CONVERSATION_KEY = 'circuit.coach-conversation.v1';
const PAIN_MEMORY_KEY = 'circuit.athlete-pain-context.v1';
const PLAN_OVERRIDES_KEY = 'circuit.side-quest-plan-overrides.v1';
const HEALTH_PREFERENCES_KEY = 'circuit.whole-athlete-health.v1';
const LIVE_WORKOUT_KEY = 'sidequest.live-workout.session.v1';

export function exportLocalTrainingKeyValueData(): Record<string, unknown> {
  const activeWorkoutStorageKey = Storage.getItemSync(ACTIVE_WORKOUT_INDEX_KEY);
  return {
    coachConversation: parseStored(COACH_CONVERSATION_KEY),
    coachClosedLoop: exportCoachClosedLoopState(),
    coachObservedOutcomes: exportCoachObservedOutcomes(),
    structuredPainContext: parseStored(PAIN_MEMORY_KEY),
    generatedPlanOverrides: parseStored(PLAN_OVERRIDES_KEY),
    wholeAthleteHealthPreferences: parseStored(HEALTH_PREFERENCES_KEY),
    liveWorkoutSession: parseStored(LIVE_WORKOUT_KEY),
    activeWorkoutCheckpoint: activeWorkoutStorageKey ? parseStored(activeWorkoutStorageKey) : null,
  };
}

export function clearLocalTrainingKeyValueData(): void {
  const activeWorkoutStorageKey = Storage.getItemSync(ACTIVE_WORKOUT_INDEX_KEY);
  if (activeWorkoutStorageKey) Storage.removeItemSync(activeWorkoutStorageKey);
  Storage.removeItemSync(ACTIVE_WORKOUT_INDEX_KEY);
  Storage.removeItemSync(LIVE_WORKOUT_KEY);
  clearCoachConversationState();
  clearCoachClosedLoopState();
  clearCoachObservedOutcomes();
  clearPainContextMemory();
  clearAllSideQuestPlanSessionOverrides();
  clearWholeAthleteHealthPreferences();
}

function parseStored(key: string): unknown {
  const value = Storage.getItemSync(key);
  if (!value) return null;
  try { return JSON.parse(value) as unknown; } catch { return value; }
}
