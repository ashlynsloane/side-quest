import type { BodyRegion, EnduranceDiscipline, EnduranceSchedule, EquipmentId, PerformanceGoal, PerformanceGoalType, TrainingBlockPlan, Weekday } from '@circuit/domain';
import { addLocalCalendarDays, buildFirstWeekTrainingSummary, generateTrainingBlock, nextLocalMonday, recommendStrengthDose, type AthleteCapacityProfile } from '@circuit/planner';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen, Surface } from '@/components/v12-ui';
import { ensureDefaultEquipmentProfiles, getPreviousExerciseIds, getRecentRegionExposures, savePerformanceGoal, saveTrainingBlock } from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { useOnboarding } from '@/state/onboarding-context';
import { useTheme } from '@/state/theme-context';
import { refreshLatestWholeAthletePlan } from '@/services/whole-athlete-plan-runtime';
import type { TrainingCalendarEvent } from '@circuit/domain';
import type { AppPalette } from '@/theme';

type Params = { goal?: string; priority?: string; hours?: string; days?: string; equipment?: string; restriction?: string; background?: string; runStatus?: string; injury?: string; strength?: string };
type BuildState = 'building' | 'ready' | 'error';

const WEEKDAYS: Weekday[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

export default function OnboardingFirstWeekScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { exercises } = useExerciseCatalog();
  const { complete } = useOnboarding();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [state, setState] = useState<BuildState>('building');
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enduranceEvents, setEnduranceEvents] = useState<TrainingCalendarEvent[]>([]);
  const [enduranceWarning, setEnduranceWarning] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || exercises.length === 0) return;
    started.current = true;
    void buildFirstWeek(params, exercises).then(async (result) => {
      await savePerformanceGoal(result.goal);
      await saveTrainingBlock(result.block);
      setBlock(result.block);
      // The athlete should see the whole proposed training week, not only
      // strength sessions while endurance silently generates later on Plan focus.
      try {
        const wholeAthlete = await refreshLatestWholeAthletePlan();
        setEnduranceEvents(wholeAthlete?.generatedEvents ?? []);
      } catch (planningError) {
        setEnduranceWarning(planningError instanceof Error ? planningError.message
          : 'Endurance planning is not available; strength draft was saved.');
      }
      await complete();
      setState('ready');
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'The first week could not be generated.');
      setState('error');
    });
  }, [complete, exercises, params]);

  if (state === 'building') return <AppScreen eyebrow="BUILDING YOUR WEEK" title="Making the first draft." subtitle="Using your schedule, equipment, restrictions, and athlete profile."><Surface style={styles.buildCard}>{['Balancing goal and available time','Applying sport-background context','Protecting run progression','Selecting a sustainable strength dose','Preparing the first-week preview'].map((item,index) => <View key={item} style={styles.buildRow}><View style={styles.buildDot}><Text style={styles.buildDotText}>{index < 4 ? '✓' : '…'}</Text></View><Text style={styles.buildText}>{item}</Text></View>)}</Surface></AppScreen>;

  if (state === 'error' || !block) return <AppScreen eyebrow="FIRST DRAFT" title="The week needs one more review." subtitle={error ?? 'The draft could not be generated.'}><Surface style={styles.errorCard}><Text style={styles.errorTitle}>{block
      ? 'The strength plan was saved, but setup could not finish.'
      : 'The first training block could not be saved.'}</Text><Text style={styles.body}>Open the advanced planner to review the detailed inputs, or return and change the fast-start answers.</Text></Surface><Pressable onPress={() => router.replace(`/goal-plan?${new URLSearchParams({ ...params, onboarding: '1' }).toString()}` as Href)} style={styles.primary}><Text style={styles.primaryText}>Open advanced planner</Text><Text style={styles.arrow}>›</Text></Pressable><Pressable onPress={() => router.back()} style={styles.secondary}><Text style={styles.secondaryText}>Back to setup</Text></Pressable></AppScreen>;

  const week = block.weeks[0];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const firstWeek = week ? buildFirstWeekTrainingSummary({
    weekStartDate: week.weekStartDate,
    strengthSessions: week.sessions, generatedEvents: enduranceEvents, timezone,
  }) : null;
  return <AppScreen eyebrow="YOUR FIRST DRAFT" title="Your first week is ready." subtitle="Start here, then let completed training and check-ins improve the next recommendation.">
    <Surface style={styles.summary}><Text style={styles.summaryTitle}>{block.goal.name}</Text><Text style={styles.summaryMeta}>{firstWeek ? `${firstWeek.sessions.length} proposed sessions · ${firstWeek.counts.strength} strength · ${firstWeek.counts.swim} swim · ${firstWeek.counts.bike} bike · ${firstWeek.counts.run} run` : 'Training week unavailable'}</Text><Text style={styles.profileLine}>{profileSummary(params)}</Text><Text style={styles.body}>This is a generated proposal using availability and self-reported context, not an approved increase from measured training history.</Text></Surface>
    <Text style={styles.sectionLabel}>WEEK 1</Text>
    <Surface style={styles.weekCard}>{firstWeek?.days.map((day) => <View key={day.date} style={styles.sessionRow}>
      <View style={styles.dateBadge}><Text style={styles.dateText}>{shortDate(day.date)}</Text></View>
      <View style={styles.sessionCopy}>
        {day.sessions.length ? day.sessions.map((session) =>
          <View key={session.id} style={{ marginBottom: 7 }}>
            <Text style={styles.sessionTitle}>{session.title}</Text>
            <Text style={styles.sessionMeta}>{session.sport} · {session.plannedMinutes === null
              ? 'time not available' : session.plannedMinutes + ' min estimated'} · {session.status}</Text>
          </View>) : <Text style={styles.sessionMeta}>No scheduled workout</Text>}
      </View>
    </View>)}</Surface>
    {enduranceWarning ? <Surface style={styles.errorCard}><Text style={styles.errorTitle}>Endurance calendar needs review</Text><Text style={styles.body}>{enduranceWarning}</Text><Text style={styles.body}>Your strength block was saved. The Week screen can retry the wider plan.</Text></Surface> : null}
    <View style={styles.noteCard}><Text style={styles.sectionLabel}>WHY THIS STARTING POINT</Text><Text style={styles.body}>{rationaleFor(params)}</Text><Text style={styles.body}>This fast-start questionnaire collected availability, not verified completed training. Endurance allocation is provisional; recent running mileage is unknown. The example strength week is not an approved progression or injury clearance.</Text>{params.restriction && params.restriction !== 'none' ? <Text style={styles.body}>A reported limitation still requires review of specific exercises and clinical restrictions before training.</Text> : null}</View>
    <Pressable testID="sidequest-qa-review-first-week" accessibilityRole="button" onPress={() => router.replace('/(tabs)/plan' as Href)} style={styles.primary}><Text style={styles.primaryText}>Review provisional first week</Text><Text style={styles.arrow}>›</Text></Pressable>
    <Pressable onPress={() => router.push(`/goal-plan?${new URLSearchParams({ ...params, onboarding: '1' }).toString()}` as Href)} style={styles.secondary}><Text style={styles.secondaryText}>Advanced edit</Text></Pressable>
  </AppScreen>;
}

