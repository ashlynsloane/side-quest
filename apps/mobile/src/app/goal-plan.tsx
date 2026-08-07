import { equipmentSeed } from '@circuit/exercise-content';
import type {
  BodyRegion,
  EnduranceDiscipline,
  EnduranceSchedule,
  EquipmentId,
  GoalTerrain,
  PerformanceGoal,
  PerformanceGoalType,
  PTProfile,
  TrainingBlockLength,
  TrainingBlockPlan,
  TrainingCheckIn,
  TrainingCalendarEvent,
  WorkoutVariantLevel,
  Weekday,
  WeeklyTrainingPlan,
} from '@circuit/domain';
import { createWorkoutVariant } from '@circuit/generator';
import { adaptTrainingBlock, generateTrainingBlock, recommendStrengthDose, type AthleteCapacityProfile } from '@circuit/planner';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DEFAULT_EQUIPMENT } from '@/features/generate/default-request';
import { suggestEnduranceSchedule } from '@/services/calendar-sync';
import {
  getActiveTrainingCheckIn,
  getLatestPerformanceGoal,
  getLatestPTProfile,
  getLatestTrainingBlock,
  getTrainingCalendarEvents,
  getPreviousExerciseIds,
  getRecentRegionExposures,
  ensureDefaultEquipmentProfiles,
  deleteCurrentGoalPlan,
  savePerformanceGoal,
  saveTrainingBlock,
  type EquipmentProfile,
} from '@/services/database';
import { useExerciseCatalog } from '@/services/exercise-catalog';
import { useWorkoutContext } from '@/state/workout-context';

type GoalOption = {
  type: PerformanceGoalType;
  label: string;
  description: string;
  defaultWeeks: number;
  disciplines: EnduranceDiscipline[];
};

const GOAL_GROUPS: Array<{ title: string; options: GoalOption[] }> = [
  {
    title: 'Triathlon + multisport',
    options: [
      {
        type: 'triathlon_sprint',
        label: 'Sprint triathlon',
        description: 'Short-course power, swim support, and fast running off the bike.',
        defaultWeeks: 10,
        disciplines: ['swim', 'bike', 'run'],
      },
      {
        type: 'triathlon_olympic',
        label: 'Olympic triathlon',
        description: 'Balanced swim-bike-run strength with greater endurance than sprint distance.',
        defaultWeeks: 12,
        disciplines: ['swim', 'bike', 'run'],
      },
      {
        type: 'ironman_70_3',
        label: 'Ironman 70.3',
        description: 'Long-course swim, bike, and run durability with balanced strength support.',
        defaultWeeks: 12,
        disciplines: ['swim', 'bike', 'run'],
      },
      {
        type: 'ironman_full',
        label: 'Ironman distance',
        description: 'Postural, posterior-chain, and lower-leg durability for full-distance racing.',
        defaultWeeks: 20,
        disciplines: ['swim', 'bike', 'run'],
      },
      {
        type: 'swimrun',
        label: 'Swimrun',
        description: 'Repeated open-water swims and trail runs with transition durability.',
        defaultWeeks: 16,
        disciplines: ['swim', 'run'],
      },
    ],
  },
  {
    title: 'Road running',
    options: [
      {
        type: 'road_10k',
        label: 'Road 10K',
        description: 'Running force, single-leg control, calves, and speed support.',
        defaultWeeks: 10,
        disciplines: ['run'],
      },
      {
        type: 'road_half_marathon',
        label: 'Road half marathon',
        description: 'Running economy, lower-leg capacity, and sustained single-leg strength.',
        defaultWeeks: 12,
        disciplines: ['run'],
      },
      {
        type: 'road_marathon',
        label: 'Road marathon',
        description: 'Posterior-chain, calf, and trunk durability for high cumulative mileage.',
        defaultWeeks: 16,
        disciplines: ['run'],
      },
    ],
  },
  {
    title: 'Trail + ultra',
    options: [
      {
        type: 'trail_50k',
        label: 'Trail 50K',
        description: 'Climbing, descending, ankle control, and long-duration trail durability.',
        defaultWeeks: 16,
        disciplines: ['run'],
      },
      {
        type: 'trail_100k',
        label: 'Trail 100K',
        description: 'Ultra-distance climbing, descending, foot-ankle control, and postural durability.',
        defaultWeeks: 24,
        disciplines: ['run'],
      },
    ],
  },
  {
    title: 'Performance + general strength',
    options: [
      {
        type: 'swim_speed',
        label: 'Swim faster',
        description: 'Lats, upper back, scapular control, trunk stiffness, and power.',
        defaultWeeks: 10,
        disciplines: ['swim'],
      },
      {
        type: 'general_offseason',
        label: 'Offseason strength',
        description: 'Heavier, broader strength development without a near-term race.',
        defaultWeeks: 0,
        disciplines: [],
      },
    ],
  },
];

const ALL_GOAL_OPTIONS = GOAL_GROUPS.flatMap((group) => group.options);
const PLAN_LENGTHS: TrainingBlockLength[] = [1, 2, 4, 8, 12];

const QUICK_EQUIPMENT: EquipmentId[] = [
  'dumbbell',
  'kettlebell',
  'long_band',
  'mini_band',
  'bench',
  'box',
  'bosu',
];

const WEEKDAYS: Array<{ id: Weekday; short: string; label: string }> = [
  { id: 'monday', short: 'Mon', label: 'Monday' },
  { id: 'tuesday', short: 'Tue', label: 'Tuesday' },
  { id: 'wednesday', short: 'Wed', label: 'Wednesday' },
  { id: 'thursday', short: 'Thu', label: 'Thursday' },
  { id: 'friday', short: 'Fri', label: 'Friday' },
  { id: 'saturday', short: 'Sat', label: 'Saturday' },
  { id: 'sunday', short: 'Sun', label: 'Sunday' },
];

const TERRAIN_OPTIONS: Array<{ id: GoalTerrain; label: string }> = [
  { id: 'flat', label: 'Flat' },
  { id: 'rolling', label: 'Rolling' },
  { id: 'hilly', label: 'Hilly' },
  { id: 'mountainous', label: 'Mountainous' },
  { id: 'technical_trail', label: 'Technical trail' },
];

