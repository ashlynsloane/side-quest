import type {
  CoachLanguageInterpreter,
  CoachLanguageInterpreterInput,
} from '@circuit/planner/coach-language-interpreter';

import { cloudAuthConfigured, supabase } from './supabase';

export const remoteCoachLanguageConfigured = cloudAuthConfigured
  && process.env.EXPO_PUBLIC_COACH_LANGUAGE_ENABLED?.trim().toLowerCase() === 'true';

export const remoteCoachLanguageInterpreter: CoachLanguageInterpreter = {
  id: 'supabase-coach-language-v1',
  async interpret(input: CoachLanguageInterpreterInput): Promise<unknown> {
    if (!remoteCoachLanguageConfigured || !supabase) {
      throw new Error('Remote Coach language interpretation is not enabled.');
    }

    const { data, error } = await supabase.functions.invoke('coach-language-interpret', {
      body: {
        message: input.message,
        referenceDate: input.referenceDate,
        knownPlannedEvents: input.knownPlannedEvents ?? [],
        dialogueSummary: input.dialogueSummary,
      },
    });

    if (error) throw new Error(`Remote Coach language interpretation failed: ${error.message}`);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Remote Coach language interpretation returned an invalid response.');
    }
    const frame = (data as Record<string, unknown>).frame;
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      throw new Error('Remote Coach language interpretation returned no semantic frame.');
    }
    return frame;
  },
};