async function buildFirstWeek(params: Params, exercises: Parameters<typeof generateTrainingBlock>[1]['exercises']): Promise<{ goal: PerformanceGoal; block: TrainingBlockPlan }> {
  const goalType = parseGoal(params.goal);
  const totalHours = clamp(Number(params.hours) || 10, 3, 25);
  const capacity = buildCapacity(params, totalHours);
  const weeksUntilEvent = goalType === 'general_offseason' ? 0 : 12;
  const recommendation = recommendStrengthDose(capacity, goalType, weeksUntilEvent);
  if (recommendation.validationErrors.length > 0) throw new Error(recommendation.validationErrors[0]);
  const preferredDays = parseDays(params.days);
  const sessionsPerWeek = Math.max(2, Math.min(recommendation.sessionsPerWeek, preferredDays.length)) as 2 | 3 | 4 | 5;
  const now = new Date().toISOString();
  const eventDate = goalType === 'general_offseason' ? undefined : addWeeks(12);
  const goal: PerformanceGoal = {
    id: `goal_${goalType}`,
    type: goalType,
    name: goalType === 'general_offseason' ? goalLabel(goalType) : `${goalLabel(goalType)} · first draft`,
    eventDate,
    weeksUntilEvent,
    disciplines: disciplinesFor(goalType),
    priority: parsePriority(params.priority),
    sessionsPerWeek,
    defaultSessionMinutes: recommendation.sessionMinutes,
    capacityProfile: capacity,
    phaseStrengthSessions: recommendation.phaseSchedule,
    strengthDoseMetadata: { minutesPerWeek: sessionsPerWeek * recommendation.sessionMinutes, minimumEffectiveMinutes: recommendation.minimumEffectiveMinutes, maximumRecommendedMinutes: recommendation.maximumRecommendedMinutes, maxHighLoadStrengthDays: recommendation.maxHighLoadStrengthDays, maxTotalHardDays: recommendation.maxTotalHardDays, sessionRoles: recommendation.sessionRoles.slice(0, sessionsPerWeek) },
    createdAt: now,
    updatedAt: now,
  };
  const profiles = await ensureDefaultEquipmentProfiles();
  const equipment = equipmentFor(params.equipment, profiles);
  const [recentRegionExposures, previousExerciseIds] = await Promise.all([getRecentRegionExposures(), getPreviousExerciseIds()]);
  const result = generateTrainingBlock({ goal, numberOfWeeks: 4, weekStartDate: nextLocalMonday(), availableEquipment: equipment, excludedRegions: excludedRegionsFor(params.restriction), excludedMovementTags: [], regionRestrictions: [], excludedMovementPatterns: [], difficulty: params.strength === 'beginner' ? 'beginner' : params.strength === 'advanced' ? 'advanced' : 'intermediate', preferredStrengthDays: preferredDays, enduranceSchedule: enduranceScheduleFor(goalType), randomSeed: `onboarding-${Date.now()}` }, { exercises, recentRegionExposures, previousExerciseIds });
  if (!result.ok) throw new Error(result.messages.join(' '));
  const block = normalizeBlockSchedule(result.block, preferredDays, sessionsPerWeek);
  return { goal, block };
}


