import type { StructuralExposureDecision, StructuralExposureRegionSummary } from '@circuit/domain';

const LABELS: Record<StructuralExposureRegionSummary['region'], string> = {
  cervical_spine: 'neck', thoracic_spine: 'upper back', lumbar_spine: 'lower back', shoulder_complex: 'shoulders',
  elbow: 'elbows', wrist_hand: 'wrists and hands', hip: 'hips', knee: 'knees', achilles_calf: 'calves and Achilles', foot_plantar: 'feet',
};

export function structuralExposureDecisionText(decision: StructuralExposureDecision): {
  title: string;
  body: string;
  detail: string[];
} {
  const labels = decision.constrainedRegions.map((region) => LABELS[region]);
  if (decision.action === 'restrict_region') return {
    title: 'Today’s workout protects a symptomatic area',
    body: `Exercises that substantially load ${labels.join(', ')} were removed. Unrelated, tolerable training can remain.`,
    detail: decision.explanations,
  };
  if (decision.action === 'modify') return {
    title: 'Today’s load was redistributed',
    body: `${labels.join(', ')} accumulated more load than your recent pattern, so the session was shortened and high-demand exercises were replaced.`,
    detail: decision.explanations,
  };
  if (decision.action === 'hold_progression') return {
    title: 'Current load is being consolidated',
    body: 'The session remains available, but no additional structural load is added today.',
    detail: decision.explanations,
  };
  return { title: 'Structural load is within your recent pattern', body: 'No automatic regional modification is needed.', detail: decision.explanations };
}
