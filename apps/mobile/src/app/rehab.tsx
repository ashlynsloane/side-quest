/**
 * Side Quest rehabilitation history beta.
 * Records observations and produces descriptive summaries ONLY.
 * No automatic clinical diagnosis, approval, exercise loading, or clearance.
 */
import type { InjuryCase, InjuryEvent, InjuryObservation } from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen } from '@/components/v12-ui';
import { withInjuryMemoryStore } from '@/services/injury-memory-store';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const ENABLED = process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA === 'true';
type Mode = 'home'|'new'|'daily'|'progress';
type PainContext = NonNullable<InjuryObservation['painContextKey']>;
type Course = InjuryCase['course'];
type Status = InjuryObservation['response24h'];
type FunctionTrend = InjuryObservation['functionTrend'];
const COURSES:Course[]=['acute','recurrent','persistent','postoperative','unresolved'];
const PAIN_CONTEXTS:PainContext[]=['rest','walking','daily_movement','specific_activity'];
const RESPONSES:Status[]=['better','stable','worse','much_worse','unknown'];
const FUNCTION:FunctionTrend[]=['improving','stable','worsening','unknown'];
const capitalize=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,s=>s.toUpperCase());
function stamp():string {return new Date().toISOString();}
function recordId(prefix:string):string {
  return prefix+':'+Date.now()+':'+Math.random().toString(36).slice(2,11);
}
function dateRange(days:number) {
  const end=new Date(); const start=new Date(end);
  start.setDate(start.getDate()-days);
  return {startAt:start.toISOString(),endAt:end.toISOString()};
}
function Options<T extends string>({options,value,onChange,styles}:{
  options:readonly T[];value:T;onChange:(v:T)=>void;styles:ReturnType<typeof createStyles>;
}) {
  return <View style={styles.choiceRow}>{options.map(option=>
    <Pressable key={option} accessibilityRole="button"
      accessibilityState={{selected:value===option}}
      onPress={()=>onChange(option)}
      style={[styles.choice,value===option&&styles.choiceSelected]}>
      <Text style={[styles.choiceLabel,value===option&&styles.choiceSelectedLabel]}>
        {capitalize(option)}
      </Text>
    </Pressable>)}</View>;
}
function ErrorNotice({message,styles}:{
  message:string|null;styles:ReturnType<typeof createStyles>;
}) {
  return message?<View style={styles.warning}><Text style={styles.warningText}>{message}</Text></View>:null;
}
export default function RehabilitationScreen() {
  const router=useRouter();
  const {tokens}=useTheme();
  const styles=useMemo(()=>createStyles(tokens),[tokens]);
  const [mode,setMode]=useState<Mode>('home');
  const [cases,setCases]=useState<InjuryCase[]>([]);
  const [activeCaseId,setActiveCaseId]=useState<string|null>(null);
  const [latestPain,setLatestPain]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [name,setName]=useState('');
  const [area,setArea]=useState('');
  const [course,setCourse]=useState<Course>('acute');
  const [eventDescription,setEventDescription]=useState('');
  const [newWarning,setNewWarning]=useState(false);
  const [pain,setPain]=useState<number|null>(null);
  const [context,setContext]=useState<PainContext>('daily_movement');
  const [stiffness,setStiffness]=useState('');
  const [response,setResponse]=useState<Status>('unknown');
  const [functionTrend,setFunctionTrend]=useState<FunctionTrend>('unknown');
  const [concerning,setConcerning]=useState(false);
  const [report,setReport]=useState<Awaited<ReturnType<Awaited<
    ReturnType<typeof withInjuryMemoryStore>>['buildReport']>>|null>(null);
  const [timeWindow,setTimeWindow]=useState<30|90|365>(30);

  const activeCase=cases.find(item=>item.id===activeCaseId);
  const refresh=useCallback(async()=>{
    if(!ENABLED)return;
    setLoading(true);
    try {
      const result=await withInjuryMemoryStore(async store=>{
        const list=await store.listCases();
        const painEntries=await Promise.all(list.map(async item=>{
          const history=await store.getHistory(item.id);
          const last=history.responses.at(-1);
          return [item.id,last?.pain==null?'No observations':String(last.pain)+'/10'] as const;
        }));
        return {list,painEntries};
      });
      setCases(result.list);
      setLatestPain(Object.fromEntries(result.painEntries));
      setError(null);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  },[]);
  useFocusEffect(useCallback(()=>{
    void refresh();
  },[refresh]));

  async function saveCase(){
    const label=name.trim(),region=area.trim();
    if(!label||!region){setError('Enter a case name and affected area.');return;}
    setLoading(true);setError(null);
    const id=recordId('injury'),now=stamp();
    const item:InjuryCase={
      id,label,course,diagnosisState:'unknown',status:'under_assessment',
      affectedRegions:[region.toLowerCase().replace(/\s+/g,'_')],
    };
    const event:InjuryEvent={
      id:recordId('event'),caseId:id,occurredAt:now,
      kind:course==='acute'?'trauma':'onset',
      mechanism:course==='acute'?'uncertain':course==='postoperative'?'postoperative':'uncertain',
      dangerSigns:newWarning?['other_concerning_change']:[],
      functionLoss:'unknown',initialSafetyScreenComplete:false,
    };
    try {
      await withInjuryMemoryStore(async store=>{
        await store.upsertCase(item,now);
        await store.appendEvent({
          event,source:'athlete',
          description:eventDescription.trim()||'New injury concern reported for clinical review',
        });
      });
      setActiveCaseId(id);setName('');setArea('');setEventDescription('');
      setNewWarning(false);setMode('home');await refresh();
      if(newWarning){
        Alert.alert('Clinical review recommended',
          'New concerning symptoms require professional assessment. This record does not establish a diagnosis or exercise clearance.');
      }
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }

  async function saveResponse(){
    if(!activeCaseId){setError('Select an injury case.');return;}
    if(pain==null){setError('Select a pain score, including zero if appropriate.');return;}
    const minutes=stiffness.trim()?Number(stiffness):undefined;
    if(minutes!=null&&(!Number.isFinite(minutes)||minutes<0||minutes>1440)){
      setError('Morning stiffness must be a valid number of minutes, or left blank.');return;
    }
    setLoading(true);setError(null);
    const now=stamp(),id=recordId('response');
    try{
      await withInjuryMemoryStore(async store=>{
        const history=await store.getHistory(activeCaseId);
        const previous=history.responses.at(-1);
        const stableDays=response==='stable' && functionTrend!=='worsening'
          ? Math.min(365,(previous?.consecutiveStableDays??0)+1):0;
        await store.appendResponse(id,{
          caseId:activeCaseId,recordId:id,observedAt:now,
          pain,previousPain:previous?.pain??null,painContextKey:context,
          morningStiffnessMinutes:minutes,response24h:response,functionTrend,
          consecutiveStableDays:stableDays,
          dangerSigns:concerning?['other_concerning_change']:[],
        });
      });
      setPain(null);setStiffness('');setResponse('unknown');
      setFunctionTrend('unknown');setConcerning(false);setMode('home');
      await refresh();
      if(concerning) Alert.alert('Assessment needed',
        'New or significantly changing symptoms may need prompt clinical evaluation. Side Quest will not clear an injury or prescribe rehabilitation from this report.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }

  async function viewProgress(caseId:string,days:30|90|365=timeWindow){
    setActiveCaseId(caseId);setTimeWindow(days);setLoading(true);setError(null);
    try{
      const value=await withInjuryMemoryStore(store=>store.buildReport(caseId,dateRange(days)));
      setReport(value);setMode('progress');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }
  async function shareSummary(){
    if(!report||!activeCase)return;
    const lines=[
      'SIDE QUEST — PATIENT-INITIATED REHABILITATION SUMMARY',
      'Condition: '+activeCase.label,
      'Clinical status: '+activeCase.diagnosisState+' / '+activeCase.status,
      'Range: '+report.range.startAt+' to '+report.range.endAt,
      'Recorded observations: '+report.observationCount,
      'Recorded events: '+report.eventCount,
      'Explicitly linked training sessions: '+report.trainingRecordCount,
      '',
      ...report.series.flatMap(series=>[
        series.metricKey+(series.contextKey?' ('+series.contextKey+')':'')+' ['+series.unit+']:',
        ...series.points.map(point=>
          point.observedAt+' | '+point.value+' | source: '+point.source),
        '',
      ]),
      'Events:',
      ...report.events.map(e=>e.occurredAt+' | '+e.kind+' | '+e.description+' | '+e.source),
      '',
      ...report.warnings,
      'Not a diagnosis, medical clearance, or evidence of causation.',
    ];
    try {await Share.share({message:lines.join('\n')});}
    catch(e){setError(e instanceof Error?e.message:'Share sheet could not open.');}
  }
  if(!ENABLED){
    return <AppScreen eyebrow="REHABILITATION" title="Development preview"
      subtitle="The injury history beta is intentionally disabled until database restore and device tests are complete."
      showSubpageBar>
      <Text style={{color:tokens.textMuted}}>No personal health data has been changed.</Text>
    </AppScreen>;
  }
  return <AppScreen eyebrow="REHABILITATION" title={
    mode==='new'?'Record a new injury':mode==='daily'?'Daily injury check-in':
    mode==='progress'?'Rehabilitation progress':'Injury history'
  } subtitle={
    mode==='new'?'Record what happened. This is not a diagnosis.':
    mode==='daily'?'Separate symptoms from general training readiness.':
    mode==='progress'?'Observed history only. Missing days are not zero-pain days.':
    'Your persistent injury cases, episodes, and measurements.'
  } showSubpageBar>
    <ErrorNotice message={error} styles={styles}/>
    {loading?<Text style={styles.helper}>Working with your local records…</Text>:null}
    {mode!=='home'?<Pressable accessibilityRole="button" onPress={()=>{setMode('home');setError(null);}}
      style={styles.secondary}><Text style={styles.secondaryText}>‹ Injury history</Text></Pressable>:null}

    {mode==='home'?<>
      <View style={styles.panel}>
        <Text style={styles.heading}>Longitudinal injury cases</Text>
        {!cases.length?<Text style={styles.helper}>No cases recorded. Your existing workouts and temporary PT restrictions are unchanged.</Text>:null}
        {cases.map(item=><View key={item.id} style={styles.caseBlock}>
          <Text style={styles.caseTitle}>{item.label}</Text>
          <Text style={styles.helper}>{capitalize(item.course)} · {capitalize(item.status)}</Text>
          <Text style={styles.helper}>Last pain entry: {latestPain[item.id]??'Not recorded'}</Text>
          <View style={styles.choiceRow}>
            <Pressable accessibilityRole="button" style={styles.smallAction} onPress={()=>{setActiveCaseId(item.id);setMode('daily');setError(null);}}>
              <Text style={styles.smallActionText}>Check in</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.smallAction} onPress={()=>void viewProgress(item.id)}>
              <Text style={styles.smallActionText}>Progress</Text>
            </Pressable>
          </View>
        </View>)}
      </View>
      <Pressable accessibilityRole="button" style={styles.primary} onPress={()=>{setMode('new');setError(null);}}>
        <Text style={styles.primaryText}>Record a new injury or concern</Text>
      </Pressable>
      <Text style={styles.helper}>This beta records information but does not diagnose or change workout prescriptions.</Text>
    </>:null}

    {mode==='new'?<>
      <View style={styles.panel}>
        <Text style={styles.heading}>Describe the concern</Text>
        <Text style={styles.helper}>Name or description</Text>
        <TextInput accessibilityLabel="Injury case name" style={styles.input}
          placeholder="e.g. recurring shoulder pain" placeholderTextColor={tokens.textMuted}
          value={name} onChangeText={setName}/>
        <Text style={styles.helper}>Affected body region (free text, not clinical coding)</Text>
        <TextInput accessibilityLabel="Affected body region" style={styles.input}
          placeholder="e.g. left shoulder" placeholderTextColor={tokens.textMuted}
          value={area} onChangeText={setArea}/>
        <Text style={styles.heading}>Course or onset</Text>
        <Options options={COURSES} value={course} onChange={setCourse} styles={styles}/>
        <Text style={styles.helper}>What happened? (optional)</Text>
        <TextInput accessibilityLabel="Injury event description" multiline
          style={[styles.input,styles.multiline]} value={eventDescription}
          onChangeText={setEventDescription} placeholder="Onset, crash, flare, or other context"
          placeholderTextColor={tokens.textMuted}/>
        <Pressable accessibilityRole="checkbox"
          accessibilityState={{checked:newWarning}}
          onPress={()=>setNewWarning(!newWarning)} style={styles.checkbox}>
          <Text style={styles.body}>{newWarning?'☑':'□'} New concerning symptoms or major functional change</Text>
        </Pressable>
        {newWarning?<Text style={styles.warningText}>
          New neurological symptoms, major weakness, inability to bear weight, or concerning trauma may require urgent medical evaluation. Seek emergency care for emergency warning signs.
        </Text>:null}
        <Text style={styles.helper}>New cases start in assessment-needed status, with no exercise clearance.</Text>
      </View>
      <Pressable disabled={loading} accessibilityRole="button"
        style={styles.primary} onPress={()=>void saveCase()}>
        <Text style={styles.primaryText}>Save injury case</Text>
      </Pressable>
    </>:null}

    {mode==='daily'&&activeCase?<View style={styles.panel}>
      <Text style={styles.heading}>{activeCase.label}</Text>
      <Text style={styles.helper}>Pain (0–10) for the selected activity or context</Text>
      <View style={styles.choiceRow}>{Array.from({length:11},(_,i)=>
        <Pressable accessibilityRole="button" key={i}
          accessibilityState={{selected:pain===i}} onPress={()=>setPain(i)}
          style={[styles.score,pain===i&&styles.choiceSelected]}>
          <Text style={[styles.scoreText,pain===i&&styles.choiceSelectedLabel]}>{i}</Text>
        </Pressable>)}</View>
      <Text style={styles.heading}>Where was pain rated?</Text>
      <Options options={PAIN_CONTEXTS} value={context} onChange={setContext} styles={styles}/>
      <Text style={styles.heading}>Morning stiffness (minutes; optional)</Text>
      <TextInput style={styles.input} accessibilityLabel="Morning stiffness minutes"
        keyboardType="numeric" placeholder="Unknown / not measured" value={stiffness}
        onChangeText={setStiffness} placeholderTextColor={tokens.textMuted}/>
      <Text style={styles.heading}>Response to the previous 24 hours</Text>
      <Options options={RESPONSES} value={response} onChange={setResponse} styles={styles}/>
      <Text style={styles.heading}>Functional ability relative to recent baseline</Text>
      <Options options={FUNCTION} value={functionTrend} onChange={setFunctionTrend} styles={styles}/>
      <Pressable accessibilityRole="checkbox"
        accessibilityState={{checked:concerning}}
        style={styles.checkbox} onPress={()=>setConcerning(!concerning)}>
        <Text style={styles.body}>{concerning?'☑':'□'} New concerning symptoms or major change</Text>
      </Pressable>
      {concerning?<Text style={styles.warningText}>
        Do not use this entry to clear an injury. Seek appropriate clinical evaluation.
      </Text>:null}
      <Pressable disabled={loading} accessibilityRole="button" style={styles.primary}
        onPress={()=>void saveResponse()}>
        <Text style={styles.primaryText}>Save dated observation</Text>
      </Pressable>
    </View>:null}

    {mode==='progress'&&activeCase&&report?<View style={styles.panel}>
      <Text style={styles.heading}>{activeCase.label}</Text>
      <Text style={styles.helper}>Date window</Text>
      <View style={styles.choiceRow}>{([30,90,365] as const).map(days=>
        <Pressable key={days} accessibilityRole="button" style={styles.smallAction}
          onPress={()=>void viewProgress(activeCase.id,days)}>
          <Text style={styles.smallActionText}>{days} days</Text>
        </Pressable>)}</View>
      <Text style={styles.helper}>Observed measurements: {report.observationCount}. Events: {report.eventCount}. Linked training records: {report.trainingRecordCount}.</Text>
      {!report.series.length?<Text style={styles.helper}>No symptom measurements in this interval.</Text>:null}
      {report.series.map(series=><View key={series.metricKey+'_'+series.contextKey+'_'+series.unit}
        style={styles.series}>
        <Text style={styles.caseTitle}>{capitalize(series.metricKey)}{series.contextKey?' · '+capitalize(series.contextKey):''}</Text>
        <Text style={styles.helper}>{series.pointCount} observations · {series.unit}. No missing values are filled.</Text>
        <View style={styles.barRow}>{series.points.slice(-30).map(point=>
          <View key={point.id} accessibilityLabel={point.observedAt+': '+point.value}
            style={[styles.bar,{height:Math.max(3,Math.min(75,(point.value/(series.unit==='0-10'?10:Math.max(1,...series.points.map(p=>p.value))))*75))}]}/>)}</View>
        {series.points.length>0?<Text style={styles.helper}>
          First {series.firstValue}; latest {series.lastValue}; observed difference {series.observedDelta==null?'insufficient repeated observations':String(series.observedDelta)}.
        </Text>:null}
      </View>)}
      <Text style={styles.heading}>Recorded events</Text>
      {report.events.map(event=><Text key={event.id} style={styles.body}>
        {event.occurredAt.slice(0,10)} · {capitalize(event.kind)} · {event.description}
      </Text>)}
      <Text style={styles.helper}>A trend does not establish which exercise caused a flare or improvement. Activity associations are explicit, not inferred.</Text>
      <Pressable accessibilityRole="button" style={styles.primary} onPress={()=>void shareSummary()}>
        <Text style={styles.primaryText}>Review and share text summary with PT</Text>
      </Pressable>
      <Text style={styles.helper}>The device share sheet opens only on your request. No automatic upload or clinician access.</Text>
    </View>:null}
  </AppScreen>;
}
function createStyles(tokens:DesignTokens) {
  return StyleSheet.create({
    panel:{backgroundColor:tokens.surface,borderRadius:18,borderColor:tokens.border,borderWidth:1,padding:15,gap:12},
    heading:{color:tokens.text,fontWeight:'800',fontSize:16},
    helper:{color:tokens.textMuted,fontSize:13,lineHeight:19},
    body:{color:tokens.text,fontSize:14,lineHeight:20},
    caseBlock:{borderTopWidth:1,borderTopColor:tokens.border,paddingTop:12,gap:8},
    caseTitle:{fontSize:17,fontWeight:'800',color:tokens.text},
    choiceRow:{flexDirection:'row',flexWrap:'wrap',gap:7},
    choice:{borderWidth:1,borderColor:tokens.border,borderRadius:12,paddingVertical:9,paddingHorizontal:11},
    choiceSelected:{borderColor:tokens.accent,backgroundColor:tokens.accentSoft},
    choiceLabel:{color:tokens.text,fontSize:13,fontWeight:'600'},
    choiceSelectedLabel:{color:tokens.accent,fontWeight:'800'},
    score:{borderWidth:1,borderColor:tokens.border,borderRadius:10,minWidth:42,minHeight:42,justifyContent:'center',alignItems:'center'},
    scoreText:{color:tokens.text,fontWeight:'700'},
    input:{borderColor:tokens.border,borderWidth:1,borderRadius:12,padding:12,color:tokens.text,fontSize:15,backgroundColor:tokens.canvas},
    multiline:{minHeight:80,textAlignVertical:'top'},
    primary:{backgroundColor:tokens.header,padding:15,borderRadius:14,alignItems:'center',marginTop:4},
    primaryText:{color:'#FFFFFF',fontWeight:'800',fontSize:15},
    secondary:{padding:8,alignSelf:'flex-start'},
    secondaryText:{color:tokens.accent,fontWeight:'700'},
    smallAction:{paddingHorizontal:11,paddingVertical:8,borderWidth:1,borderRadius:11,borderColor:tokens.border},
    smallActionText:{color:tokens.text,fontWeight:'700',fontSize:13},
    checkbox:{padding:10,borderWidth:1,borderRadius:12,borderColor:tokens.border},
    warning:{padding:12,borderRadius:12,backgroundColor:tokens.accentSoft},
    warningText:{color:tokens.text,fontSize:13,lineHeight:19,fontWeight:'600'},
    series:{paddingVertical:10,borderTopWidth:1,borderTopColor:tokens.border,gap:8},
    barRow:{height:82,flexDirection:'row',alignItems:'flex-end',gap:3},
    bar:{width:7,backgroundColor:tokens.accent,borderRadius:2},
  });
}