function normalizeBlockSchedule(block: TrainingBlockPlan, preferredDays: Weekday[], sessionsPerWeek: number): TrainingBlockPlan {
  return {
    ...block,
    weeks: block.weeks.map((week) => {
      const sessions = week.sessions.slice(0, sessionsPerWeek).map((session, index) => {
        const weekday = preferredDays[index % preferredDays.length] ?? 'monday';
        return {
          ...session,
          date: addLocalCalendarDays(week.weekStartDate, WEEKDAYS.indexOf(weekday)),
        };
      });
      return { ...week, sessions };
    }),
  };
}

function buildCapacity(params: Params, totalHours: number): AthleteCapacityProfile {
  const background = params.background ?? 'balanced';
  const injury = params.injury ?? 'none';
  const runStatus = params.runStatus === 'reduced' || params.runStatus === 'return_to_run'
    || params.runStatus === 'not_running' ? params.runStatus : 'normal';

  // Fast-start asks about AVAILABLE training hours, not actual completed volume.
  // Reserving some hours for the goal-specific endurance calendar is a SCHEDULING
  // assumption, not a measured baseline and never eligibility for progression.
  const assumedEnduranceAllocation = Math.max(0, totalHours - 3);
  return {
    totalWeeklyHours: totalHours,
    currentEnduranceHours: assumedEnduranceAllocation,
    enduranceHoursEvidence: 'unverified_planning_assumption',
    runStatus,
    // No retrospective running mileage was collected. Previously the code
    // fabricated 15/20/30 mi from background; zero is a conservative legacy
    // numeric placeholder with explicit UNKNOWN evidence, not a zero-mile fact.
    maxRunMilesLast12Weeks: 0,
    runMileageEvidence: 'unknown',
    boneStressInjuryHistory: injury === 'recent_bone_stress'
      ? 'recent_or_current' : injury === 'remote_bone_stress' ? 'remote' : 'none',
    swimProficiency: background === 'swim' ? 'strong'
      : background === 'triathlon' ? 'average' : 'developing',
    bikeProficiency: background === 'bike' ? 'strong'
      : background === 'triathlon' ? 'average' : 'developing',
    runProficiency: background === 'run' ? 'strong'
      : injury === 'recurring_run' || runStatus !== 'normal' ? 'developing'
        : background === 'triathlon' ? 'average' : 'developing',
    strengthExperience: params.strength === 'beginner' || params.strength === 'advanced'
      ? params.strength : 'intermediate',
  };
}

