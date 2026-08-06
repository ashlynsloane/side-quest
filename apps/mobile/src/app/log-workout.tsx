import type { Exercise } from '@circuit/domain';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import { getSocialPreferences, listWorkoutLedgerEntries, saveExternalWorkout, type LoadBasis, type LoggedExercise, type WorkoutLedgerSource, type WorkoutPlanRelation } from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { publishWorkoutActivity } from '@/services/social';
import { parseWorkoutDescription } from '@/services/workout-parser';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { radius, typography, type AppPalette } from '@/theme';

const EXAMPLE = 'Barbell RDLs 3x(6x65lb), then 3x25 squat jumps bodyweight';
const BASIS_OPTIONS: Array<{id:LoadBasis;label:string}>=[
  {id:'each_hand',label:'Each hand'},{id:'single_implement',label:'One weight'},{id:'total',label:'Total load'},
  {id:'bodyweight',label:'Bodyweight'},{id:'band_level',label:'Band level'},{id:'not_recorded',label:'Not recorded'},
];

export default function LogWorkoutScreen(){
  const router=useRouter();
  const {user,cloudEnabled}=useAuth();
  const {palette}=useTheme();
  const styles=useMemo(()=>makeStyles(palette),[palette]);
  const {exercises}=useExerciseCatalog();
  const [raw,setRaw]=useState(EXAMPLE);
  const [name,setName]=useState('Outside strength workout');
  const [draft,setDraft]=useState<LoggedExercise[]>([]);
  const [warnings,setWarnings]=useState<string[]>([]);
  const [source,setSource]=useState<WorkoutLedgerSource>('external');
  const [relation,setRelation]=useState<WorkoutPlanRelation>('replaced_planned');
  const [notes,setNotes]=useState('');
  const [matchingIndex,setMatchingIndex]=useState<number|null>(null);
  const [matchQuery,setMatchQuery]=useState('');
  const [saving,setSaving]=useState(false);

  function interpret(){const parsed=parseWorkoutDescription(raw,exercises);setDraft(parsed.exercises);setWarnings(parsed.warnings);setName(parsed.name);}
  function updateExercise(index:number,patch:Partial<LoggedExercise>){setDraft(current=>current.map((item,i)=>i===index?{...item,...patch}:item));}
  function updateScheme(index:number,field:'sets'|'reps'|'load',value:string){setDraft(current=>current.map((item,i)=>{
    if(i!==index)return item; const count=field==='sets'?Math.max(1,Math.min(20,Number(value)||1)):item.sets.length;
    const base=item.sets[0]??{id:`set_${Date.now()}`,loadBasis:'not_recorded' as const,completed:true};
    const nextBase={...base,
      ...(field==='reps'?{reps:Number(value)||undefined,seconds:undefined}:{}),
      ...(field==='load'?{loadValue:Number(value)||undefined}:{}),
    };
    return {...item,sets:Array.from({length:count},(_,setIndex)=>({...nextBase,id:item.sets[setIndex]?.id??`${item.id}_set_${setIndex}`}))};
  }));}
  function changeBasis(index:number,basis:LoadBasis){setDraft(current=>current.map((item,i)=>i===index?{...item,sets:item.sets.map(set=>({...set,loadBasis:basis,loadValue:basis==='bodyweight'||basis==='not_recorded'?undefined:set.loadValue}))}:item));}
  function chooseMatch(index:number,exercise:Exercise){const current=draft[index];if(!current)return;updateExercise(index,{exerciseId:exercise.id,name:exercise.name,equipmentId:exercise.equipmentOptions.flatMap(option=>option.items).find(item=>item.equipmentId!=='bodyweight')?.equipmentId??exercise.equipmentOptions[0]?.items[0]?.equipmentId,bodyRegions:exercise.bodyRegions,movementPatterns:exercise.movementPatterns,matchConfidence:'manual'});setMatchingIndex(null);setMatchQuery('');}
  async function save(){
    if(!draft.length){Alert.alert('Interpret the workout first','Describe the exercises, then review the parsed workout before saving.');return;}
    const unmatched=draft.filter(item=>!item.exerciseId||!item.bodyRegions.length);
    if(unmatched.length){Alert.alert('Review unmatched exercises',`${unmatched.length} exercise${unmatched.length===1?' is':'s are'} not connected to the curated library. Select a match so training memory knows which regions were loaded.`);return;}
    setSaving(true);try{
      const now=new Date().toISOString();
      const ledgerId=`external_${Date.now()}`;
      const workoutName=name.trim()||'Outside strength workout';
      await saveExternalWorkout({id:ledgerId,source,name:workoutName,exercises:draft,startedAt:now,completedAt:now,completionFraction:1,stationRounds:{},notes:notes.trim()||raw,relationToPlan:relation,createdAt:now,updatedAt:now});
      if(cloudEnabled&&user?.mode==='cloud'){
        try{
          const [preferences,weekEntries]=await Promise.all([getSocialPreferences(),listWorkoutLedgerEntries({from:startOfWeekIso(),limit:100})]);
          await publishWorkoutActivity({userId:user.id,ledgerId,workoutType:source==='class'?'Strength class':'Outside strength',title:workoutName,weeklyCount:weekEntries.length,completedAt:now,exercises:draft,preferences});
        }catch{}
      }
      Alert.alert('Workout logged','Training memory and progression history were updated from what you actually completed.',[{text:'View history',onPress:()=>router.replace('/workout-history' as Href)},{text:'Done',onPress:()=>router.replace('/(tabs)' as Href)}]);
    }finally{setSaving(false)}
  }
  const matchChoices=matchingIndex===null?[]:exercises.filter(ex=>matches(ex,matchQuery||draft[matchingIndex]?.name||'')).slice(0,12);

  return <AppScreen eyebrow="LOG ANOTHER WORKOUT" title="Describe what you actually did" subtitle="Use the iPhone keyboard microphone to dictate naturally. Side Quest parses the exercises, sets, reps, and loads, then asks you to review everything before it affects training memory.">
    <Surface style={styles.explain}><Text style={styles.explainTitle}>Dictation works in this box</Text><Text style={styles.helper}>Tap the microphone on the iPhone keyboard and say: “Barbell RDLs, three sets of six at sixty-five pounds. Then three sets of twenty-five squat jumps, bodyweight.”</Text></Surface>
    <TextInput value={raw} onChangeText={setRaw} multiline style={styles.description} placeholder="Describe the class or workout…" placeholderTextColor={palette.inkMuted}/>
    <Pressable onPress={interpret} style={styles.primary}><Text style={styles.primaryText}>Interpret workout</Text></Pressable>

    {draft.length?<>
      <SectionTitle detail={`${draft.length} exercises`}>Review before saving</SectionTitle>
      {warnings.map((warning)=><View key={warning} style={styles.warning}><Text style={styles.warningText}>{warning}</Text></View>)}
      <Text style={styles.label}>Workout name</Text><TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor={palette.inkMuted}/>
      <View style={styles.toggleRow}>{(['external','class'] as WorkoutLedgerSource[]).map(item=><Pressable key={item} onPress={()=>setSource(item)} style={[styles.toggle,source===item&&styles.toggleActive]}><Text style={[styles.toggleText,source===item&&styles.toggleTextActive]}>{item==='class'?'Workout class':'Outside workout'}</Text></Pressable>)}</View>
      {draft.map((exercise,index)=>{const first=exercise.sets[0];return <Surface key={exercise.id} style={styles.exerciseCard}>
        <View style={styles.exerciseTop}><View style={{flex:1}}><Text style={styles.exerciseName}>{exercise.name}</Text><Text style={styles.meta}>{exercise.matchConfidence==='unmatched'?'Not matched to training memory':`${exercise.movementPatterns[0]?.replaceAll('_',' ')??'movement'} · ${exercise.bodyRegions[0]?.region.replaceAll('_',' ')??'region unknown'}`}</Text></View><Pill tone={exercise.exerciseId?'good':'warn'}>{exercise.exerciseId?'Matched':'Needs match'}</Pill></View>
        <Pressable onPress={()=>{setMatchingIndex(index);setMatchQuery(exercise.name)}} style={styles.matchButton}><Text style={styles.matchButtonText}>{exercise.exerciseId?'Change exercise match':'Choose exercise match'}</Text></Pressable>
        <View style={styles.schemeRow}><Field label="Sets"><TextInput value={String(exercise.sets.length)} onChangeText={(value:string)=>updateScheme(index,'sets',value)} keyboardType="number-pad" style={styles.numberInput}/></Field><Field label="Reps"><TextInput value={first?.reps?String(first.reps):''} onChangeText={(value:string)=>updateScheme(index,'reps',value)} keyboardType="number-pad" style={styles.numberInput}/></Field><Field label="Load"><TextInput value={first?.loadValue?String(first.loadValue):''} onChangeText={(value:string)=>updateScheme(index,'load',value)} keyboardType="decimal-pad" style={styles.numberInput}/></Field><Field label="Unit"><Pressable onPress={()=>setDraft(current=>current.map((item,i)=>i===index?{...item,sets:item.sets.map(set=>({...set,loadUnit:set.loadUnit==='kg'?'lb':'kg'}))}:item))} style={styles.unitButton}><Text style={styles.unitText}>{first?.loadUnit??'lb'}</Text></Pressable></Field></View>
        <Text style={styles.label}>What does the load mean?</Text><View style={styles.basisRow}>{BASIS_OPTIONS.map(option=><Pressable key={option.id} onPress={()=>changeBasis(index,option.id)} style={[styles.basis,first?.loadBasis===option.id&&styles.basisActive]}><Text style={[styles.basisText,first?.loadBasis===option.id&&styles.basisTextActive]}>{option.label}</Text></Pressable>)}</View>
        <Pressable onPress={()=>setDraft(current=>current.filter((_,i)=>i!==index))}><Text style={styles.remove}>Remove exercise</Text></Pressable>
      </Surface>})}
      <Pressable onPress={()=>setDraft(current=>[...current,blankExercise(current.length)])} style={styles.secondary}><Text style={styles.secondaryText}>＋ Add another exercise</Text></Pressable>

      <SectionTitle>How this relates to the plan</SectionTitle>
      <Choice label="Replaced my planned strength workout" detail="The planned session will not count as skipped." selected={relation==='replaced_planned'} onPress={()=>setRelation('replaced_planned')}/>
      <Choice label="Additional strength work" detail="Keep the planned session and count this as extra training." selected={relation==='additional'} onPress={()=>setRelation('additional')}/>
      <Choice label="Unrelated to the current plan" detail="Log it without changing plan adherence." selected={relation==='unrelated'} onPress={()=>setRelation('unrelated')}/>
      <Text style={styles.label}>Notes</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[styles.input,styles.notes]} placeholder="Class name, modifications, pain, or anything worth remembering" placeholderTextColor={palette.inkMuted}/>
      <Pressable disabled={saving} onPress={()=>void save()} style={[styles.primary,saving&&styles.disabled]}><Text style={styles.primaryText}>{saving?'Saving…':'Save completed workout'}</Text></Pressable>
    </>:null}

    {matchingIndex!==null?<Surface style={styles.matcher}><View style={styles.matcherTop}><Text style={styles.matcherTitle}>Choose the closest curated exercise</Text><Pressable onPress={()=>setMatchingIndex(null)}><Text style={styles.close}>Close</Text></Pressable></View><TextInput value={matchQuery} onChangeText={setMatchQuery} style={styles.input} placeholder="Search 150 exercises" placeholderTextColor={palette.inkMuted}/>{matchChoices.map(exercise=><Pressable key={exercise.id} onPress={()=>chooseMatch(matchingIndex,exercise)} style={styles.matchChoice}><Text style={styles.matchName}>{exercise.name}</Text><Text style={styles.meta}>{exercise.movementPatterns[0]?.replaceAll('_',' ')} · {exercise.bodyRegions[0]?.region.replaceAll('_',' ')}</Text></Pressable>)}</Surface>:null}
  </AppScreen>;
}
function startOfWeekIso():string{const date=new Date();const day=date.getDay();date.setDate(date.getDate()+(day===0?-6:1-day));date.setHours(0,0,0,0);return date.toISOString()}
function Field({label,children}:{label:string;children:ReactNode}){const{palette}=useTheme();const styles=useMemo(()=>makeStyles(palette),[palette]);return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text>{children}</View>}
function Choice({label,detail,selected,onPress}:{label:string;detail:string;selected:boolean;onPress:()=>void}){const{palette}=useTheme();const styles=useMemo(()=>makeStyles(palette),[palette]);return <Pressable onPress={onPress} style={[styles.choice,selected&&styles.choiceActive]}><View style={[styles.radio,selected&&styles.radioActive]}>{selected?<Text style={styles.check}>✓</Text>:null}</View><View style={{flex:1}}><Text style={styles.choiceTitle}>{label}</Text><Text style={styles.helper}>{detail}</Text></View></Pressable>}
function blankExercise(index:number):LoggedExercise{return{id:`draft_manual_${Date.now()}_${index}`,name:'Unmatched exercise',sets:[{id:`draft_set_${Date.now()}`,reps:10,loadBasis:'not_recorded',completed:true}],bodyRegions:[],movementPatterns:[],matchConfidence:'unmatched'}}
function matches(exercise:Exercise,raw:string){const query=raw.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(!query)return true;const text=[exercise.name,...exercise.aliases,...exercise.movementPatterns,...exercise.bodyRegions.map(item=>item.region)].join(' ').toLowerCase();return query.split(' ').filter(Boolean).some(token=>text.includes(token));}
function makeStyles(palette:AppPalette){return StyleSheet.create({explain:{backgroundColor:palette.mint,gap:5},explainTitle:{fontSize:16,fontWeight:'900',color:palette.ink},helper:{...typography.small,color:palette.inkMuted},description:{minHeight:130,textAlignVertical:'top',backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:radius.lg,padding:15,color:palette.ink,fontSize:16,lineHeight:23},primary:{backgroundColor:palette.forest,borderRadius:15,padding:15,alignItems:'center'},primaryText:{color:palette.white,fontWeight:'900',fontSize:15},secondary:{borderWidth:1,borderColor:palette.forest,borderRadius:15,padding:13,alignItems:'center'},secondaryText:{color:palette.forest,fontWeight:'900'},warning:{backgroundColor:palette.sand,borderRadius:12,padding:11},warningText:{...typography.small,color:palette.ink,fontWeight:'700'},label:{...typography.eyebrow,color:palette.forest},input:{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:radius.sm,padding:12,color:palette.ink},notes:{minHeight:80,textAlignVertical:'top'},toggleRow:{flexDirection:'row',gap:8},toggle:{flex:1,borderWidth:1,borderColor:palette.border,borderRadius:12,padding:11,alignItems:'center'},toggleActive:{backgroundColor:palette.forest},toggleText:{fontWeight:'800',color:palette.ink},toggleTextActive:{color:palette.white},exerciseCard:{gap:11},exerciseTop:{flexDirection:'row',gap:8,alignItems:'center'},exerciseName:{fontSize:18,fontWeight:'900',color:palette.ink},meta:{fontSize:11,fontWeight:'800',color:palette.forest,textTransform:'capitalize'},matchButton:{borderWidth:1,borderColor:palette.forest,borderRadius:11,padding:10,alignItems:'center'},matchButtonText:{color:palette.forest,fontWeight:'900',fontSize:12},schemeRow:{flexDirection:'row',gap:7},field:{flex:1,gap:5},fieldLabel:{fontSize:10,fontWeight:'900',color:palette.inkMuted,textTransform:'uppercase'},numberInput:{backgroundColor:palette.canvas,borderWidth:1,borderColor:palette.border,borderRadius:10,padding:10,color:palette.ink,textAlign:'center'},unitButton:{backgroundColor:palette.canvas,borderWidth:1,borderColor:palette.border,borderRadius:10,padding:10,alignItems:'center'},unitText:{fontWeight:'900',color:palette.forest},basisRow:{flexDirection:'row',flexWrap:'wrap',gap:6},basis:{borderWidth:1,borderColor:palette.border,borderRadius:999,paddingHorizontal:9,paddingVertical:7},basisActive:{backgroundColor:palette.forest,borderColor:palette.forest},basisText:{fontSize:10,fontWeight:'800',color:palette.inkMuted},basisTextActive:{color:palette.white},remove:{color:palette.danger,fontWeight:'800',fontSize:12},choice:{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:radius.md,padding:13,flexDirection:'row',gap:11,alignItems:'center'},choiceActive:{borderColor:palette.forest,backgroundColor:palette.surfaceMuted},radio:{width:24,height:24,borderRadius:12,borderWidth:1,borderColor:palette.border,alignItems:'center',justifyContent:'center'},radioActive:{backgroundColor:palette.forest,borderColor:palette.forest},check:{color:palette.white,fontWeight:'900'},choiceTitle:{fontSize:15,fontWeight:'900',color:palette.ink},matcher:{gap:10,borderColor:palette.forest,borderWidth:2},matcherTop:{flexDirection:'row',justifyContent:'space-between'},matcherTitle:{fontSize:17,fontWeight:'900',color:palette.ink},close:{color:palette.forest,fontWeight:'900'},matchChoice:{borderTopWidth:1,borderTopColor:palette.border,paddingTop:9},matchName:{fontSize:15,fontWeight:'900',color:palette.ink},disabled:{opacity:.55}})}
