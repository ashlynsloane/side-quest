import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen, Surface } from '@/components/v12-ui';
import { useOnboarding } from '@/state/onboarding-context';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { type AppPalette } from '@/theme';

type Step = 'welcome' | 'goal' | 'schedule' | 'equipment' | 'restrictions' | 'profile' | 'review';
type GoalChoice = 'ironman_70_3' | 'triathlon_olympic' | 'road_half_marathon' | 'road_marathon' | 'trail_50k' | 'general_offseason';
type PriorityChoice = 'finish' | 'perform' | 'race';
type EquipmentChoice = 'home' | 'full_gym' | 'travel' | 'bodyweight';
type RestrictionChoice = 'none' | 'lower_body' | 'upper_body' | 'back' | 'other';
type BackgroundChoice = 'swim' | 'bike' | 'run' | 'triathlon' | 'balanced';
type RunStatusChoice = 'normal' | 'reduced' | 'return_to_run' | 'not_running';
type InjuryChoice = 'none' | 'remote_bone_stress' | 'recent_bone_stress' | 'recurring_run';
type StrengthChoice = 'beginner' | 'intermediate' | 'advanced';

const STEPS: Step[] = ['welcome', 'goal', 'schedule', 'equipment', 'restrictions', 'profile', 'review'];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const GOALS: Array<{ id: GoalChoice; label: string; detail: string }> = [
  { id: 'ironman_70_3', label: 'Ironman 70.3', detail: 'Long-course swim, bike, and run.' },
  { id: 'triathlon_olympic', label: 'Olympic triathlon', detail: 'Balanced short-course multisport.' },
  { id: 'road_half_marathon', label: 'Half marathon', detail: 'Running economy and durability.' },
  { id: 'road_marathon', label: 'Marathon', detail: 'High-mileage durability and strength.' },
  { id: 'trail_50k', label: 'Trail / ultra', detail: 'Climbing, descending, and trail control.' },
  { id: 'general_offseason', label: 'General strength', detail: 'Build strength without a race date.' },
];

type OnboardingDraft = { step: Step; goal: GoalChoice; priority: PriorityChoice; hours: number; days: number[]; equipment: EquipmentChoice; restriction: RestrictionChoice; background: BackgroundChoice; runStatus: RunStatusChoice; injury: InjuryChoice; strength: StrengthChoice };
const DRAFT_KEY = 'sidequest.onboarding.first-week-draft.v1';
type DraftStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
const draftStorage = (globalThis as typeof globalThis & { localStorage?: DraftStorage }).localStorage;
function loadDraft(key: string): Partial<OnboardingDraft> { try { const raw = draftStorage?.getItem(key); return raw ? JSON.parse(raw) as Partial<OnboardingDraft> : {}; } catch { return {}; } }
function saveDraft(key: string, draft: OnboardingDraft): void { try { draftStorage?.setItem(key, JSON.stringify(draft)); } catch { /* setup can still continue without persistence */ } }