export default function GoalPlanScreen() {
  const { exercises } = useExerciseCatalog();
  const onboardingParams = useLocalSearchParams<{ onboarding?: string; goal?: string; priority?: string; hours?: string; days?: string; equipment?: string; restriction?: string }>();
  const fromOnboarding = onboardingParams.onboarding === '1';

  const router = useRouter();
  const { setPreviewWorkout, beginWorkout } = useWorkoutContext();
  const [goalType, setGoalType] = useState<PerformanceGoalType>(() => isGoalType(onboardingParams.goal) ? onboardingParams.goal : 'ironman_70_3');
  const [eventDateText, setEventDateText] = useState(() => dateFromWeeks(12));
  const [priority, setPriority] = useState<PerformanceGoal['priority']>(() => isPriority(onboardingParams.priority) ? onboardingParams.priority : 'perform');
  const [terrain, setTerrain] = useState<GoalTerrain>('rolling');
  const [capacity, setCapacity] = useState<AthleteCapacityProfile>({ totalWeeklyHours: parseHours(onboardingParams.hours), currentEnduranceHours: Math.max(0, parseHours(onboardingParams.hours) - 4), runStatus: 'normal', maxRunMilesLast12Weeks: 20, boneStressInjuryHistory: 'none', swimProficiency: 'average', bikeProficiency: 'average', runProficiency: 'average', strengthExperience: 'intermediate' });
  const [planLength, setPlanLength] = useState<TrainingBlockLength>(4);
  const [equipment, setEquipment] = useState<EquipmentId[]>(DEFAULT_EQUIPMENT);
  const [equipmentProfiles, setEquipmentProfiles] = useState<EquipmentProfile[]>([]);
  const [selectedEquipmentProfileId, setSelectedEquipmentProfileId] = useState<string | null>(null);
  const [preferredStrengthDays, setPreferredStrengthDays] = useState<Weekday[]>(() => parsePreferredDays(onboardingParams.days));
  const [enduranceSchedule, setEnduranceSchedule] = useState<EnduranceSchedule>({
    keySwim: 'tuesday',
    keyBike: 'saturday',
    keyRun: 'sunday',
  });
  const [ptProfile, setPTProfile] = useState<PTProfile | null>(null);
  const [activeCheckIn, setActiveCheckIn] = useState<TrainingCheckIn | null>(null);
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAdvancedCapacity, setShowAdvancedCapacity] = useState(false);
  const [showPlanningRationale, setShowPlanningRationale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<TrainingCalendarEvent[]>([]);

  const equipmentLabels = useMemo(
    () => new Map(equipmentSeed.map((item) => [item.id, item.label])),
    [],
  );

  const selectedGoal = goalOption(goalType);
  const disciplines = selectedGoal.disciplines;
  const computedWeeks = goalType === 'general_offseason' ? 0 : weeksUntilDate(eventDateText);
  const strengthRecommendation = useMemo(() => recommendStrengthDose(capacity, goalType, computedWeeks ?? 0), [capacity, goalType, computedWeeks]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void Promise.all([
      getLatestPerformanceGoal(),
      getLatestTrainingBlock(),
      getLatestPTProfile(),
      getActiveTrainingCheckIn(),
      getTrainingCalendarEvents({
        from: new Date().toISOString(),
        to: new Date(Date.now() + 21 * 86_400_000).toISOString(),
      }),
      ensureDefaultEquipmentProfiles(),
    ]).then(([goal, savedBlock, savedPTProfile, savedCheckIn, savedCalendarEvents, savedEquipmentProfiles]) => {
      if (cancelled) return;
      if (goal && !fromOnboarding) {
        setGoalType(goal.type);
        setEventDateText(goal.eventDate ?? dateFromWeeks(goal.weeksUntilEvent));
        setPriority(goal.priority);
        setTerrain(goal.terrain ?? defaultTerrain(goal.type));
        if (goal.capacityProfile) setCapacity(goal.capacityProfile);
      }
      if (savedBlock) {
        setBlock(savedBlock.block);
        setPlanLength(savedBlock.block.numberOfWeeks);
        setSelectedWeekIndex(0);
      }
      setPTProfile(savedPTProfile);
      setActiveCheckIn(savedCheckIn);
      setCalendarEvents(savedCalendarEvents);
      setEquipmentProfiles(savedEquipmentProfiles);
      const requestedKind = onboardingParams.equipment === 'full_gym' ? 'full_gym' : onboardingParams.equipment === 'travel' ? 'travel' : onboardingParams.equipment === 'home' ? 'home' : null;
      const requestedProfile = requestedKind ? savedEquipmentProfiles.find((profile) => profile.kind === requestedKind) : null;
      const defaultProfile = requestedProfile ?? savedEquipmentProfiles.find((profile) => profile.isDefault) ?? savedEquipmentProfiles[0];
      if (onboardingParams.equipment === 'bodyweight' && !savedBlock) { setSelectedEquipmentProfileId(null); setEquipment(['bodyweight']); }
      else if (defaultProfile && !savedBlock) { setSelectedEquipmentProfileId(defaultProfile.id); setEquipment(defaultProfile.equipment); }
    });
    return () => {
      cancelled = true;
    };
  }, [fromOnboarding, onboardingParams.equipment]));

  function chooseGoal(type: PerformanceGoalType) {
    setGoalType(type);
    const option = goalOption(type);
    if (type !== 'general_offseason') setEventDateText(dateFromWeeks(option.defaultWeeks));
    setTerrain(defaultTerrain(type));
    setEnduranceSchedule((current) => ({
      keySwim: option.disciplines.includes('swim') ? current.keySwim ?? 'tuesday' : null,
      keyBike: option.disciplines.includes('bike') ? current.keyBike ?? 'saturday' : null,
      keyRun: option.disciplines.includes('run') ? current.keyRun ?? 'sunday' : null,
    }));
  }

  function toggleEquipment(id: EquipmentId) {
    setSelectedEquipmentProfileId(null);
    setEquipment((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function togglePreferredDay(day: Weekday) {
    setPreferredStrengthDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  function setDisciplineDay(discipline: EnduranceDiscipline, day: Weekday | null) {
    setEnduranceSchedule((current) => ({
      ...current,
      ...(discipline === 'swim'
        ? { keySwim: day }
        : discipline === 'bike'
          ? { keyBike: day }
          : { keyRun: day }),
    }));
  }

  async function createPlan() {
    setBusy(true);
    setError(null);
    try {
      const weeks = goalType === 'general_offseason' ? 0 : weeksUntilDate(eventDateText);
      if (goalType !== 'general_offseason' && weeks === null) {
        setError('Enter the event date as YYYY-MM-DD.');
        return;
      }
      if (weeks !== null && weeks < 0) {
        setError('The event date must be today or later.');
        return;
      }
      if (goalType !== 'general_offseason' && (weeks ?? 0) < planLength) {
        setError(`A ${planLength}-week plan would extend beyond the event. Choose a shorter plan or a later event date.`);
        return;
      }
      if (equipment.length === 0) {
        setError('Choose at least one equipment option or Bodyweight only.');
        return;
      }
      if (strengthRecommendation.validationErrors.length > 0) {
        setError(strengthRecommendation.validationErrors[0] ?? 'Review the weekly training inputs before creating the plan.');
        return;
      }
      if (preferredStrengthDays.length < strengthRecommendation.sessionsPerWeek) {
        setError(`Choose at least ${strengthRecommendation.sessionsPerWeek} preferred strength days, or reduce the weekly training load.`);
        return;
      }

      const now = new Date().toISOString();
      const goal: PerformanceGoal = {
        id: `goal_${goalType}`,
        type: goalType,
        name: goalType === 'general_offseason'
          ? selectedGoal.label
          : `${selectedGoal.label} · ${eventDateText}`,
        eventDate: goalType === 'general_offseason' ? undefined : eventDateText,
        weeksUntilEvent: weeks ?? 0,
        terrain: supportsTerrain(goalType) ? terrain : undefined,
        disciplines,
        priority,
        sessionsPerWeek: strengthRecommendation.sessionsPerWeek,
        defaultSessionMinutes: strengthRecommendation.sessionMinutes,
        capacityProfile: capacity,
        phaseStrengthSessions: strengthRecommendation.phaseSchedule,
        strengthDoseMetadata: {
          minutesPerWeek: strengthRecommendation.minutesPerWeek,
          minimumEffectiveMinutes: strengthRecommendation.minimumEffectiveMinutes,
          maximumRecommendedMinutes: strengthRecommendation.maximumRecommendedMinutes,
          maxHighLoadStrengthDays: strengthRecommendation.maxHighLoadStrengthDays,
          maxTotalHardDays: strengthRecommendation.maxTotalHardDays,
          sessionRoles: strengthRecommendation.sessionRoles,
        },
        createdAt: now,
        updatedAt: now,
      };

      const [recentRegionExposures, previousExerciseIds] = await Promise.all([
        getRecentRegionExposures(),
        getPreviousExerciseIds(),
      ]);

      const activePTProfile = ptProfile?.active ? ptProfile : null;
      if (activeCheckIn?.status === 'unable_to_train') {
        setError(`Strength training is paused through ${formatDate(activeCheckIn.activeUntil.slice(0, 10))}. Clear or update today's check-in before generating a new block.`);
        return;
      }
      const result = generateTrainingBlock(
        {
          goal,
          numberOfWeeks: planLength,
          weekStartDate: nextMondayIsoDate(),
          availableEquipment: equipment,
          excludedRegions: activePTProfile?.excludedRegions ?? [],
          excludedMovementTags: activePTProfile?.excludedMovementTags ?? [],
          regionRestrictions: activePTProfile?.regionRestrictions ?? [],
          excludedMovementPatterns: activePTProfile?.excludedMovementPatterns ?? [],
          difficulty: 'intermediate',
          preferredStrengthDays,
          enduranceSchedule,
          randomSeed: `${Date.now()}`,
        },
        {
          exercises: exercises,
          recentRegionExposures,
          previousExerciseIds,
        },
      );

      if (!result.ok) {
        setError(result.messages.join(' '));
        return;
      }

      await savePerformanceGoal(goal);
      let blockToSave = result.block;

      if (activeCheckIn) {
        // Save the unmodified plan as the parent so clearing the temporary
        // check-in can restore it without rebuilding from week one.
        await saveTrainingBlock(result.block);
        const adjusted = adaptTrainingBlock(
          result.block,
          buildCheckInOverride(activeCheckIn, activePTProfile),
          {
            exercises: exercises,
            recentRegionExposures,
            previousExerciseIds,
            now: new Date().toISOString(),
          },
        );
        if (!adjusted.ok) {
          setError(`The base plan was created, but the temporary check-in could not be applied: ${adjusted.messages.join(' ')}`);
          setBlock(result.block);
          return;
        }
        blockToSave = adjusted.block;
      }

      await saveTrainingBlock(blockToSave);
      setBlock(blockToSave);
      setSelectedWeekIndex(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The training plan could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDeletePlan() {
    if (!block) return;
    Alert.alert('Delete current goal plan?', 'Future planned sessions, the countdown, and plan adaptations will be removed. Completed workout history and training memory will be kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Plan', style: 'destructive', onPress: () => void deleteCurrentGoalPlan().then(() => { setBlock(null); setSelectedWeekIndex(0); }) },
    ]);
  }

  function loadSession(session: WeeklyTrainingPlan['sessions'][number]) {
    setPreviewWorkout(session.workout);
    router.push('/workout-preview' as Href);
  }

  function startSession(
    session: WeeklyTrainingPlan['sessions'][number],
    level: WorkoutVariantLevel = 'full',
  ) {
    beginWorkout(createWorkoutVariant(session.workout, level));
    router.push('/active-workout' as Href);
  }

  function useCalendarSuggestions() {
    const suggestion = suggestEnduranceSchedule(calendarEvents);
    setEnduranceSchedule((current) => ({
      keySwim: disciplines.includes('swim') ? suggestion.keySwim ?? current.keySwim : null,
      keyBike: disciplines.includes('bike') ? suggestion.keyBike ?? current.keyBike : null,
      keyRun: disciplines.includes('run') ? suggestion.keyRun ?? current.keyRun : null,
    }));
  }

  const selectedWeek = block?.weeks[selectedWeekIndex] ?? block?.weeks[0] ?? null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Goal-based plan</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>PLAN MODE</Text>
          <Text style={styles.title}>Build strength around the event—not against it</Text>
          <Text style={styles.subtitle}>
            Generate a 1-, 2-, 4-, 8-, or 12-week block, with sessions coordinated around the key days for each endurance discipline.
          </Text>
        </View>

        <Section title="Goal">
          <View style={styles.goalGroups}>
            {GOAL_GROUPS.map((group, groupIndex) => (
              <View key={group.title} style={[styles.goalGroup, { backgroundColor: GOAL_GROUP_TONES[groupIndex % GOAL_GROUP_TONES.length] }]}>
                <Text style={styles.groupLabel}>{group.title}</Text>
                <View style={styles.goalList}>
                  {group.options.map((option) => {
                    const selected = goalType === option.type;
                    return (
                      <Pressable
                        key={option.type}
                        accessibilityRole="button"
                        onPress={() => chooseGoal(option.type)}
                        style={[styles.goalOption, selected && styles.goalOptionSelected]}
                      >
                        <View style={styles.goalOptionTitleRow}>
                          <Text style={[styles.goalLabel, selected && styles.selectedText]}>{option.label}</Text>
                          {selected ? <Text style={styles.goalSelectedMark}>✓ SELECTED</Text> : null}
                        </View>
                        <Text style={[styles.helper, selected && styles.goalDescriptionSelected]}>{option.description}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </Section>

        {goalType !== 'general_offseason' ? (
          <Section title="Event date">
            <TextInput
              accessibilityLabel="Event date"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              value={eventDateText}
              onChangeText={setEventDateText}
              placeholder="YYYY-MM-DD"
              style={styles.dateInput}
            />
            <Text style={styles.helper}>
              {computedWeeks === null
                ? 'Use YYYY-MM-DD.'
                : computedWeeks === 0
                  ? 'Race week'
                  : `${computedWeeks} week${computedWeeks === 1 ? '' : 's'} until the goal`}
            </Text>
          </Section>
        ) : null}

        <Section title="Plan length">
          <View style={styles.chipRow}>
            {PLAN_LENGTHS.map((weeks) => (
              <Chip
                key={weeks}
                label={`${weeks} week${weeks === 1 ? '' : 's'}`}
                selected={planLength === weeks}
                onPress={() => setPlanLength(weeks)}
              />
            ))}
          </View>
          <Text style={styles.helper}>Longer blocks automatically progress through base, build, peak, taper, and race-week phases as the event approaches.</Text>
        </Section>

        {goalType !== 'general_offseason' ? <Section title="Race intent">
          <View style={styles.chipRow}>
            <Chip label="Finish well" selected={priority === 'finish'} onPress={() => setPriority('finish')} />
            <Chip label="Improve performance" selected={priority === 'perform'} onPress={() => setPriority('perform')} />
            <Chip label="Race all-out" selected={priority === 'race'} onPress={() => setPriority('race')} />
          </View>
        </Section> : null}

        {supportsTerrain(goalType) ? (
          <Section title="Course profile">
            <View style={styles.chipRow}>
              {TERRAIN_OPTIONS.filter((item) => allowsTechnicalTerrain(goalType) || item.id !== 'technical_trail').map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  selected={terrain === item.id}
                  onPress={() => setTerrain(item.id)}
                />
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="Training capacity">
          <Text style={styles.helper}>Start with the time you actually have. Side Quest will recommend a sustainable strength dose around it.</Text>
          <Text style={styles.inputLabel}>Total training hours available each week</Text>
          <TextInput value={String(capacity.totalWeeklyHours)} onChangeText={(value) => setCapacity((current) => ({ ...current, totalWeeklyHours: Number(value.replace(/[^0-9.]/g, '')) || 0 }))} keyboardType="decimal-pad" style={styles.input} placeholder="10" placeholderTextColor="#7a827c" />
          <Text style={styles.inputLabel}>Current swim + bike + run hours each week</Text>
          <TextInput value={String(capacity.currentEnduranceHours)} onChangeText={(value) => setCapacity((current) => ({ ...current, currentEnduranceHours: Number(value.replace(/[^0-9.]/g, '')) || 0 }))} keyboardType="decimal-pad" style={styles.input} placeholder="6" placeholderTextColor="#7a827c" />
          <Text style={styles.inputLabel}>Current running status</Text>
          <View style={styles.chipRow}>{([['normal','Normal'],['reduced','Reduced'],['return_to_run','Return to run'],['not_running','Not running']] as const).map(([id,label]) => <Chip key={id} label={label} selected={capacity.runStatus === id} onPress={() => setCapacity((current) => ({ ...current, runStatus: id }))} />)}</View>
          <Pressable onPress={() => setShowAdvancedCapacity((value) => !value)} style={styles.advancedDisclosure}>
            <View style={{ flex: 1 }}><Text style={styles.planLogicTitle}>Advanced athlete context</Text><Text style={styles.helper}>Mileage history, bone-stress history, proficiency, and strength experience.</Text></View><Text style={styles.disclosureMark}>{showAdvancedCapacity ? '−' : '+'}</Text>
          </Pressable>
          {showAdvancedCapacity ? <View style={styles.advancedPanel}>
          <Text style={styles.inputLabel}>Highest weekly run mileage in the last 12 weeks</Text>
          <TextInput value={String(capacity.maxRunMilesLast12Weeks)} onChangeText={(value) => setCapacity((current) => ({ ...current, maxRunMilesLast12Weeks: Number(value.replace(/[^0-9.]/g, '')) || 0 }))} keyboardType="decimal-pad" style={styles.input} placeholder="20" placeholderTextColor="#7a827c" />
          <Text style={styles.inputLabel}>Bone-stress injury history</Text>
          <View style={styles.chipRow}>{([['none','None'],['remote','Past history'],['recent_or_current','Recent/current']] as const).map(([id,label]) => <Chip key={id} label={label} selected={capacity.boneStressInjuryHistory === id} onPress={() => setCapacity((current) => ({ ...current, boneStressInjuryHistory: id }))} />)}</View>
          <Text style={styles.inputLabel}>Discipline proficiency</Text>
          <Text style={styles.helper}>A developing discipline generally receives more endurance-practice time; a strong discipline can tolerate a slightly smaller share while strength addresses broader limiters.</Text>
          <Text style={styles.inputLabel}>Swimming</Text><View style={styles.chipRow}>{(['developing','average','strong'] as const).map((id) => <Chip key={`swim_${id}`} label={id[0].toUpperCase()+id.slice(1)} selected={capacity.swimProficiency === id} onPress={() => setCapacity((current) => ({ ...current, swimProficiency: id }))} />)}</View>
          <Text style={styles.inputLabel}>Cycling</Text><View style={styles.chipRow}>{(['developing','average','strong'] as const).map((id) => <Chip key={`bike_${id}`} label={id[0].toUpperCase()+id.slice(1)} selected={capacity.bikeProficiency === id} onPress={() => setCapacity((current) => ({ ...current, bikeProficiency: id }))} />)}</View>
          <Text style={styles.inputLabel}>Running</Text><View style={styles.chipRow}>{(['developing','average','strong'] as const).map((id) => <Chip key={`run_${id}`} label={id[0].toUpperCase()+id.slice(1)} selected={capacity.runProficiency === id} onPress={() => setCapacity((current) => ({ ...current, runProficiency: id }))} />)}</View>
          <Text style={styles.inputLabel}>Strength experience</Text>
          <View style={styles.chipRow}>{(['beginner','intermediate','advanced'] as const).map((id) => <Chip key={id} label={id[0].toUpperCase()+id.slice(1)} selected={capacity.strengthExperience === id} onPress={() => setCapacity((current) => ({ ...current, strengthExperience: id }))} />)}</View>
          </View> : null}
          <View style={styles.recommendationCard}>
            <Text style={styles.planLogicTitle}>Recommended starting dose</Text>
            <Text style={styles.planHeadline}>{strengthRecommendation.sessionsPerWeek} sessions · {strengthRecommendation.minutesPerWeek} min/week</Text>
            <Text style={styles.helper}>{strengthRecommendation.trainingBudget.strength.hours}h strength fits inside your weekly capacity with a {strengthRecommendation.weeklyAllocationHours.recoveryMargin}h recovery margin.</Text>
            <Text style={styles.helper}>Up to {strengthRecommendation.maxHighLoadStrengthDays} high-load strength days and {strengthRecommendation.maxTotalHardDays} total hard days.</Text>
            {strengthRecommendation.validationErrors.map((item) => <Text key={`error_${item}`} style={styles.error}>• {item}</Text>)}
            {strengthRecommendation.validationWarnings.map((item) => <Text key={`warning_${item}`} style={styles.helper}>• Review: {item}</Text>)}
            <Pressable onPress={() => setShowPlanningRationale((value) => !value)} style={styles.rationaleButton}><Text style={styles.rationaleButtonText}>{showPlanningRationale ? 'Hide planning details' : 'Why this dose?'}</Text></Pressable>
            {showPlanningRationale ? <View style={styles.rationalePanel}>
              <Text style={styles.helper}>Strength range: {strengthRecommendation.minimumEffectiveMinutes}–{strengthRecommendation.maximumRecommendedMinutes} min/week.</Text>
              <Text style={styles.helper}>Session roles: {strengthRecommendation.sessionRoles.map((role) => role.replace('_', ' ')).join(' · ')}.</Text>
              {strengthRecommendation.rationale.map((item) => <Text key={item} style={styles.helper}>• {item}</Text>)}
              {strengthRecommendation.safeguards.map((item) => <Text key={`safe_${item}`} style={styles.helper}>• {item}</Text>)}
            </View> : null}
          </View>
        </Section>

        <Section title="Training location">
          <Text style={styles.helper}>Select a saved Home, Work, Full Gym, or Travel setup. You can temporarily change individual items below.</Text>
          <View style={styles.chipRow}>
            {equipmentProfiles.map((profile) => <Chip key={profile.id} label={profile.name} selected={selectedEquipmentProfileId === profile.id} onPress={() => { setSelectedEquipmentProfileId(profile.id); setEquipment(profile.equipment); }} />)}
            <Chip label="Bodyweight only" selected={equipment.length === 1 && equipment[0] === 'bodyweight'} onPress={() => { setSelectedEquipmentProfileId(null); setEquipment(['bodyweight']); }} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/equipment-profiles' as Href)} style={styles.profileButton}><Text style={styles.profileButtonText}>Edit saved equipment locations</Text></Pressable>
          <Text style={styles.helper}>Temporary custom changes:</Text>
          <View style={styles.chipRow}>
            {QUICK_EQUIPMENT.map((id) => (
              <Chip
                key={id}
                label={equipmentLabels.get(id) ?? id}
                selected={equipment.includes(id)}
                onPress={() => toggleEquipment(id)}
              />
            ))}
          </View>
        </Section>

        <Section title="Preferred strength days">
          <Text style={styles.helper}>The planner prefers these days but can move a session when it conflicts with an event or key endurance day.</Text>
          <WeekdayChips selected={preferredStrengthDays} onToggle={togglePreferredDay} />
        </Section>

        {disciplines.length > 0 ? (
          <Section title="Key endurance days">
            <Text style={styles.helper}>
              For each discipline, choose the hardest, longest, or most important session of the week. Strength placement accounts for which body systems that discipline loads.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={calendarEvents.length ? useCalendarSuggestions : () => router.push('/calendar-sync' as Href)}
              style={styles.calendarSuggestionButton}
            >
              <Text style={styles.calendarSuggestionText}>
                {calendarEvents.length ? `Use ${calendarEvents.length} synced calendar events` : 'Connect an endurance calendar'}
              </Text>
            </Pressable>
            {disciplines.map((discipline) => (
              <DayPicker
                key={discipline}
                label={`Key ${discipline} day`}
                value={discipline === 'swim'
                  ? enduranceSchedule.keySwim ?? null
                  : discipline === 'bike'
                    ? enduranceSchedule.keyBike ?? null
                    : enduranceSchedule.keyRun ?? null}
                onChange={(day) => setDisciplineDay(discipline, day)}
              />
            ))}
          </Section>
        ) : null}

        <Section title="Today’s temporary adjustment">
          {activeCheckIn ? (
            <View style={styles.ptSummary}>
              <Text style={styles.ptTitle}>{formatCheckInStatus(activeCheckIn.status)}</Text>
              <Text style={styles.helper}>Active through {formatDate(activeCheckIn.activeUntil.slice(0, 10))}. It will be layered on top of the persistent PT profile.</Text>
            </View>
          ) : (
            <Text style={styles.helper}>No temporary soreness, pain, or movement adjustment is active.</Text>
          )}
          <Pressable accessibilityRole="button" onPress={() => router.push('/today-check-in' as Href)} style={styles.profileButton}>
            <Text style={styles.profileButtonText}>{activeCheckIn ? 'Update today’s check-in' : 'Add today’s check-in'}</Text>
          </Pressable>
        </Section>

        <Section title="PT + restrictions profile">
          {ptProfile?.active ? (
            <View style={styles.ptSummary}>
              <Text style={styles.ptTitle}>{ptProfile.name}</Text>
              <Text style={styles.helper}>
                {ptProfile.conditions.length > 0
                  ? ptProfile.conditions.map((condition) => condition.name).join(' · ')
                  : 'Active generalized restriction profile'}
              </Text>
              <Text style={styles.helper}>
                {ptProfile.protectedAreas?.length ?? ptProfile.excludedRegions.length} precise area{(ptProfile.protectedAreas?.length ?? ptProfile.excludedRegions.length) === 1 ? '' : 's'} · {(ptProfile.excludedMovementPatterns?.length ?? 0) + ptProfile.excludedMovementTags.length} movement limit{((ptProfile.excludedMovementPatterns?.length ?? 0) + ptProfile.excludedMovementTags.length) === 1 ? '' : 's'}
              </Text>
            </View>
          ) : (
            <Text style={styles.helper}>No active PT profile. The planner will not apply injury-specific exclusions.</Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/pt-profile' as Href)}
            style={styles.profileButton}
          >
            <Text style={styles.profileButtonText}>{ptProfile ? 'Edit PT profile' : 'Create PT profile'}</Text>
          </Pressable>
          <Text style={styles.helper}>The profile stores your own or your clinician’s restrictions. It is separate from race-goal selection and can be turned off.</Text>
        </Section>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void createPlan()}
          style={[styles.generateButton, busy && styles.disabled]}
        >
          <Text style={styles.generateButtonText}>{busy ? 'Generating…' : `Generate ${planLength}-Week Plan`}</Text>
        </Pressable>

        {block && selectedWeek ? (
          <View style={styles.planSection}>
            <View style={styles.planControlRow}><View style={{flex:1}}><Text style={styles.sectionTitle}>Current goal plan</Text><Text style={styles.helper}>{block.goal.name}</Text></View><Pressable onPress={confirmDeletePlan} style={styles.deletePlanButton}><Text style={styles.deletePlanText}>Delete plan</Text></Pressable></View>
            {block.weeks.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekTabs}>
                {block.weeks.map((week, index) => (
                  <Pressable
                    key={week.id}
                    accessibilityRole="button"
                    onPress={() => setSelectedWeekIndex(index)}
                    style={[styles.weekTab, selectedWeekIndex === index && styles.weekTabSelected]}
                  >
                    <Text style={[styles.weekTabText, selectedWeekIndex === index && styles.selectedText]}>Week {index + 1}</Text>
                    <Text style={styles.weekTabSubtext}>{formatShortDate(week.weekStartDate)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.phaseCard}>
              <Text style={styles.phaseBadge}>{formatPhase(selectedWeek.phase)}</Text>
              <Text style={styles.planHeadline}>{selectedWeek.headline}</Text>
              <Text style={styles.helper}>{selectedWeek.phaseExplanation}</Text>
              {typeof selectedWeek.weeksUntilEvent === 'number' && goalType !== 'general_offseason' ? (
                <Text style={styles.phaseMeta}>{selectedWeek.weeksUntilEvent} weeks until event</Text>
              ) : null}
            </View>

            <View style={styles.planLogicCard}>
              <Text style={styles.planLogicTitle}>Why this week looks like this</Text>
              <Text style={styles.helper}>
                {selectedWeek.sessions.length} strength sessions are distributed around the selected swim, bike, and run key days. Anchor movements remain more consistent across the block while targets progress gradually before taper.
              </Text>
            </View>

            {block.adaptations?.length ? (
              <View style={styles.adaptationCard}>
                <Text style={styles.planLogicTitle}>Plan adaptation history</Text>
                {block.adaptations.map((adaptation) => (
                  <View key={adaptation.id} style={styles.adaptationRow}>
                    <Text style={styles.adaptationLabel}>{adaptation.label}</Text>
                    <Text style={styles.helper}>Applied {formatShortDate(adaptation.appliedAt.slice(0, 10))}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {selectedWeek.warnings.map((warning) => (
              <View key={warning} style={styles.warningCard}>
                <Text style={styles.warningText}>{warning}</Text>
              </View>
            ))}

            {selectedWeek.sessions.map((session) => (
              <View key={session.id} style={styles.sessionCard}>
                <View style={styles.sessionTopRow}>
                  <View style={styles.sessionCopy}>
                    <Text style={styles.sessionDate}>{formatDate(session.date)}</Text>
                    <Text style={styles.sessionTitle}>{session.title}</Text>
                  </View>
                  <View style={styles.loadBadge}>
                    <Text style={styles.loadBadgeText}>{session.intendedLoad}</Text>
                  </View>
                </View>
                <Text style={styles.helper}>{session.rationale}</Text>
                {session.placementNote ? (
                  <View style={styles.placementCard}>
                    <Text style={styles.placementText}>{session.placementNote}</Text>
                  </View>
                ) : null}
                <Text style={styles.sessionMeta}>
                  {Math.round(session.workout.totalWorkSeconds / 60)} min work · {session.workout.stations.length} stations
                </Text>
                <View style={styles.focusRow}>
                  {session.focusTargets.map((target) => (
                    <View key={`${session.id}-${target.region}`} style={styles.focusBadge}>
                      <Text style={styles.focusBadgeText}>{formatRegion(target.region)}</Text>
                    </View>
                  ))}
                </View>
                <Pressable accessibilityRole="button" onPress={() => loadSession(session)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Preview full workout</Text>
                </Pressable>
                <Text style={styles.doseLabel}>START SESSION</Text>
                <View style={styles.doseRow}>
                  <DoseButton label="Full" minutes={Math.round(session.workout.totalWorkSeconds / 60)} onPress={() => startSession(session, 'full')} />
                  <DoseButton label="Reduced" minutes={Math.round(createWorkoutVariant(session.workout, 'reduced').totalWorkSeconds / 60)} onPress={() => startSession(session, 'reduced')} />
                  <DoseButton label="Minimum" minutes={Math.round(createWorkoutVariant(session.workout, 'minimum').totalWorkSeconds / 60)} onPress={() => startSession(session, 'minimum')} />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

function DoseButton({ label, minutes, onPress }: { label: string; minutes: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.doseButton}>
      <Text style={styles.doseButtonTitle}>{label}</Text>
      <Text style={styles.doseButtonMinutes}>{minutes} min</Text>
    </Pressable>
  );
}

function WeekdayChips({ selected, onToggle }: { selected: Weekday[]; onToggle: (day: Weekday) => void }) {
  return (
    <View style={styles.chipRow}>
      {WEEKDAYS.map((day) => (
        <Chip
          key={day.id}
          label={day.short}
          selected={selected.includes(day.id)}
          onPress={() => onToggle(day.id)}
        />
      ))}
    </View>
  );
}

function DayPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Weekday | null;
  onChange: (day: Weekday | null) => void;
}) {
  return (
    <View style={styles.dayPicker}>
      <Text style={styles.dayPickerLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayPickerRow}>
        <Chip label="None" selected={value === null} onPress={() => onChange(null)} />
        {WEEKDAYS.map((day) => (
          <Chip key={day.id} label={day.short} selected={value === day.id} onPress={() => onChange(day.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

function goalOption(type: PerformanceGoalType): GoalOption {
  return ALL_GOAL_OPTIONS.find((option) => option.type === type) ?? ALL_GOAL_OPTIONS[0];
}

function nextMondayIsoDate(): string {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  return localIsoDate(monday);
}

function dateFromWeeks(weeks: number): string {
  const date = new Date();
  date.setDate(date.getDate() + weeks * 7);
  return localIsoDate(date);
}

function weeksUntilDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const target = new Date(`${value}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function supportsTerrain(type: PerformanceGoalType) {
  return type !== 'swim_speed' && type !== 'general_offseason';
}

function allowsTechnicalTerrain(type: PerformanceGoalType) {
  return type === 'trail_50k' || type === 'trail_100k' || type === 'swimrun';
}

function defaultTerrain(type: PerformanceGoalType): GoalTerrain {
  if (type === 'trail_50k' || type === 'trail_100k' || type === 'swimrun') return 'technical_trail';
  if (type === 'road_10k' || type === 'road_half_marathon' || type === 'road_marathon') return 'flat';
  return 'rolling';
}

function sameEquipment(a: EquipmentId[], b: EquipmentId[]) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function formatPhase(value: WeeklyTrainingPlan['phase']) {
  return value.replace('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatRegion(value: string) {
  const labels: Record<string, string> = {
    core_anterior: 'Core',
    core_lateral: 'Lateral core',
    core_rotation: 'Rotational core',
    upper_back: 'Upper back',
    feet_ankles: 'Feet + ankles',
    hip_abductors: 'Lateral hips',
    hip_adductors: 'Adductors',
  };
  return labels[value] ?? value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}


function buildCheckInOverride(checkIn: TrainingCheckIn, ptProfile: PTProfile | null) {
  const legacyHardRegions = checkIn.regionRestrictions?.length ? [] : (checkIn.status === 'tightness_pain' || (checkIn.status === 'muscle_soreness' && checkIn.severity >= 4) ? checkIn.affectedRegions : []);
  return {
    id: checkIn.id,
    source: 'temporary_check_in' as const,
    label: checkIn.status === 'muscle_soreness' ? 'Temporary soreness adjustment' : 'Temporary pain or tightness adjustment',
    activeFrom: checkIn.createdAt,
    activeUntil: checkIn.activeUntil,
    excludedRegions: unique([...legacyHardRegions, ...(ptProfile?.active ? ptProfile.excludedRegions : [])]),
    excludedMovementTags: unique([...checkIn.aggravatedMovementTags, ...(ptProfile?.active ? ptProfile.excludedMovementTags : [])]),
    regionRestrictions: mergeRegionRestrictions([...(checkIn.regionRestrictions ?? []), ...(ptProfile?.active ? ptProfile.regionRestrictions ?? [] : [])]),
    excludedMovementPatterns: unique([...(checkIn.aggravatedMovementPatterns ?? []), ...(ptProfile?.active ? ptProfile.excludedMovementPatterns ?? [] : [])]),
    penalizedRegions: bodyRegionsFromCheckIn(checkIn),
  };
}

function mergeRegionRestrictions(values: NonNullable<PTProfile['regionRestrictions']>) {
  const rank = { direct_only: 1, keep_light: 2, avoid: 3 } as const;
  const merged = new Map<string, NonNullable<PTProfile['regionRestrictions']>[number]>();
  for (const value of values) {
    const current = merged.get(value.region);
    if (!current || rank[value.mode] > rank[current.mode]) merged.set(value.region, value);
  }
  return [...merged.values()];
}

function formatCheckInStatus(status: TrainingCheckIn['status']) {
  if (status === 'muscle_soreness') return 'Muscle soreness adjustment';
  if (status === 'tightness_pain') return 'Pain or tightness adjustment';
  if (status === 'unable_to_train') return 'Strength training paused';
  return 'Normal training';
}

const BODY_REGION_VALUES = new Set<BodyRegion>([
  'chest', 'shoulders', 'upper_back', 'lats', 'biceps', 'triceps', 'forearms_grip',
  'core_anterior', 'core_lateral', 'core_rotation', 'lower_back', 'glutes',
  'hamstrings', 'quadriceps', 'hip_abductors', 'hip_adductors', 'hip_flexors',
  'gastrocnemius', 'soleus', 'tibialis_anterior', 'feet_ankles',
]);
const GOAL_GROUP_TONES = ['#DDEAE2', '#E3EBF3', '#F2E5D1', '#E9E2F0'];

function bodyRegionsFromCheckIn(checkIn: TrainingCheckIn): BodyRegion[] {
  return checkIn.affectedRegions.filter((region): region is BodyRegion =>
    BODY_REGION_VALUES.has(region as BodyRegion));
}

function unique<T>(values: T[]): T[] { return [...new Set(values)]; }

const colors = {
  background: '#FFFFFF',
  card: '#FFFDF8',
  ink: '#01234D',
  muted: '#6B7770',
  border: '#D8DEDA',
  accent: '#153E2F',
  accentSoft: '#F4F6F5',
  warm: '#EEE9DD',
  danger: '#9B2C2C',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { paddingVertical: 6, paddingRight: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  topTitle: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 64, gap: 12 },
  intro: { gap: 6, paddingTop: 4 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800', lineHeight: 32 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  section: { backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 14, gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  goalGroups: { gap: 14 },
  goalGroup: { gap: 8, paddingVertical: 8 },
  groupLabel: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  goalList: { gap: 9 },
  goalOption: { borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 0, paddingVertical: 12, gap: 4 },
  goalOptionSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  goalOptionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  goalSelectedMark: { color: '#A8E6CC', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  goalDescriptionSelected: { color: '#E4F0E9' },
  goalLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.card },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.ink, fontSize: 14, fontWeight: '500' },
  selectedText: { color: '#FFFFFF', fontWeight: '800' },
  inputLabel: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13, color: colors.ink, backgroundColor: colors.card },
  recommendationCard: { backgroundColor: colors.accentSoft, borderRadius: 16, padding: 14, gap: 6 },
  dateInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, color: colors.ink, fontSize: 18, fontWeight: '700', backgroundColor: colors.card },
  dayPicker: { gap: 7 },
  dayPickerLabel: { color: colors.ink, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  dayPickerRow: { gap: 7, paddingRight: 12 },
  ptSummary: { gap: 4, borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 10 },
  ptTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  profileButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  profileButtonText: { color: colors.accent, fontWeight: '700' },
  generateButton: { backgroundColor: colors.accent, borderRadius: 18, paddingVertical: 18, alignItems: 'center' },
  generateButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  advancedDisclosure: { minHeight: 72, borderRadius: 18, backgroundColor: '#f5f7f4', padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }, advancedPanel: { gap: 12, paddingTop: 4 }, disclosureMark: { color: '#195c4d', fontSize: 24, fontWeight: '700' }, rationaleButton: { minHeight: 42, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 2 }, rationaleButtonText: { color: '#195c4d', fontSize: 14, fontWeight: '800' }, rationalePanel: { gap: 7, paddingTop: 4 },
  disabled: { opacity: 0.55 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  planSection: { gap: 13 },
  planControlRow:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:17,padding:14},deletePlanButton:{borderWidth:1,borderColor:colors.danger,borderRadius:11,paddingHorizontal:11,paddingVertical:9},deletePlanText:{color:colors.danger,fontWeight:'800',fontSize:12},
  weekTabs: { flexDirection: 'row', gap: 8, paddingRight: 20 },
  weekTab: { width: 84, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 13, paddingVertical: 9, alignItems: 'center', gap: 2 },
  weekTabSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  weekTabText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  weekTabSubtext: { color: colors.muted, fontSize: 10 },
  phaseCard: { backgroundColor: colors.accentSoft, borderRadius: 18, padding: 16, gap: 6 },
  phaseBadge: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  planHeadline: { color: colors.ink, fontSize: 22, fontWeight: '700' },
  phaseMeta: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  planLogicCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 15, gap: 5 },
  planLogicTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  adaptationCard: { backgroundColor: colors.accentSoft, borderRadius: 17, padding: 15, gap: 9 },
  adaptationRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 2 },
  adaptationLabel: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  warningCard: { backgroundColor: colors.warm, borderRadius: 14, padding: 12 },
  warningText: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  sessionCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, gap: 10 },
  sessionTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sessionCopy: { flex: 1, gap: 3 },
  sessionDate: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.7 },
  sessionTitle: { color: colors.ink, fontSize: 19, lineHeight: 24, fontWeight: '700' },
  loadBadge: { backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  loadBadgeText: { color: colors.accent, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  placementCard: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 10, paddingVertical: 2 },
  placementText: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  sessionMeta: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  focusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  focusBadge: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  focusBadgeText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  calendarSuggestionButton: { borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft, borderRadius: 13, paddingVertical: 11, paddingHorizontal: 13, alignItems: 'center' },
  calendarSuggestionText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  doseLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 3 },
  doseRow: { flexDirection: 'row', gap: 8 },
  doseButton: { flex: 1, backgroundColor: colors.accent, borderRadius: 13, paddingVertical: 11, alignItems: 'center', gap: 2 },
  doseButtonTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  doseButtonMinutes: { color: '#D8E9DF', fontSize: 10, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: 9, marginTop: 2 },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: colors.accent, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  secondaryButtonText: { color: colors.accent, fontWeight: '700' },
  primaryButton: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700' },
});

function isGoalType(value: string | undefined): value is PerformanceGoalType {
  return ['ironman_70_3', 'triathlon_olympic', 'road_half_marathon', 'road_marathon', 'trail_50k', 'general_offseason'].includes(value ?? '');
}
function isPriority(value: string | undefined): value is PerformanceGoal['priority'] {
  return value === 'finish' || value === 'perform' || value === 'race';
}
function parseHours(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(25, Math.max(3, Math.round(parsed))) : 10;
}
function parsePreferredDays(value: string | undefined): Weekday[] {
  const weekdays: Weekday[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const parsed = (value ?? '').split(',').map(Number).filter((item) => Number.isInteger(item) && item >= 0 && item < 7).map((item) => weekdays[item]).filter((item): item is Weekday => Boolean(item));
  return parsed.length ? parsed : ['tuesday','thursday','saturday'];
}

