import { describe, it, expect } from 'vitest';
import { assessInjuryManagement, effectiveConstraints, screenExerciseForInjuries, triageInjuryEvents, suggestInjuryEventLink, type InjuryAssessmentInput, type InjuryEvent } from '../src/injury-management';

const base = (): InjuryAssessmentInput => ({
  now:'2026-10-29T18:00:00Z',
  cases:[
    {id:'ankle',label:'ankle',course:'acute',diagnosisState:'clinician_assessed',status:'active_rehab',affectedRegions:['feet_ankles']},
    {id:'back',label:'thoracic pain',course:'persistent',diagnosisState:'suspected',status:'maintenance',affectedRegions:['upper_back']},
  ],
  episodes:[
    {id:'a',caseId:'ankle',startedAt:'2026-10-29',phase:'gradual_loading',clinicianClearanceRequired:false},
    {id:'b',caseId:'back',startedAt:'2026-10-29',phase:'maintenance',clinicianClearanceRequired:false},
  ],
  observations:[
    {caseId:'ankle',observedAt:'2026-10-29',pain:2,previousPain:2,response24h:'stable',functionTrend:'stable',consecutiveStableDays:3,dangerSigns:[]},
    {caseId:'back',observedAt:'2026-10-29',pain:3,previousPain:3,response24h:'stable',functionTrend:'stable',consecutiveStableDays:3,dangerSigns:[]},
  ],
  authorizations:[
    {caseId:'ankle',protocolId:'a',protocolVersion:'1',approvedByClinician:true,progressionAuthorized:true,diagnosisStateAtApproval:'clinician_assessed',approvedPhases:['gradual_loading']},
    {caseId:'back',protocolId:'b',protocolVersion:'1',approvedByClinician:true,progressionAuthorized:true,diagnosisStateAtApproval:'suspected',approvedPhases:['maintenance']},
  ],
  constraints:[],unresolvedEvents:[],
});
const event=(extra:Partial<InjuryEvent>={}):InjuryEvent=>({
  id:'new',occurredAt:'2026-10-29',kind:'trauma',mechanism:'traumatic',
  dangerSigns:[],functionLoss:'none',initialSafetyScreenComplete:false,...extra,
});
const ex=(id:string,regions:string[],tags:string[]=[])=>({exerciseId:id,affectedRegions:regions,stressTags:tags,annotationCoverage:'complete' as const});
describe('condition-agnostic injury management',()=>{
  it('screens emergency trauma signals',()=>{
    expect(triageInjuryEvents([event({dangerSigns:['new_neurological_deficit']})],[]).level).toBe('emergency_assessment');
  });
  it('flags meaningful trauma function loss',()=>{
    expect(triageInjuryEvents([event({functionLoss:'significant'})],[]).level).toBe('prompt_assessment');
  });
  it('does not clear an unresolved new injury',()=>{
    expect(triageInjuryEvents([event()],[]).level).toBe('review_needed');
  });
  it('keeps separate injuries independently staged',()=>{
    const x=base();x.observations[0]!.response24h='worse';
    const a=assessInjuryManagement(x);
    expect(a.caseDecisions[0]!.action).toBe('reduce');
    expect(a.caseDecisions[1]!.action).toBe('progression_candidate');
  });
  it('does not require zero chronic pain for authorized capacity work',()=>{
    expect(assessInjuryManagement(base()).caseDecisions[1]!.progressionCandidate).toBe(true);
  });
  it('holds on missing responses',()=>{
    const x=base();x.observations[0]!.response24h='unknown';
    expect(assessInjuryManagement(x).caseDecisions[0]!.action).toBe('hold');
  });
  it('holds after diagnosis revision invalidates protocol',()=>{
    const x=base();x.cases[0]!.diagnosisState='revised';
    expect(assessInjuryManagement(x).caseDecisions[0]!.action).toBe('hold');
  });
  it('does not auto-expire clinician restrictions',()=>{
    const c={id:'c',status:'active' as const,source:'clinician' as const,effect:'prohibit' as const,
      scope:{kind:'stress_tag' as const,value:'impact'},issuedAt:'2026-01-01',expiresAt:'2026-02-01'};
    expect(effectiveConstraints([c],base().now)).toHaveLength(1);
    expect(effectiveConstraints([{...c,status:'revoked'}],base().now)).toHaveLength(0);
  });
  it('blocks prohibited loading and supports unaffected strength',()=>{
    const x=base();x.constraints=[{id:'no-impact',source:'clinician',status:'active',effect:'prohibit',
      scope:{kind:'stress_tag',value:'impact'},issuedAt:'2026-01-01'}];
    expect(screenExerciseForInjuries(ex('hop',['quadriceps'],['impact']),x).disposition).toBe('blocked');
    expect(screenExerciseForInjuries(ex('leg-extension',['quadriceps']),x).disposition).toBe('eligible_for_strength_selection');
  });
  it('requests review for incomplete metadata and injury-region loading',()=>{
    const x=base();
    expect(screenExerciseForInjuries({...ex('unknown',['quadriceps']),annotationCoverage:'incomplete'},x).disposition).toBe('manual_review');
    expect(screenExerciseForInjuries(ex('calf-raise',['feet_ankles']),x).disposition).toBe('manual_review');
  });
  it('requires confirmation before linking a flare with an existing case',()=>{
    expect(suggestInjuryEventLink(event({caseId:'ankle'}),base().cases).requiresAthleteConfirmation).toBe(true);
    expect(suggestInjuryEventLink(event(),base().cases).outcome).toBe('new_case_pending');
  });
  it('does not assume an injury with unknown location is safe',()=>{
    const x=base();x.cases[0]!.affectedRegions=[];
    expect(screenExerciseForInjuries(ex('leg-extension',['quadriceps']),x).disposition).toBe('manual_review');
  });
});
