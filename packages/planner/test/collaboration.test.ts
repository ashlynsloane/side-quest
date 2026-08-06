import type { Exercise, GeneratedWorkout, PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import { describe, expect, it } from 'vitest';

import {
  applyCoachSessionRevision,
  coachWorkoutConflicts,
  combineSharedWorkouts,
  describeCoachProposalDifference,
  markFriendWorkoutSubstitution,
  publicWorkoutForCollaboration,
} from '../src/collaboration';

function exercise(id:string,name:string,region='glutes',avoidanceTags:string[]=[]):Exercise {
  return {
    id,slug:id,name,aliases:[],status:'active',classification:'bodyweight',category:'Strength',
    shortDescription:name,instructions:{setup:[],execution:[],cues:[],commonMistakes:[]},
    bodyRegions:[{region:region as never,role:'primary',load:3}],jointLoads:[],
    movementPatterns:['squat'],avoidanceTags:avoidanceTags as never,laterality:'bilateral',
    stationRoles:['primary_strength'],equipmentOptions:[{id:`${id}_bw`,label:'Bodyweight',items:[{equipmentId:'bodyweight',quantity:1}]}],
    prescriptions:[{id:`${id}_reps`,style:'amrap',mode:'reps',unit:'total',target:10,minimum:4,maximum:20,estimatedSeconds:30}],
    impactLevel:1,balanceDemand:1,cardiovascularDemand:1,technicalComplexity:1,
    suitableForAmrap:true,suitableForTravel:true,suitableForBeginners:true,
    substitutionGroupIds:[],compatibility:{maximumAppearancesPerWorkout:2},
    media:[],defaultEnabled:true,contentVersion:1,createdAt:'2026-01-01',updatedAt:'2026-01-01',
  } as Exercise;
}
function workout(id:string,name:string,exerciseInput=exercise('squat','Squat')):GeneratedWorkout {
  return {
    id,name,createdAt:'2026-07-22T00:00:00Z',randomSeed:id,
    request:{workMinutes:8,allowedStationMinutes:[4,8,12],restSeconds:60,exercisesPerStation:2,
      focusTargets:[{region:'glutes',emphasis:'moderate'}],excludedRegions:[],excludedMovementTags:[],
      availableEquipment:['bodyweight'],workoutStyle:'strength_amrap',difficulty:'intermediate',
      maximumImpact:2,recoveryAware:true,avoidPreviousWorkoutExercises:false,favorFamiliarExercises:true,
      allowUnfamiliarExercises:true,minimizeEquipmentChanges:true},
    stations:[{id:`${id}_station`,order:1,durationSeconds:480,format:'amrap',purpose:'strength',
      exercises:[{exerciseId:exerciseInput.id,exerciseSnapshot:exerciseInput,equipmentOptionId:`${exerciseInput.id}_bw`,
        prescriptionId:`${exerciseInput.id}_reps`,target:10,unit:'total',order:1,userLoadValue:25,userLoadUnit:'lb',adaptationNote:'private'}]}],
    totalWorkSeconds:480,totalRestSeconds:0,estimatedElapsedSeconds:480,
    requiredEquipment:['bodyweight'],targetRegions:['glutes'],recentLoadAdjustments:['private fatigue'],
    source:'generated',
  };
}
function session():PlannedStrengthSession {
  return {id:'session_1',date:'2099-07-25',order:1,title:'My session',purpose:'full_body',intendedLoad:'moderate',
    focusTargets:[],workout:workout('local','Local'),rationale:'Test',completionStatus:'planned'};
}

describe('coach plan privacy and safety',()=>{
  it('removes private loads, adaptation notes, and restrictions from shared workout JSON',()=>{
    const shared=publicWorkoutForCollaboration(workout('w','Workout'));
    expect(shared.request.excludedRegions).toEqual([]);
    expect(shared.recentLoadAdjustments).toEqual([]);
    expect(shared.stations[0]?.exercises[0]?.userLoadValue).toBeUndefined();
    expect(shared.stations[0]?.exercises[0]?.adaptationNote).toBeUndefined();
  });
  it('blocks coach edits that conflict with private restrictions',()=>{
    const local=session();
    local.workout.request.excludedRegions=['shoulders'];
    const candidate=workout('remote','Remote',exercise('press','Press','shoulders'));
    expect(coachWorkoutConflicts(local.workout,candidate)).not.toHaveLength(0);
    const result=applyCoachSessionRevision(local,{sessionId:local.id,date:local.date,title:'Edited',
      intendedLoad:'high',workout:candidate,coachUserId:'coach',coachDisplayName:'Coach',
      editedAt:'2026-07-22T00:00:00Z',revisionId:'session_1:1'});
    expect(result.ok).toBe(false);
  });

  it('summarizes coach proposal differences without exposing athlete-only context',()=>{
    const baseline={sessionDate:'2099-07-25',title:'Strength A',intendedLoad:'moderate' as const,purpose:'full_body' as const,workout:workout('base','Base')};
    const changed=workout('changed','Changed',exercise('row','Row','upper_back'));
    changed.stations[0]!.exercises[0]!.target=12;
    const proposed={sessionDate:'2099-07-26',title:'Strength B',intendedLoad:'high' as const,purpose:'full_body' as const,workout:changed};
    const diff=describeCoachProposalDifference(baseline,proposed);
    expect(diff.dateChanged).toBe(true);
    expect(diff.titleChanged).toBe(true);
    expect(diff.intendedLoadChanged).toBe(true);
    expect(diff.addedExercises).toContain('Row');
    expect(diff.removedExercises).toContain('Squat');
  });
  it('does not permit completed history to be edited',()=>{
    const local={...session(),completionStatus:'completed' as const};
    const result=applyCoachSessionRevision(local,{sessionId:local.id,date:local.date,title:'Edited',
      intendedLoad:'high',workout:workout('remote','Remote'),coachUserId:'coach',coachDisplayName:'Coach',
      editedAt:'2026-07-22T00:00:00Z',revisionId:'session_1:1'});
    expect(result.ok).toBe(false);
  });
});

describe('friend workout collaboration',()=>{
  it('combines two workouts without duplicating an exercise and caps the session',()=>{
    const combined=combineSharedWorkouts([
      {userId:'a',displayName:'Alex',sourceSessionId:'a1',workout:workout('a','A')},
      {userId:'b',displayName:'Blair',sourceSessionId:'b1',workout:workout('b','B',exercise('row','Row','upper_back'))},
    ],'a');
    expect(combined.sharedContext?.selectionMode).toBe('combined');
    expect(combined.totalWorkSeconds).toBeLessThanOrEqual(48*60);
    expect(new Set(combined.stations.flatMap(station=>station.exercises.map(item=>item.exerciseId))).size)
      .toBe(combined.stations.flatMap(station=>station.exercises).length);
  });
  it('records a friend workout substitution on only the selected future session',()=>{
    const block:TrainingBlockPlan={id:'block',createdAt:'2026-07-22',numberOfWeeks:2,
      goal:{} as never,weeks:[{id:'week',createdAt:'2026-07-22',weekStartDate:'2099-07-24',
        goal:{} as never,phase:'base',headline:'',phaseExplanation:'',warnings:[],sessions:[session()]}]};
    const next=markFriendWorkoutSubstitution(block,'session_1',{kind:'friend_workout',roomCode:'ABC123',
      sourceUserIds:['b'],sourceDisplayNames:['Blair'],sourceSessionIds:['b1'],originalSessionId:'session_1',
      originalSessionTitle:'My session',replacementWorkoutName:'Blair workout',completedAt:'2099-07-25T12:00:00Z'});
    expect(next.weeks[0]?.sessions[0]?.completionStatus).toBe('completed');
    expect(next.weeks[0]?.sessions[0]?.friendSubstitution?.roomCode).toBe('ABC123');
  });
});