function equipmentFor(value: string | undefined, profiles: Awaited<ReturnType<typeof ensureDefaultEquipmentProfiles>>): EquipmentId[] { if (value === 'bodyweight') return ['bodyweight']; const kind = value === 'full_gym' ? 'full_gym' : value === 'travel' ? 'travel' : 'home'; return profiles.find((profile) => profile.kind === kind)?.equipment ?? profiles.find((profile) => profile.isDefault)?.equipment ?? ['bodyweight']; }
function excludedRegionsFor(value: string | undefined): BodyRegion[] { if (value === 'lower_body') return ['quadriceps','hamstrings','glutes','gastrocnemius','soleus','feet_ankles']; if (value === 'upper_body') return ['chest','shoulders','upper_back','lats','biceps','triceps']; if (value === 'back') return ['lower_back','core_rotation']; return []; }
function parseDays(value: string | undefined): Weekday[] { const values = (value ?? '1,3,5').split(',').map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < 7).map((index) => WEEKDAYS[index]); return [...new Set(values)].length >= 2 ? [...new Set(values)] : ['tuesday','thursday','saturday']; }
function parseGoal(value: string | undefined): PerformanceGoalType { return value === 'triathlon_olympic' || value === 'road_half_marathon' || value === 'road_marathon' || value === 'trail_50k' || value === 'general_offseason' ? value : 'ironman_70_3'; }
function parsePriority(value: string | undefined): PerformanceGoal['priority'] { return value === 'finish' || value === 'race' ? value : 'perform'; }
function disciplinesFor(goal: PerformanceGoalType): EnduranceDiscipline[] { if (goal === 'ironman_70_3' || goal === 'triathlon_olympic') return ['swim','bike','run']; if (goal === 'general_offseason') return []; return ['run']; }
function enduranceScheduleFor(goal: PerformanceGoalType): EnduranceSchedule { return disciplinesFor(goal).includes('swim') ? { keySwim:'tuesday', keyBike:'saturday', keyRun:'sunday' } : disciplinesFor(goal).includes('run') ? { keyRun:'sunday' } : {}; }
function goalLabel(goal: PerformanceGoalType): string { const labels: Record<PerformanceGoalType, string> = { triathlon_sprint:'Sprint triathlon', triathlon_olympic:'Olympic triathlon', ironman_70_3:'Ironman 70.3', ironman_full:'Ironman distance', swimrun:'Swimrun', road_10k:'Road 10K', road_half_marathon:'Half marathon', road_marathon:'Marathon', trail_50k:'Trail 50K', trail_100k:'Trail 100K', swim_speed:'Swim faster', general_offseason:'General strength' }; return labels[goal]; }
function addWeeks(weeks: number): string { const date = new Date(); date.setDate(date.getDate() + weeks * 7); return date.toISOString().slice(0,10); }
function shortDate(value: string): string { const date = new Date(`${value}T12:00:00`); return date.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}); }
function profileSummary(params: Params): string { const background = params.background === 'swim' ? 'swim-strong' : params.background === 'bike' ? 'bike-strong' : params.background === 'run' ? 'run-strong' : params.background === 'triathlon' ? 'triathlon background' : 'mixed / newer background'; const run = params.runStatus === 'not_running' ? 'not currently running' : params.runStatus === 'return_to_run' ? 'returning to run' : params.runStatus === 'reduced' ? 'reduced running' : 'running normally'; return `${background} · ${run}`; }
function rationaleFor(params: Params): string { if (params.injury === 'recent_bone_stress') return 'The starting dose preserves direct strength while using conservative lower-body progression because you reported a recent bone-stress concern.'; if (params.injury === 'recurring_run' || params.runStatus === 'return_to_run' || params.runStatus === 'not_running') return 'The starting dose treats running durability and impact tolerance as developing, rather than assuming endurance experience transfers evenly across sports.'; if (params.background === 'swim') return 'Your swim background is treated as real experience, while run and impact progression remain separate planning dimensions.'; if (params.background === 'triathlon') return 'Your multisport background is treated as experience across swim, bike, and run, while current run status and injury history still control progression.'; return 'The first draft uses your available time and current context without pretending it already knows your full training history.'; }
function clamp(value: number,min: number,max: number){return Math.max(min,Math.min(max,value));}

