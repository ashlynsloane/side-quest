/**
 * Constructs a read-only injury preflight for an existing workout.
 * This does not write, alter, approve, or re-plan the workout.
 */
import type { GeneratedWorkout } from '@circuit/domain';
import {
  assessWorkoutInjuryPreflight,
  type InjuryAssessmentInput,
  type WorkoutInjuryPreflight,
  type ClinicalConstraint,
} from '@circuit/planner';
import { withInjuryMemoryStore } from './injury-memory-store';

export interface MobileInjuryPreflight {
  activeInjuryCases: number;
  preflight: WorkoutInjuryPreflight | null;
}
export async function checkWorkoutAgainstRecordedInjuries(
  workout:GeneratedWorkout|null,
):Promise<MobileInjuryPreflight> {
  return withInjuryMemoryStore(async store=>{
    const allCases=await store.listCases();
    const cases=allCases.filter(c=>c.status!=='inactive');
    if(!cases.length)return {activeInjuryCases:0,preflight:null};
    const histories=await Promise.all(cases.map(c=>store.getHistory(c.id)));
    const constraints=new Map<string,ClinicalConstraint>();
    for(const h of histories)for(const c of h.constraints)constraints.set(c.id,c);
    const input:InjuryAssessmentInput={
      now:new Date().toISOString(),
      cases,
      episodes:histories.flatMap(h=>h.episodes),
      observations:histories.flatMap(h=>h.responses),
      authorizations:histories.flatMap(h=>h.protocols.map(p=>p.authorization)),
      constraints:[...constraints.values()],
      unresolvedEvents:histories.flatMap(h=>h.events.map(e=>e.event))
        .filter(e=>!e.initialSafetyScreenComplete),
    };
    // No exercise IDs have been clinically annotated/reviewed for this new
    // injury system. Treat all exercise exposure annotations as incomplete.
    const preflight=workout
      ? assessWorkoutInjuryPreflight(workout,input,new Set<string>()):null;
    return {activeInjuryCases:cases.length,preflight};
  });
}
