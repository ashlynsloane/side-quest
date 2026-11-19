import type {
  StrengthApprovalGateId,
  StrengthApprovalPreflight,
} from './strength-approval-preflight';
import type {
  StrengthEvidenceProvenanceLedger,
} from './strength-evidence-provenance-sqlite';

/**
 * Read-only reconciliation guidance. This does not create clinical attestations,
 * request provider access, edit workouts, or approve exercise.
 */
export type StrengthReconciliationTaskKind =
  | 'safety_hold' | 'evidence_gap' | 'feature_unavailable';

export interface StrengthReconciliationTask {
  id: StrengthApprovalGateId;
  title: string;
  kind: StrengthReconciliationTaskKind;
  why: string;
  nextStep: string;
  canResolveAutomatically: false;
}

export interface StrengthReconciliationChecklist {
  schemaVersion: 1;
  tasks: StrengthReconciliationTask[];
  unresolvedCount: number;
  clinicalSourceVerificationRequired: boolean;
  executableWorkoutApproved: false;
  canConfirmExecutableWorkout: false;
}

const REQUIRED_GATES: StrengthApprovalGateId[] = [
  'source_identity', 'candidate_structure', 'movement_compatibility',
  'session_uncompleted',
  'no_conflicting_decision', 'review_disposition', 'symptom_check_in',
  'readiness_check_in', 'local_pt_profile', 'external_provider_restrictions',
  'source_provenance', 'athlete_execution_confirmation',
  'executable_write_authorization',
];

const NEXT_STEPS: Record<StrengthApprovalGateId, string> = {
  source_identity:
    'Create a new draft against the currently stored training plan. This historical proposal cannot be applied.',
  candidate_structure:
    'Recheck each proposed station, exercise target and resistance against the current source workout.',
  movement_compatibility:
    'Review each potentially conflicting exercise against active movement protections. A shorter workout and catalog tags are not clinical clearance.',
  session_uncompleted:
    'Reconcile the existing completion record before considering another session adjustment.',
  no_conflicting_decision:
    'Review the already accepted planning decision before creating a separate exercise proposal.',
  review_disposition:
    'If needed, return this unapproved draft to the review inbox; this does not clear its safety holds.',
  symptom_check_in:
    'Complete a current symptom check-in and evaluate any new pain, swelling, weakness or other warning signs.',
  readiness_check_in:
    'Record today\'s recovery and readiness in the app. Poor readiness still prohibits progression.',
  local_pt_profile:
    'Review active physical-therapy restrictions and preserve any currently protected movements.',
  external_provider_restrictions:
    'Obtain and reconcile applicable restrictions from an authenticated clinician source. A reported absence of restrictions is not proof.',
  source_provenance:
    'Reconcile training, injury and recovery history against authoritative activity and treatment sources.',
  athlete_execution_confirmation:
    'Executable-workout confirmation is not available in this development build. No consent has been collected.',
  executable_write_authorization:
    'A trusted clinical evidence check and atomic executable-workout authorization have not been implemented.',
};

function providerStep(provenance: StrengthEvidenceProvenanceLedger): string {
  switch (provenance.restriction.status) {
    case 'conflicting':
      return 'Resolve contradictory restriction reports using an authenticated clinician source. Do not treat the latest self-report as clearance.';
    case 'reported_restriction':
      return 'A possible active restriction is on record. Obtain current clinician guidance for affected movements before progressing.';
    case 'expired':
      return 'The recorded restriction information is stale. Obtain current clinician restrictions and review applicability.';
    default:
      return NEXT_STEPS.external_provider_restrictions;
  }
}

function coverageStep(provenance: StrengthEvidenceProvenanceLedger): string {
  switch (provenance.coverage.status) {
    case 'partial':
      return 'Reconcile missing workouts, symptom updates and treatment history. Do not infer absent activities were rest days.';
    case 'expired':
      return 'Refresh outdated training and injury sources before trusting recovery or load calculations.';
    case 'conflicting':
      return 'Resolve inconsistent training-source claims with authoritative history, not an unsupported completeness flag.';
    default:
      return NEXT_STEPS.source_provenance;
  }
}