function makeStyles(palette: AppPalette){return StyleSheet.create({buildCard:{padding:20,gap:16},buildRow:{flexDirection:'row',alignItems:'center',gap:12},buildDot:{width:30,height:30,borderRadius:15,backgroundColor:palette.mint,alignItems:'center',justifyContent:'center'},buildDotText:{fontWeight:'900',color:palette.forest},buildText:{fontSize:16,fontWeight:'800',color:palette.ink,flex:1},summary:{padding:20,gap:7},summaryTitle:{fontSize:22,lineHeight:27,fontWeight:'900',color:palette.ink},summaryMeta:{fontSize:15,color:palette.inkMuted},profileLine:{fontSize:13,fontWeight:'800',color:palette.forest,marginTop:4},sectionLabel:{fontSize:11.5,lineHeight:15,fontWeight:'900',letterSpacing:1.3,color:palette.forest},weekCard:{padding:0,overflow:'hidden'},sessionRow:{flexDirection:'row',alignItems:'center',gap:13,padding:16,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:palette.border},dateBadge:{width:62,paddingVertical:9,borderRadius:14,backgroundColor:palette.mint,alignItems:'center'},dateText:{fontSize:12,fontWeight:'900',color:palette.forest},sessionCopy:{flex:1},sessionTitle:{fontSize:16,fontWeight:'900',color:palette.ink},sessionMeta:{fontSize:13,color:palette.inkMuted,marginTop:3},noteCard:{padding:18,borderRadius:20,backgroundColor:palette.mint,gap:8},body:{fontSize:14.5,lineHeight:21,color:palette.inkMuted},primary:{minHeight:60,borderRadius:18,backgroundColor:palette.forest,paddingHorizontal:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},primaryText:{fontSize:17,fontWeight:'900',color:palette.white},arrow:{fontSize:29,color:palette.white},secondary:{minHeight:54,borderRadius:18,borderWidth:1.5,borderColor:palette.forest,alignItems:'center',justifyContent:'center'},secondaryText:{fontSize:15,fontWeight:'900',color:palette.forest},errorCard:{padding:20,gap:8},errorTitle:{fontSize:19,fontWeight:'900',color:palette.ink}})}
