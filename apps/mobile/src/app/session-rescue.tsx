import type { PlannedStrengthSession, TrainingBlockPlan, WorkoutVariantLevel } from '@circuit/domain';
import { createReentryWorkout, createWorkoutVariant } from '@circuit/generator';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getActiveTrainingCheckIn, getLatestPTProfile, getLatestTrainingBlock, getTodayReadinessCheckIn, getTrainingContinuitySummary } from '@/services/database';
import { readinessHeadline, readinessScore, type DailyReadinessCheckIn } from '@/services/readiness';
import { useWorkoutContext } from '@/state/workout-context';

export default function SessionRescueScreen() {
  const router = useRouter();
  const { beginWorkout, setPreviewWorkout } = useWorkoutContext();
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [readiness, setReadiness] = useState<DailyReadinessCheckIn | null>(null);
  const [hasRestriction, setHasRestriction] = useState(false);
  const [daysSinceLastStrength, setDaysSinceLastStrength] = useState<number | undefined>();
  const [returningFromInjury, setReturningFromInjury] = useState(false);
  const [selected, setSelected] = useState<WorkoutVariantLevel>('reduced');

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void Promise.all([getLatestTrainingBlock(), getTodayReadinessCheckIn(), getActiveTrainingCheckIn(), getTrainingContinuitySummary(), getLatestPTProfile()]).then(([saved, ready, checkIn, continuity, ptProfile]) => {
      if (cancelled) return;
      const returning = Boolean(ptProfile?.active && ptProfile.conditions.some((condition) => condition.status === 'returning' || condition.status === 'active'));
      setBlock(saved?.block ?? null); setReadiness(ready); setHasRestriction(Boolean(checkIn));
      setDaysSinceLastStrength(continuity.daysSinceLastStrength); setReturningFromInjury(returning);
      if (returning || (continuity.daysSinceLastStrength ?? 0) >= 14 || (ready && readinessScore(ready) < 2.8)) setSelected('minimum');
      else if ((continuity.daysSinceLastStrength ?? 0) >= 7) setSelected('reduced');
    });
    return () => { cancelled = true; };
  }, []));

  const session = useMemo(() => nextSession(block), [block]);
  const reentry = returningFromInjury || (daysSinceLastStrength ?? 0) >= 14;
  const variants = useMemo(() => session ? {
    full: reentry ? createReentryWorkout(session.workout, { conservative: returningFromInjury, level: 'reduced' }) : createWorkoutVariant(session.workout, 'full'),
    reduced: reentry ? createReentryWorkout(session.workout, { conservative: returningFromInjury, level: 'reduced' }) : createWorkoutVariant(session.workout, 'reduced'),
    minimum: reentry ? createReentryWorkout(session.workout, { conservative: returningFromInjury, level: 'minimum' }) : createWorkoutVariant(session.workout, 'minimum'),
  } : null, [session, reentry, returningFromInjury]);
  const workout = variants?.[selected] ?? null;

  function preview() { if (!workout) return; setPreviewWorkout(workout); router.push('/workout-preview' as Href); }
  function start() { if (!workout) return; beginWorkout(workout); router.push('/active-workout' as Href); }

  return <SafeAreaView style={styles.safeArea} edges={['left','right']}>
    <View style={styles.topBar}><Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹ Home</Text></Pressable><Text style={styles.topTitle}>Session rescue</Text></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}><Text style={styles.eyebrow}>KEEP THE PLAN, CHANGE THE DOSE</Text><Text style={styles.title}>Make today workable</Text><Text style={styles.body}>Choose the smallest version that preserves continuity without pretending every day must support the original prescription.</Text></View>
      {!session || !variants ? <View style={styles.card}><Text style={styles.sectionTitle}>No upcoming session</Text><Text style={styles.body}>There is no eligible planned strength workout to rescue.</Text></View> : <>
        <View style={styles.card}><Text style={styles.sectionTitle}>{session.title}</Text><Text style={styles.body}>{formatDate(session.date)} · originally {session.workout.request.workMinutes} minutes</Text>{readiness ? <Text style={styles.signal}>Readiness: {readinessHeadline(readiness)} ({readinessScore(readiness).toFixed(1)}/5)</Text> : <Text style={styles.body}>No readiness check-in has been recorded today.</Text>}{hasRestriction ? <Text style={styles.warning}>A temporary soreness or pain check-in is active. Use the already-adapted exercise selection and avoid overriding symptoms merely to complete the workout.</Text> : null}{reentry ? <Text style={styles.warning}>{returningFromInjury ? 'Return-from-injury mode is active.' : `It has been ${daysSinceLastStrength} days since the last completed strength session.`} Reps and time are reduced below the prior dose before normal progression resumes.</Text> : null}</View>
        <Text style={styles.sectionTitle}>Choose today’s dose</Text>
        {(['full','reduced','minimum'] as WorkoutVariantLevel[]).map((level) => {
          const item=variants[level]; const active=selected===level;
          return <Pressable key={level} onPress={() => setSelected(level)} style={[styles.option,active&&styles.optionActive]}><View style={{flex:1}}><Text style={[styles.optionTitle,active&&styles.optionTitleActive]}>{label(level)}</Text><Text style={styles.body}>{Math.round(item.estimatedElapsedSeconds/60)} min · {item.stations.length} station{item.stations.length===1?'':'s'}</Text><Text style={styles.reason}>{reason(level)}</Text></View><Text style={[styles.radio,active&&styles.radioActive]}>{active?'✓':''}</Text></Pressable>;
        })}
        <View style={styles.callout}><Text style={styles.sectionTitle}>Recommendation</Text><Text style={styles.body}>{recommendation(readiness, selected)}</Text></View>
        <View style={styles.buttonRow}><Pressable onPress={preview} style={styles.secondaryButton}><Text style={styles.secondaryText}>Preview</Text></Pressable><Pressable onPress={start} style={styles.primaryButton}><Text style={styles.primaryText}>Start {label(selected)}</Text></Pressable></View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
function nextSession(block:TrainingBlockPlan|null):PlannedStrengthSession|null { const today=new Date().toISOString().slice(0,10); return block?.weeks.flatMap(w=>w.sessions).filter(s=>s.date>=today&&s.completionStatus!=='completed'&&s.completionStatus!=='skipped').sort((a,b)=>a.date.localeCompare(b.date))[0]??null; }
function label(v:WorkoutVariantLevel){return v==='full'?'Full session':v==='reduced'?'Reduced session':'Minimum effective session';}
function reason(v:WorkoutVariantLevel){return v==='full'?'Use when time and recovery still support the original plan.':v==='reduced'?'Preserves the major patterns with substantially less total work.':'Keeps a small dose of the highest-value work and protects continuity.';}
function recommendation(r:DailyReadinessCheckIn|null, selected:WorkoutVariantLevel){if(!r)return `The ${label(selected).toLowerCase()} is available, but a readiness check-in would make the recommendation more specific.`; const score=readinessScore(r); if(score<2.8)return 'Readiness is low. Minimum effective work—or no strength if symptoms are concerning—is more defensible than forcing the full session.'; if(score<3.6)return 'Readiness is mixed. The reduced version is a reasonable default while preserving the plan’s intent.'; return 'Readiness is supportive. The full session remains reasonable unless schedule, soreness, or endurance priorities argue for less.';}
function formatDate(v:string){return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric'}).format(new Date(`${v}T12:00:00`));}
const c={bg:'#E4EBE3',card:'#FFF',ink:'#01234D',muted:'#6B7770',border:'#164C73',accent:'#153E2F',soft:'#D8E9DF',warm:'#F4E7D2',warn:'#8A4B22'};
const styles=StyleSheet.create({safeArea:{flex:1,backgroundColor:c.bg},topBar:{flexDirection:'row',alignItems:'center',paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,borderBottomColor:c.border,backgroundColor:c.card},backButton:{flex:1,paddingVertical:6},backText:{color:c.accent,fontSize:16,fontWeight:'700'},topTitle:{color:c.ink,fontSize:17,fontWeight:'700'},content:{padding:20,paddingBottom:60,gap:15},intro:{gap:6},eyebrow:{color:c.accent,fontSize:11,fontWeight:'800',letterSpacing:1.2},title:{color:c.ink,fontSize:30,fontWeight:'800',lineHeight:36},body:{color:c.muted,fontSize:14,lineHeight:20},sectionTitle:{color:c.ink,fontSize:18,fontWeight:'800'},card:{backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:20,padding:17,gap:7},signal:{color:c.accent,fontSize:14,fontWeight:'800',marginTop:5},warning:{color:c.warn,fontSize:13,lineHeight:19,backgroundColor:c.warm,padding:12,borderRadius:12},option:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:18,padding:16},optionActive:{borderColor:c.accent,backgroundColor:c.soft},optionTitle:{color:c.ink,fontSize:17,fontWeight:'800'},optionTitleActive:{color:c.accent},reason:{color:c.muted,fontSize:12,lineHeight:18,marginTop:4},radio:{width:25,height:25,borderRadius:13,borderWidth:2,borderColor:c.border,textAlign:'center',lineHeight:21,color:'#FFF',fontWeight:'800'},radioActive:{backgroundColor:c.accent,borderColor:c.accent},callout:{backgroundColor:c.warm,borderRadius:18,padding:16,gap:6},buttonRow:{flexDirection:'row',gap:10},secondaryButton:{flex:1,borderWidth:1,borderColor:c.accent,borderRadius:15,padding:15,alignItems:'center'},primaryButton:{flex:1,backgroundColor:c.accent,borderRadius:15,padding:15,alignItems:'center'},secondaryText:{color:c.accent,fontWeight:'800'},primaryText:{color:'#FFF',fontWeight:'800'}});