/**
 * Validate the complete 13-gate diagnostic. Missing, repeated or forged
 * "locally passed" gates must not be hidden by an apparently short checklist.
 */
export function createStrengthReconciliationChecklist(
  preflight: StrengthApprovalPreflight,
  provenance: StrengthEvidenceProvenanceLedger,
): StrengthReconciliationChecklist {
  if (!preflight || preflight.schemaVersion !== 1
    || preflight.canConfirmExecutableWorkout !== false
    || preflight.executableWorkoutApproved !== false
    || typeof preflight.requiresIndependentProviderVerification !== 'boolean'
    || preflight.requiresWriteTimeRevalidation !== true
    || !provenance || provenance.independentlyVerified !== false
    || provenance.executableWorkoutApproved !== false
    || !Array.isArray(provenance.events)
    || !provenance.restriction || !provenance.coverage
    || provenance.restriction.independentlyVerified !== false
    || provenance.coverage.independentlyVerified !== false
    || !Array.isArray(preflight.gates)
    || preflight.gates.length !== REQUIRED_GATES.length) {
    throw new Error('Strength evidence reconciliation has an incomplete safety assessment.');
  }
  const ids = preflight.gates.map(gate => gate.id);
  if (new Set(ids).size !== REQUIRED_GATES.length
    || REQUIRED_GATES.some(id => !ids.includes(id))
    || preflight.blockingGateCount !== preflight.gates.filter(
      gate => gate.status !== 'local_check_passed'
        && gate.status !== 'not_applicable',
    ).length) {
    throw new Error('Strength evidence reconciliation gate integrity mismatch.');
  }
  if (preflight.gates.some(gate =>
    !['local_check_passed', 'blocked', 'unverified', 'not_implemented',
      'not_applicable'].includes(gate.status)
    || !gate.title?.trim() || !gate.detail?.trim())) {
    throw new Error('Strength evidence reconciliation has invalid gate metadata.');
  }
  const external = preflight.gates.find(g => g.id === 'external_provider_restrictions');
  const coverage = preflight.gates.find(g => g.id === 'source_provenance');
  const confirmation = preflight.gates.find(g => g.id === 'athlete_execution_confirmation');
  const approval = preflight.gates.find(g => g.id === 'executable_write_authorization');
  const ordinaryExemption = external?.status === 'not_applicable';
  if (external?.status === 'local_check_passed'
    || coverage?.status === 'local_check_passed'
    || (ordinaryExemption && (
      preflight.requiresIndependentProviderVerification
      || ['reported_restriction', 'conflicting', 'expired'].includes(
        provenance.restriction.status,
      )))
    || (!ordinaryExemption && !preflight.requiresIndependentProviderVerification)
    || confirmation?.status !== 'not_implemented'
    || approval?.status !== 'not_implemented') {
    throw new Error('Strength evidence reconciliation cannot accept a clearance assertion.');
  }
  const tasks: StrengthReconciliationTask[] = preflight.gates
    .filter(gate => gate.status !== 'local_check_passed'
      && gate.status !== 'not_applicable')
    .map(gate => ({
      id: gate.id,
      title: gate.title,
      kind: gate.status === 'not_implemented'
        ? 'feature_unavailable' as const
        : gate.status === 'blocked'
          ? 'safety_hold' as const : 'evidence_gap' as const,
      why: gate.detail,
      nextStep: gate.id === 'external_provider_restrictions'
        ? providerStep(provenance)
        : gate.id === 'source_provenance'
          ? coverageStep(provenance)
          : NEXT_STEPS[gate.id],
      canResolveAutomatically: false as const,
    }));
  // Show immediate safety holds before missing evidence, and missing
  // evidence before feature-development gates. Preserve source order within
  // each class so the list remains deterministic across app restarts.
  const priority: Record<StrengthReconciliationTaskKind, number> = {
    safety_hold: 0, evidence_gap: 1, feature_unavailable: 2,
  };
  tasks.sort((a, b) => priority[a.kind] - priority[b.kind]);
  return {
    schemaVersion: 1,
    tasks,
    unresolvedCount: tasks.length,
    clinicalSourceVerificationRequired:
      preflight.requiresIndependentProviderVerification,
    executableWorkoutApproved: false,
    canConfirmExecutableWorkout: false,
  };
}
