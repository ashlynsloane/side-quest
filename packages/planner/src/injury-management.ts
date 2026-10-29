/**
 * Side Quest: condition-agnostic injury decision support.
 * Not diagnostic, not clearance, and not a therapeutic exercise prescription.
 */
export const INJURY_RULESET_VERSION = 'injury-management.v1.0.0' as const;
export type DiagnosisState = 'unknown'|'suspected'|'clinician_assessed'|'confirmed'|'revised';
export type InjuryPhase = 'awaiting_assessment'|'protected'|'gradual_loading'|'capacity_building'|'sport_reintegration'|'maintenance'|'reassess';
export type InjuryCaseStatus = 'under_assessment'|'active_rehab'|'monitoring'|'maintenance'|'inactive';
export type DangerSign = 'possible_head_or_neck_injury'|'chest_pain_or_breathing_difficulty'|'new_neurological_deficit'|'neurovascular_change'|'open_fracture_or_deformity'|'unable_to_bear_weight'|'sudden_major_weakness'|'rapid_swelling_or_bruising'|'fever_or_systemic_illness'|'other_concerning_change';
export interface InjuryCase {
  id:string; label:string; course:'acute'|'recurrent'|'persistent'|'postoperative'|'unresolved';
  diagnosisState:DiagnosisState; status:InjuryCaseStatus; affectedRegions:string[];
}
export interface InjuryEpisode {
  id:string; caseId:string; startedAt:string; phase:InjuryPhase; clinicianClearanceRequired:boolean;
}
export interface InjuryEvent {
  id:string; caseId?:string; occurredAt:string;
  kind:'onset'|'flare'|'trauma'|'new_symptom'|'diagnosis_revision'|'clinical_update';
  mechanism:'traumatic'|'gradual'|'sudden_nontraumatic'|'postoperative'|'uncertain';
  dangerSigns:DangerSign[]; functionLoss:'none'|'mild'|'significant'|'unknown'; initialSafetyScreenComplete:boolean;
}
export type RestrictionScope =
  | {kind:'all_training'}
  | {kind:'region';value:string}
  | {kind:'stress_tag';value:string}
  | {kind:'exercise';value:string};
