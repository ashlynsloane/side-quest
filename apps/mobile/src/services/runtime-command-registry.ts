import type { SideQuestRuntimeCommands } from './runtime-orchestrator';

export interface SideQuestWorkoutRuntimeServices {
  startWorkout?: (workoutId?: string) => void | Promise<void>;
  resumeWorkout?: (workoutId: string) => void | Promise<void>;
  applyAdjustment?: (adjustmentId?: string) => void | Promise<void>;
  keepOriginalPlan?: (adjustmentId?: string) => void | Promise<void>;
  takeRecoveryDay?: (decisionId?: string) => void | Promise<void>;
}

export interface SideQuestRuntimeCommandDiagnostics {
  onUnsupported?: (command: string, id?: string) => void;
  onFailure?: (command: string, error: unknown, id?: string) => void;
}

export function createRuntimeCommandsFromServices(
  services: SideQuestWorkoutRuntimeServices,
  diagnostics: SideQuestRuntimeCommandDiagnostics = {},
): SideQuestRuntimeCommands {
  const runOptionalId = async (
    command: string,
    handler: ((id?: string) => void | Promise<void>) | undefined,
    id?: string,
  ) => {
    if (!handler) {
      diagnostics.onUnsupported?.(command, id);
      return;
    }
    try {
      await handler(id);
    } catch (error) {
      diagnostics.onFailure?.(command, error, id);
      throw error;
    }
  };

  const runRequiredId = async (
    command: string,
    handler: ((id: string) => void | Promise<void>) | undefined,
    id: string,
  ) => {
    if (!handler) {
      diagnostics.onUnsupported?.(command, id);
      return;
    }
    try {
      await handler(id);
    } catch (error) {
      diagnostics.onFailure?.(command, error, id);
      throw error;
    }
  };

  return {
    startWorkout: id => runOptionalId('start_workout', services.startWorkout, id),
    resumeWorkout: id => runRequiredId('resume_workout', services.resumeWorkout, id),
    applyAdjustment: id => runOptionalId('apply_adjustment', services.applyAdjustment, id),
    keepOriginal: id => runOptionalId('keep_original', services.keepOriginalPlan, id),
    takeRecoveryDay: id => runOptionalId('recovery_day', services.takeRecoveryDay, id),
  };
}
