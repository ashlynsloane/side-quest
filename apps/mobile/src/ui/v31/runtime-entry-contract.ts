import type { SideQuestCanonicalWorkspaceModels } from '../v29/SideQuestWorkspaceRoot';
import type { SideQuestRuntimeCommands } from '../../services/runtime-orchestrator';
import type { SideQuestRuntimeSessionStorage } from '../../services/runtime-session-store';
import type { SideQuestActiveWorkoutBar } from '@circuit/domain';

export interface SideQuestRuntimeEntryState {
  canonical: SideQuestCanonicalWorkspaceModels;
  commands?: SideQuestRuntimeCommands;
  sessionStorage?: SideQuestRuntimeSessionStorage;
  activeWorkout?: Omit<SideQuestActiveWorkoutBar, 'resumeLabel' | 'visibleAcrossTabs'>;
  contextLabel?: string;
  phaseContext?: string;
  unresolvedAttentionCount?: number;
  workoutPlayerOpen?: boolean;
}

export interface SideQuestRuntimeEntrySource {
  getSnapshot: () => SideQuestRuntimeEntryState;
  subscribe?: (listener: () => void) => () => void;
}