export interface ClinicalConstraint {
  id:string; caseId?:string; status:'active'|'revoked'|'superseded';
  source:'clinician'|'athlete'|'protocol'; effect:'prohibit'|'clearance_required'|'cap'|'monitor';
  scope:RestrictionScope; issuedAt:string; reviewBy?:string; expiresAt?:string;
}
export interface InjuryObservation {
  caseId:string; observedAt:string; pain:number|null; previousPain?:number|null;
  /** Saved stable ID so exported data can point back to the original check-in. */
  recordId?:string;
  /** The particular task or context in which pain was rated. */
  painContextKey?:'rest'|'walking'|'daily_movement'|'specific_activity';
  /** Optional, not imputed when absent. */
  morningStiffnessMinutes?:number|null;
  response24h:'better'|'stable'|'worse'|'much_worse'|'unknown';
  functionTrend:'improving'|'stable'|'worsening'|'unknown';
  consecutiveStableDays:number; dangerSigns:DangerSign[];
}
export interface RehabAuthorization {
  caseId:string; protocolId:string; protocolVersion:string; approvedByClinician:boolean;
  progressionAuthorized:boolean; diagnosisStateAtApproval:DiagnosisState; approvedPhases:InjuryPhase[];
}
export type SafetyLevel = 'emergency_assessment'|'prompt_assessment'|'review_needed'|'screen_complete';
export interface SafetyDecision {level:SafetyLevel; reasonCodes:string[]; requiresClinicalAssessment:boolean;}
export type CaseAction = 'clinical_review'|'hold'|'reduce'|'maintain'|'progression_candidate';
export interface CaseDecision {caseId:string; action:CaseAction;reasonCodes:string[];progressionCandidate:boolean;}
export interface InjuryAssessment {
  rulesetVersion:typeof INJURY_RULESET_VERSION;safety:SafetyDecision;
  caseDecisions:CaseDecision[];activeConstraints:ClinicalConstraint[];
}
export interface InjuryAssessmentInput {
  cases:InjuryCase[];episodes:InjuryEpisode[];observations:InjuryObservation[];
  authorizations:RehabAuthorization[];constraints:ClinicalConstraint[];
  unresolvedEvents:InjuryEvent[];now:string;
}
export interface ExerciseExposure {
  exerciseId:string;affectedRegions:string[];stressTags:string[];
  /** Includes indirect/stabilizing load, not just the primary muscle. */
  annotationCoverage:'complete'|'incomplete';
}
export interface ExerciseDecision {
  exerciseId:string;disposition:'blocked'|'manual_review'|'eligible_for_strength_selection';
  reasonCodes:string[];constraintIds:string[];
}
const emergency = new Set<DangerSign>([
  'possible_head_or_neck_injury','chest_pain_or_breathing_difficulty','new_neurological_deficit',
  'neurovascular_change','open_fracture_or_deformity',
]);
const prompt = new Set<DangerSign>([
  'unable_to_bear_weight','sudden_major_weakness','rapid_swelling_or_bruising',
  'fever_or_systemic_illness','other_concerning_change',
]);
const active = new Set<InjuryCaseStatus>(['under_assessment','active_rehab','monitoring','maintenance']);
const unique = <T>(items:T[]):T[] => [...new Set(items)];
function validate(o:InjuryObservation):void {
  for (const value of [o.pain,o.previousPain]) {
    if(value!=null && (!Number.isFinite(value)||value<0||value>10)) throw new Error('Pain must be 0–10 or unknown.');
  }
  if(o.morningStiffnessMinutes!=null && (!Number.isFinite(o.morningStiffnessMinutes)||o.morningStiffnessMinutes<0)) {
    throw new Error('Morning stiffness minutes must be nonnegative or unknown.');
  }
  if(!Number.isInteger(o.consecutiveStableDays)||o.consecutiveStableDays<0) {
    throw new Error('consecutiveStableDays must be a nonnegative integer.');
  }
}
/** A safety screen is not a validated clinical triage instrument. */
export function triageInjuryEvents(events:InjuryEvent[], observations:InjuryObservation[]):SafetyDecision {
  const signs = unique([...events.flatMap(e=>e.dangerSigns),...observations.flatMap(o=>o.dangerSigns)]);
  if(signs.some(s=>emergency.has(s))) {
    return {level:'emergency_assessment',requiresClinicalAssessment:true,
      reasonCodes:['possible_emergency_sign',...signs.filter(s=>emergency.has(s))]};
  }
  if(signs.some(s=>prompt.has(s))||events.some(e=>e.functionLoss==='significant')) {
    return {level:'prompt_assessment',requiresClinicalAssessment:true,
      reasonCodes:['significant_function_change_or_warning_sign',...signs.filter(s=>prompt.has(s))]};
  }
  if(events.some(e=>!e.initialSafetyScreenComplete)||
     events.some(e=>e.mechanism==='traumatic'&&e.functionLoss==='unknown')) {
    return {level:'review_needed',requiresClinicalAssessment:true,reasonCodes:['new_event_requires_safety_screen']};
  }
  return {level:'screen_complete',requiresClinicalAssessment:false,reasonCodes:[]};
}
/** Clinician restrictions persist until explicitly revoked or superseded. */
export function effectiveConstraints(constraints:ClinicalConstraint[],now:string):ClinicalConstraint[] {
  return constraints.filter(c=>c.status==='active' && (c.source==='clinician'||!c.expiresAt||c.expiresAt>now));
}
export function assessInjuryManagement(input:InjuryAssessmentInput):InjuryAssessment {
  const cases=input.cases.filter(c=>active.has(c.status));
  const ids=new Set(cases.map(c=>c.id));
  const observations=input.observations.filter(o=>ids.has(o.caseId));
  observations.forEach(validate);
  const safety=triageInjuryEvents(input.unresolvedEvents,observations);
  const caseDecisions:CaseDecision[]=cases.map(c=>{
    const ep=input.episodes.filter(e=>e.caseId===c.id).sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0];
    const o=observations.filter(x=>x.caseId===c.id).sort((a,b)=>b.observedAt.localeCompare(a.observedAt))[0];
    const auth=input.authorizations.find(x=>x.caseId===c.id);
    const unresolved=input.unresolvedEvents.some(e=>e.caseId===c.id||e.caseId==null);
    let action:CaseAction='hold';let reason='incomplete_recent_observation';
    if(safety.level==='emergency_assessment'||safety.level==='prompt_assessment'||
       c.status==='under_assessment'||ep?.phase==='awaiting_assessment'||ep?.phase==='reassess'||unresolved) {
      action='clinical_review';reason='assessment_required';
    } else if(!ep||!o||o.pain==null||o.response24h==='unknown'||o.functionTrend==='unknown') {
      action='hold';
    } else if(o.response24h==='worse'||o.response24h==='much_worse'||o.functionTrend==='worsening'||
              (o.previousPain!=null&&o.pain-o.previousPain>=2)) {
      action='reduce';reason='worsening_response';
    } else if(!auth||!auth.approvedByClinician||!auth.progressionAuthorized||
              auth.diagnosisStateAtApproval!==c.diagnosisState||
              !auth.approvedPhases.includes(ep.phase)||ep.clinicianClearanceRequired) {
      action='hold';reason='protocol_clearance_not_documented';
    } else if(o.consecutiveStableDays<3) {
      action='maintain';reason='insufficient_stable_exposures';
    } else {
      action='progression_candidate';reason='protocol_candidate_only';
    }
    return {caseId:c.id,action,reasonCodes:[reason],progressionCandidate:action==='progression_candidate'};
  });
  return {rulesetVersion:INJURY_RULESET_VERSION,safety,caseDecisions,
    activeConstraints:effectiveConstraints(input.constraints,input.now)};
}
function matches(c:ClinicalConstraint,e:ExerciseExposure):boolean {
  if(c.scope.kind==='all_training') return true;
  if(c.scope.kind==='exercise') return c.scope.value===e.exerciseId;
  if(c.scope.kind==='region') return e.affectedRegions.includes(c.scope.value);
  return e.stressTags.includes(c.scope.value);
}
/** Eligible means no coded conflict, never medical clearance. */
export function screenExerciseForInjuries(
  e:ExerciseExposure,input:InjuryAssessmentInput,
  a:InjuryAssessment=assessInjuryManagement(input),
):ExerciseDecision {
  const matchesActive=a.activeConstraints.filter(c=>matches(c,e));
  const blocks=matchesActive.filter(c=>c.effect==='prohibit'||c.effect==='clearance_required');
  if(a.safety.level==='emergency_assessment'||a.safety.level==='prompt_assessment') {
    return {exerciseId:e.exerciseId,disposition:'blocked',reasonCodes:['clinical_safety_gate'],
      constraintIds:matchesActive.map(c=>c.id)};
  }
  if(blocks.length) return {exerciseId:e.exerciseId,disposition:'blocked',
    reasonCodes:['active_clinical_constraint'],constraintIds:blocks.map(c=>c.id)};
  const reasons:string[]=[];
  if(e.annotationCoverage!=='complete') reasons.push('exercise_exposure_annotation_incomplete');
  if(input.unresolvedEvents.some(v=>!v.initialSafetyScreenComplete)) reasons.push('unresolved_event');
  for(const injury of input.cases.filter(c=>active.has(c.status))) {
    const decision=a.caseDecisions.find(d=>d.caseId===injury.id);
    if(!injury.affectedRegions.length) {
      reasons.push('injury_location_unknown:'+injury.id);
      continue;
    }
    if(injury.affectedRegions.some(r=>e.affectedRegions.includes(r))) {
      reasons.push((decision?.progressionCandidate
        ? 'injury_region_requires_protocol_prescription:'
        : 'injury_region_not_cleared:')+injury.id);
    }
  }
  if(matchesActive.some(c=>c.effect==='cap')) reasons.push('dose_cap_requires_verification');
  if(reasons.length) return {exerciseId:e.exerciseId,disposition:'manual_review',
    reasonCodes:unique(reasons),constraintIds:matchesActive.map(c=>c.id)};
  return {exerciseId:e.exerciseId,disposition:'eligible_for_strength_selection',
    reasonCodes:['no_coded_restriction'],constraintIds:matchesActive.map(c=>c.id)};
}
/** Prior case association is a suggestion, never silent automatic linking. */
export function suggestInjuryEventLink(event:InjuryEvent,cases:InjuryCase[]):{
  outcome:'candidate_existing_case'|'new_case_pending';candidateCaseId?:string;requiresAthleteConfirmation:true;
} {
  const current=event.caseId && cases.find(c=>c.id===event.caseId);
  return current
    ? {outcome:'candidate_existing_case',candidateCaseId:current.id,requiresAthleteConfirmation:true}
    : {outcome:'new_case_pending',requiresAthleteConfirmation:true};
}
