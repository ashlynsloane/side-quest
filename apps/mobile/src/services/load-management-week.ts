import type { LoadManagementWeekDecision } from '@circuit/domain';

export interface LoadManagementWeekCopy {
  eyebrow: string;
  title: string;
  summary: string;
  details: string[];
}

export function loadManagementWeekCopy(decision: LoadManagementWeekDecision): LoadManagementWeekCopy {
  if (decision.kind === 'restriction') {
    return {
      eyebrow: 'PROTECT THIS WEEK',
      title: 'Use a restricted training week',
      summary: 'Pain or workout carryover means the plan should protect the affected region rather than simply push through.',
      details: decision.explanations,
    };
  }
  if (decision.kind === 'deload') {
    return {
      eyebrow: 'RECOVERY WEEK',
      title: 'Deload without losing the week',
      summary: 'Key sessions stay protected while supporting volume, mechanical demand, and novelty come down.',
      details: decision.explanations,
    };
  }
  if (decision.kind === 'consolidation') {
    return {
      eyebrow: 'CONSOLIDATE',
      title: 'Hold progression this week',
      summary: 'Keep training, but let the recent dose settle before adding another progression variable.',
      details: decision.explanations,
    };
  }
  return {
    eyebrow: 'LOAD CHECK',
    title: 'Continue the planned week',
    summary: 'Recent response does not require an automatic deload or consolidation week.',
    details: decision.explanations,
  };
}
