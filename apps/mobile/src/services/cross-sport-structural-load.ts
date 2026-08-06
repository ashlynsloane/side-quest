import type { CrossSportStructuralPlanDecision, StructuralRegion } from '@circuit/domain';

const LABELS: Record<StructuralRegion, string> = {
  cervical_spine: 'neck', thoracic_spine: 'upper back', lumbar_spine: 'lower back', shoulder_complex: 'shoulders', elbow: 'elbows',
  wrist_hand: 'wrists and hands', hip: 'hips', knee: 'knees', achilles_calf: 'calves and Achilles', foot_plantar: 'feet',
};

export function crossSportStructuralDecisionText(decision: CrossSportStructuralPlanDecision): { title: string; body: string; detail: string[] } {
  const regions = decision.constrainedRegions.map((region) => LABELS[region]);
  if (decision.action === 'protect_region') return { title: 'This plan protects a loaded area across sports', body: `${regions.join(', ')} will not receive another high structural dose from strength, swimming, cycling, or running.`, detail: decision.explanations };
  if (decision.action === 'separate_sessions') return { title: 'These sessions need more recovery time', body: 'The lower-priority session is moved rather than stacking two high structural demands close together.', detail: decision.explanations };
  if (decision.action === 'redistribute') return { title: 'Cross-sport load was redistributed', body: 'The plan reduces only the overlapping structural demand and preserves unrelated training.', detail: decision.explanations };
  return { title: 'Cross-sport load fits the current plan', body: 'No structural overlap requires an automatic schedule or exercise change.', detail: decision.explanations };
}