export default function OnboardingScreen() {
  const router = useRouter();
  const { acknowledgeStrengthModel, acknowledgePrivacyModel } = useOnboarding();
  const { user } = useAuth();
  const draftKey = `${DRAFT_KEY}.${user?.id ?? 'guest'}`;
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const initialDraft = useMemo(() => loadDraft(draftKey), [draftKey]);
  const [step, setStep] = useState<Step>(initialDraft.step ?? 'welcome');
  const [goal, setGoal] = useState<GoalChoice>(initialDraft.goal ?? 'ironman_70_3');
  const [priority, setPriority] = useState<PriorityChoice>(initialDraft.priority ?? 'perform');
  const [hours, setHours] = useState(initialDraft.hours ?? 10);
  const [days, setDays] = useState<number[]>(initialDraft.days ?? [1, 3, 5]);
  const [equipment, setEquipment] = useState<EquipmentChoice>(initialDraft.equipment ?? 'home');
  const [restriction, setRestriction] = useState<RestrictionChoice>(initialDraft.restriction ?? 'none');
  const [background, setBackground] = useState<BackgroundChoice>(initialDraft.background ?? 'balanced');
  const [runStatus, setRunStatus] = useState<RunStatusChoice>(initialDraft.runStatus ?? 'normal');
  const [injury, setInjury] = useState<InjuryChoice>(initialDraft.injury ?? 'none');
  const [strength, setStrength] = useState<StrengthChoice>(initialDraft.strength ?? 'intermediate');

  useEffect(() => { saveDraft(draftKey, { step, goal, priority, hours, days, equipment, restriction, background, runStatus, injury, strength }); }, [draftKey, step, goal, priority, hours, days, equipment, restriction, background, runStatus, injury, strength]);

  const stepIndex = STEPS.indexOf(step);
  const progress = Math.max(0, stepIndex) / (STEPS.length - 1);

  function next() {
    if (step === 'welcome') {
      acknowledgeStrengthModel(true);
      acknowledgePrivacyModel(true);
    }
    setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)] ?? 'review');
  }
  function back() {
    if (step === 'welcome') { router.back(); return; }
    setStep(STEPS[Math.max(stepIndex - 1, 0)] ?? 'welcome');
  }
  function toggleDay(index: number) {
    setDays((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort());
  }
  function finish() {
    const query = new URLSearchParams({
      goal, priority, hours: String(hours), days: days.join(','), equipment, restriction,
      background, runStatus, injury, strength,
    });
    router.replace(`/onboarding-first-week?${query.toString()}` as Href);
  }

  return <AppScreen eyebrow={`STEP ${stepIndex + 1} OF ${STEPS.length}`} title={titleFor(step)} subtitle={subtitleFor(step)}>
    <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(8, progress * 100)}%` }]} /></View>
    {step === 'welcome' ? <Welcome styles={styles} /> : null}
    {step === 'goal' ? <GoalStep goal={goal} priority={priority} setGoal={setGoal} setPriority={setPriority} styles={styles} /> : null}
    {step === 'schedule' ? <ScheduleStep hours={hours} setHours={setHours} days={days} toggleDay={toggleDay} styles={styles} /> : null}
    {step === 'equipment' ? <EquipmentStep value={equipment} setValue={setEquipment} styles={styles} /> : null}
    {step === 'restrictions' ? <RestrictionsStep value={restriction} setValue={setRestriction} styles={styles} /> : null}
    {step === 'profile' ? <ProfileStep background={background} setBackground={setBackground} runStatus={runStatus} setRunStatus={setRunStatus} injury={injury} setInjury={setInjury} strength={strength} setStrength={setStrength} styles={styles} /> : null}
    {step === 'review' ? <Review goal={goal} priority={priority} hours={hours} days={days} equipment={equipment} restriction={restriction} background={background} runStatus={runStatus} injury={injury} strength={strength} styles={styles} /> : null}
    <View style={styles.actions}>
      <Pressable onPress={back} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>{step === 'welcome' ? 'Not now' : 'Back'}</Text></Pressable>
      <Pressable disabled={step === 'schedule' && days.length < 2} onPress={step === 'review' ? finish : next} style={({ pressed }) => [styles.primary, step === 'schedule' && days.length < 2 && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.primaryText}>{step === 'review' ? 'Build my first week' : step === 'welcome' ? 'Start setup' : 'Continue'}</Text><Text style={styles.arrow}>›</Text>
      </Pressable>
    </View>
  </AppScreen>;
}

function Welcome({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return <Surface style={styles.hero}><Text style={styles.kicker}>FAST START + ATHLETE CONTEXT</Text><Text style={styles.heroTitle}>Build a useful first week without flattening your training history.</Text><View style={styles.promiseList}>{['Goal, priority, and real availability', 'Equipment and current restrictions', 'Sport background and run status', 'Injury patterns that should change progression'].map((item, index) => <View key={item} style={styles.promiseRow}><View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View><Text style={styles.promiseText}>{item}</Text></View>)}</View><Text style={styles.note}>This creates a conservative first draft. Connected training history makes later recommendations more precise.</Text></Surface>;
}

function GoalStep({ goal, priority, setGoal, setPriority, styles }: { goal: GoalChoice; priority: PriorityChoice; setGoal: (v: GoalChoice) => void; setPriority: (v: PriorityChoice) => void; styles: ReturnType<typeof makeStyles> }) {
  return <><Text style={styles.sectionLabel}>WHAT ARE YOU TRAINING FOR?</Text><View style={styles.choiceGrid}>{GOALS.map((item) => <Choice key={item.id} selected={goal === item.id} title={item.label} detail={item.detail} onPress={() => setGoal(item.id)} styles={styles} />)}</View><Text style={styles.sectionLabel}>RACE PRIORITY</Text><View style={styles.segmentRow}>{([['finish','C · Finish well'],['perform','B · Perform'],['race','A · Race all-out']] as const).map(([id,label]) => <Pressable key={id} onPress={() => setPriority(id)} style={[styles.segment, priority === id && styles.segmentActive]}><Text style={[styles.segmentText, priority === id && styles.segmentTextActive]}>{label}</Text></Pressable>)}</View></>;
}

function ScheduleStep({ hours, setHours, days, toggleDay, styles }: { hours: number; setHours: (v: number) => void; days: number[]; toggleDay: (v: number) => void; styles: ReturnType<typeof makeStyles> }) {
  return <><Surface style={styles.focusCard}><Text style={styles.bigNumber}>{hours}</Text><Text style={styles.bigUnit}>total training hours available each week</Text><View style={styles.stepper}><Pressable onPress={() => setHours(Math.max(3, hours - 1))} style={styles.stepperButton}><Text style={styles.stepperText}>−</Text></Pressable><Pressable onPress={() => setHours(Math.min(25, hours + 1))} style={styles.stepperButton}><Text style={styles.stepperText}>+</Text></Pressable></View></Surface><Text style={styles.sectionLabel}>DAYS STRENGTH COULD FIT</Text><View style={styles.dayRow}>{DAYS.map((label,index) => <Pressable key={`${label}-${index}`} onPress={() => toggleDay(index)} style={[styles.day, days.includes(index) && styles.dayActive]}><Text style={[styles.dayText, days.includes(index) && styles.dayTextActive]}>{label}</Text></Pressable>)}</View><Text style={styles.helper}>Choose at least two realistic options. Side Quest may schedule fewer sessions than the number of days you select.</Text></>;
}

function EquipmentStep({ value, setValue, styles }: { value: EquipmentChoice; setValue: (v: EquipmentChoice) => void; styles: ReturnType<typeof makeStyles> }) {
  const options: Array<[EquipmentChoice,string,string]> = [['home','Home setup','Bodyweight, bands, small tools, and the weights you own.'],['full_gym','Full gym','Free weights, cables, machines, benches, and pull-up options.'],['travel','Hotel / travel','Portable tools and whatever is available temporarily.'],['bodyweight','Bodyweight only','No equipment required.']];
  return <View style={styles.choiceGrid}>{options.map(([id,title,detail]) => <Choice key={id} selected={value === id} title={title} detail={detail} onPress={() => setValue(id)} styles={styles} />)}<Text style={styles.helper}>Exact weights and individual equipment can be refined after the first draft.</Text></View>;
}

function RestrictionsStep({ value, setValue, styles }: { value: RestrictionChoice; setValue: (v: RestrictionChoice) => void; styles: ReturnType<typeof makeStyles> }) {
  const options: Array<[RestrictionChoice,string,string]> = [['none','Nothing to protect today','Build normally and let me add details later.'],['lower_body','Lower body','Use a conservative lower-body and impact filter.'],['upper_body','Upper body','Reduce pressing, pulling, and overhead exposure.'],['back','Back or trunk','Reduce provocative trunk loading.'],['other','Something else','Create the draft, then refine the restriction before training.']];
  return <View style={styles.choiceGrid}>{options.map(([id,title,detail]) => <Choice key={id} selected={value === id} title={title} detail={detail} onPress={() => setValue(id)} styles={styles} />)}<Text style={styles.note}>This is a temporary planning filter, not a diagnosis or medical clearance.</Text></View>;
}

function ProfileStep({ background, setBackground, runStatus, setRunStatus, injury, setInjury, strength, setStrength, styles }: { background: BackgroundChoice; setBackground: (v: BackgroundChoice) => void; runStatus: RunStatusChoice; setRunStatus: (v: RunStatusChoice) => void; injury: InjuryChoice; setInjury: (v: InjuryChoice) => void; strength: StrengthChoice; setStrength: (v: StrengthChoice) => void; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.profileStack}>
    <CompactChoiceGroup title="DEEPEST SPORT BACKGROUND" value={background} setValue={setBackground} options={[['swim','Swimming'],['bike','Cycling'],['run','Running'],['triathlon','Triathlon / multisport'],['balanced','Mixed / newer to all']]} styles={styles} />
    <CompactChoiceGroup title="CURRENT RUN STATUS" value={runStatus} setValue={setRunStatus} options={[['normal','Running normally'],['reduced','Running less than usual'],['return_to_run','Returning to running'],['not_running','Not currently running']]} styles={styles} />
    <CompactChoiceGroup title="INJURY PATTERN" value={injury} setValue={setInjury} options={[['none','No recurring pattern'],['remote_bone_stress','Past bone-stress injury'],['recent_bone_stress','Recent/current bone-stress concern'],['recurring_run','Running injuries recur with load']]} styles={styles} />
    <CompactChoiceGroup title="STRENGTH EXPERIENCE" value={strength} setValue={setStrength} options={[['beginner','New'],['intermediate','Some experience'],['advanced','Experienced']]} styles={styles} />
    <Text style={styles.note}>This profile changes the starting dose. It does not diagnose injury risk.</Text>
  </View>;
}

function CompactChoiceGroup<T extends string>({ title, value, setValue, options, styles }: { title: string; value: T; setValue: (v: T) => void; options: Array<readonly [T,string]>; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.compactGroup}><Text style={styles.sectionLabel}>{title}</Text><View style={styles.chipWrap}>{options.map(([id,label]) => <Pressable key={id} onPress={() => setValue(id)} style={[styles.chip, value === id && styles.chipActive]}><Text style={[styles.chipText, value === id && styles.chipTextActive]}>{label}</Text></Pressable>)}</View></View>;
}

function Review({ goal, priority, hours, days, equipment, restriction, background, runStatus, injury, strength, styles }: { goal: GoalChoice; priority: PriorityChoice; hours: number; days: number[]; equipment: EquipmentChoice; restriction: RestrictionChoice; background: BackgroundChoice; runStatus: RunStatusChoice; injury: InjuryChoice; strength: StrengthChoice; styles: ReturnType<typeof makeStyles> }) {
  const goalLabel = GOALS.find((item) => item.id === goal)?.label ?? goal;
  const rows = [
    ['Goal', `${goalLabel} · ${priority === 'race' ? 'A' : priority === 'perform' ? 'B' : 'C'} priority`],
    ['Capacity', `${hours} hr/week · ${days.map((d) => DAYS[d]).join(' · ')}`],
    ['Setup', `${labelize(equipment)} · ${restriction === 'none' ? 'No restriction selected' : labelize(restriction)}`],
    ['Athlete profile', `${labelize(background)} background · ${labelize(runStatus)}`],
    ['Progression context', `${labelize(injury)} · ${labelize(strength)} strength`],
  ];
  return <><Surface style={styles.reviewCard}>{rows.map(([label,value]) => <View key={label} style={styles.reviewRow}><Text style={styles.reviewLabel}>{label}</Text><Text style={styles.reviewValue}>{value}</Text></View>)}</Surface><View style={styles.payoff}><Text style={styles.kicker}>NEXT</Text><Text style={styles.payoffTitle}>Side Quest will generate the first draft directly.</Text><Text style={styles.helper}>You will see the first week before entering the rest of the app. The full planner remains available as an advanced edit path.</Text></View></>;
}

function Choice({ selected, title, detail, onPress, styles }: { selected: boolean; title: string; detail: string; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, selected && styles.choiceActive, pressed && styles.pressed]}><View style={[styles.radio, selected && styles.radioActive]}>{selected ? <Text style={styles.radioCheck}>✓</Text> : null}</View><View style={{ flex: 1 }}><Text style={styles.choiceTitle}>{title}</Text><Text style={styles.choiceDetail}>{detail}</Text></View></Pressable>;
}
function titleFor(step: Step) { return ({ welcome:'Build your first week.', goal:'Choose the goal.', schedule:'Use the time you actually have.', equipment:'What is available now?', restrictions:'Anything to protect?', profile:'How do you respond to training?', review:'Ready to build.' } as const)[step]; }
function subtitleFor(step: Step) { return ({ welcome:'A fast start with one layer of athlete context.', goal:'The goal and priority shape the strength dose.', schedule:'Availability is a constraint, not a test.', equipment:'Start broad. Exact loads can come later.', restrictions:'Keep unrelated training available whenever possible.', profile:'Enough nuance to avoid treating every endurance athlete the same.', review:'The next screen is the generated first-week preview.' } as const)[step]; }
function labelize(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()); }

function makeStyles(palette: AppPalette) { return StyleSheet.create({
  progressTrack:{height:5,borderRadius:999,backgroundColor:palette.border,overflow:'hidden'}, progressFill:{height:'100%',borderRadius:999,backgroundColor:palette.forest},
  hero:{padding:22,gap:16}, kicker:{fontSize:11,lineHeight:15,fontWeight:'900',letterSpacing:1.4,color:palette.forest}, heroTitle:{fontSize:23,lineHeight:29,fontWeight:'900',color:palette.ink}, promiseList:{gap:12}, promiseRow:{flexDirection:'row',alignItems:'center',gap:12}, number:{width:30,height:30,borderRadius:10,backgroundColor:palette.mint,alignItems:'center',justifyContent:'center'},numberText:{fontWeight:'900',color:palette.forest},promiseText:{fontSize:15.5,fontWeight:'800',color:palette.ink,flex:1},note:{fontSize:13.5,lineHeight:19,color:palette.inkMuted,fontStyle:'italic'},
  sectionLabel:{fontSize:12,lineHeight:16,fontWeight:'900',letterSpacing:1.25,color:palette.forest,marginTop:2}, choiceGrid:{gap:10}, choice:{minHeight:76,borderWidth:1.5,borderColor:palette.border,borderRadius:18,padding:15,flexDirection:'row',alignItems:'center',gap:13,backgroundColor:palette.white},choiceActive:{borderColor:palette.forest,backgroundColor:palette.mint},radio:{width:27,height:27,borderRadius:14,borderWidth:1.5,borderColor:palette.border,alignItems:'center',justifyContent:'center'},radioActive:{backgroundColor:palette.forest,borderColor:palette.forest},radioCheck:{color:palette.white,fontWeight:'900'},choiceTitle:{fontSize:16,lineHeight:20,fontWeight:'900',color:palette.ink},choiceDetail:{fontSize:13,lineHeight:18,color:palette.inkMuted,marginTop:3},
  segmentRow:{flexDirection:'row',gap:8},segment:{flex:1,minHeight:54,borderWidth:1.5,borderColor:palette.border,borderRadius:16,alignItems:'center',justifyContent:'center',paddingHorizontal:8},segmentActive:{backgroundColor:palette.forest,borderColor:palette.forest},segmentText:{fontSize:12.5,fontWeight:'900',color:palette.ink,textAlign:'center'},segmentTextActive:{color:palette.white},
  focusCard:{padding:22,alignItems:'center'},bigNumber:{fontSize:64,lineHeight:70,fontWeight:'900',color:palette.ink},bigUnit:{fontSize:15,color:palette.inkMuted,textAlign:'center'},stepper:{flexDirection:'row',gap:14,marginTop:18},stepperButton:{width:62,height:48,borderRadius:16,borderWidth:1.5,borderColor:palette.forest,alignItems:'center',justifyContent:'center'},stepperText:{fontSize:30,lineHeight:32,fontWeight:'600',color:palette.forest},dayRow:{flexDirection:'row',justifyContent:'space-between'},day:{width:40,height:40,borderRadius:20,borderWidth:1.5,borderColor:palette.border,alignItems:'center',justifyContent:'center'},dayActive:{backgroundColor:palette.forest,borderColor:palette.forest},dayText:{fontWeight:'900',color:palette.inkMuted},dayTextActive:{color:palette.white},helper:{fontSize:13.5,lineHeight:19,color:palette.inkMuted},
  profileStack:{gap:18},compactGroup:{gap:9},chipWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{paddingHorizontal:13,paddingVertical:10,borderRadius:999,borderWidth:1.5,borderColor:palette.border,backgroundColor:palette.white},chipActive:{backgroundColor:palette.forest,borderColor:palette.forest},chipText:{fontSize:13,fontWeight:'800',color:palette.ink},chipTextActive:{color:palette.white},
  reviewCard:{padding:0,overflow:'hidden'},reviewRow:{paddingHorizontal:18,paddingVertical:14,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:palette.border,gap:5},reviewLabel:{fontSize:12.5,color:palette.inkMuted},reviewValue:{fontSize:14,fontWeight:'900',color:palette.ink},payoff:{padding:18,borderRadius:20,backgroundColor:palette.mint,borderWidth:1,borderColor:palette.border,gap:6},payoffTitle:{fontSize:20,lineHeight:25,fontWeight:'900',color:palette.ink},
  actions:{flexDirection:'row',gap:10,marginTop:4},secondary:{minHeight:58,paddingHorizontal:18,borderRadius:18,borderWidth:1.5,borderColor:palette.forest,alignItems:'center',justifyContent:'center'},secondaryText:{fontSize:15,fontWeight:'900',color:palette.forest},primary:{flex:1,minHeight:58,borderRadius:18,backgroundColor:palette.forest,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},primaryText:{fontSize:16,fontWeight:'900',color:palette.white},arrow:{fontSize:29,lineHeight:29,color:palette.white},pressed:{opacity:.72},disabled:{opacity:.42},
}); }
