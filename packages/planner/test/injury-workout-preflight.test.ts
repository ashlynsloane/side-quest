import { describe, expect, it } from 'vitest';
import type { Exercise, GeneratedWorkout } from '@circuit/domain';
import { assessWorkoutInjuryPreflight, exerciseExposureFromCatalog } from '../src/injury-workout-preflight';
import type { InjuryAssessmentInput } from '../src/injury-management';

const exercise=(id:string,region:'quadriceps'|'upper_back'='quadriceps',
  tags:string[]=[],impact=0):Exercise=>({
  id,name:id,
  bodyRegions:[{region,role:'primary',load:2}],
  jointLoads:[],
  movementPatterns:[],
  avoidanceTags:tags,
  impactLevel:impact,
} as unknown as Exercise);
const workout=(e:Exercise):GeneratedWorkout=>({
  id:'w1',
  stations:[{id:'s1',exercises:[{exerciseId:e.id,exerciseSnapshot:e}]}],
} as GeneratedWorkout);
const input=():InjuryAssessmentInput=>({
  now:'2026-10-29T18:00:00Z',
  cases:[{id:'ankle',label:'ankle',course:'acute',diagnosisState:'unknown',
    status:'under_assessment',affectedRegions:['ankle']}],
  episodes:[],observations:[],authorizations:[],constraints:[],unresolvedEvents:[],
});
describe('read-only rehabilitation workout preflight',()=>{
  it('does not assume existing exercise metadata is reviewed',()=>{
    const e=exercise('leg-extension');
    const result=assessWorkoutInjuryPreflight(workout(e),{
      ...input(),cases:[],
    });
    expect(result.disposition).toBe('review_needed');
    expect(result.exercises[0]!.reasonCodes).toContain('exercise_exposure_annotation_incomplete');
  });
  it('includes stabilizers and joint loading in exposure checks',()=>{
    const e={...exercise('press'),jointLoads:[{region:'shoulder' as const,load:2 as const}]};
    expect(exerciseExposureFromCatalog(e,new Set(['press'])).affectedRegions)
      .toContain('shoulder');
  });
  it('blocks clinician-prohibited impact even for quadriceps training',()=>{
    const x=input();
    x.cases[0]!.status='active_rehab';
    x.constraints=[{id:'no-impact',source:'clinician',status:'active',effect:'prohibit',
      issuedAt:'2026-10-20T00:00:00Z',scope:{kind:'stress_tag',value:'impact'}}];
    const e=exercise('jump','quadriceps',[],3);
    expect(assessWorkoutInjuryPreflight(workout(e),x,new Set(['jump'])).disposition)
      .toBe('blocked');
  });
  it('does not block appropriately classified unaffected exercise without coded conflict',()=>{
    const x=input();
    x.cases[0]!.status='active_rehab';
    const e=exercise('leg-extension');
    const result=assessWorkoutInjuryPreflight(workout(e),x,new Set(['leg-extension']));
    expect(result.disposition).toBe('no_coded_conflict');
    expect(result.warnings.some(w=>w.includes('not clinical clearance'))).toBe(true);
  });
  it('flags unclassified injury location instead of declaring exercise safe',()=>{
    const x=input();x.cases[0]!.affectedRegions=[];
    const e=exercise('leg-extension');
    expect(assessWorkoutInjuryPreflight(workout(e),x,new Set(['leg-extension']))
      .disposition).toBe('review_needed');
  });
  it('blocks all planned training after unresolved emergency findings',()=>{
    const x=input();
    x.unresolvedEvents=[{
      id:'crash',occurredAt:'2026-10-29T16:00:00Z',kind:'trauma',
      mechanism:'traumatic',dangerSigns:['new_neurological_deficit'],
      functionLoss:'significant',initialSafetyScreenComplete:false,
    }];
    expect(assessWorkoutInjuryPreflight(workout(exercise('leg-extension')),x)
      .disposition).toBe('blocked');
  });
});
