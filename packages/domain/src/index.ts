export type LoadLevel = 0 | 1 | 2 | 3 | 4;

export type BodyRegion =
  | 'chest'
  | 'shoulders'
  | 'upper_back'
  | 'lats'
  | 'biceps'
  | 'triceps'
  | 'forearms_grip'
  | 'core_anterior'
  | 'core_lateral'
  | 'core_rotation'
  | 'lower_back'
  | 'glutes'
  | 'hamstrings'
  | 'quadriceps'
  | 'hip_abductors'
  | 'hip_adductors'
  | 'hip_flexors'
  | 'gastrocnemius'
  | 'soleus'
  | 'tibialis_anterior'
  | 'feet_ankles';

export type JointRegion =
  | 'neck'
  | 'shoulder'
  | 'elbow'
  | 'wrist_hand'
  | 'thoracic_spine'
  | 'lumbar_spine'
  | 'hip'
  | 'knee'
  | 'ankle'
  | 'foot';

export type MovementPattern =
  | 'squat'
  | 'lunge'
  | 'hinge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'carry'
  | 'rotation'
  | 'anti_rotation'
  | 'trunk_flexion'
  | 'anti_extension'
  | 'lateral_flexion'
  | 'jump_hop'
  | 'balance'
  | 'locomotion'
  | 'mobility';

export type AvoidanceTag =
  | 'overhead'
  | 'shoulder_weight_bearing'
  | 'wrist_weight_bearing'
  | 'hanging'
  | 'deep_knee_flexion'
  | 'single_leg_loading'
  | 'jumping'
  | 'high_impact'
  | 'rotation'
  | 'spinal_flexion'
  | 'kneeling'
  | 'floor_required'
  | 'unstable_surface'
  | 'high_balance_demand'
  | 'complex_coordination';

export type EquipmentId =
  | 'bodyweight'
  | 'dumbbell'
  | 'kettlebell'
  | 'barbell'
  | 'weight_plate'
  | 'trap_bar'
  | 'medicine_ball'
  | 'long_band'
  | 'mini_band'
  | 'bosu'
  | 'trx'
  | 'bench'
  | 'box'
  | 'stability_ball'
  | 'slider'
  | 'pullup_bar'
  | 'cable_machine'
  | 'leg_press'
  | 'hack_squat_machine'
  | 'leg_extension_machine'
  | 'leg_curl_machine'
  | 'calf_raise_machine'
  | 'assisted_pullup_machine'
  | 'chest_press_machine'
  | 'row_machine'
  | 'wall'
  | 'stairs';

export type Laterality = 'bilateral' | 'unilateral' | 'alternating' | 'either';

export type RegionProtectionMode = 'direct_only' | 'keep_light' | 'avoid';

export interface RegionRestriction {
  region: BodyRegion | JointRegion;
  mode: RegionProtectionMode;
}

export type PainAreaSide = 'left' | 'right' | 'midline' | 'bilateral';

export interface PainAreaSelection {
  areaId: string;
  label: string;
  side: PainAreaSide;
  protection: RegionProtectionMode;
}

export type StationRole =
  | 'primary_strength'
  | 'secondary_strength'
  | 'accessory'
  | 'core'
  | 'stability'
  | 'power'
  | 'conditioning'
  | 'mobility';

export interface BodyRegionLoad {
  region: BodyRegion;
  role: 'primary' | 'secondary' | 'stabilizer';
  load: LoadLevel;
}

export interface JointLoad {
  region: JointRegion;
  load: LoadLevel;
  notes?: string;
}

export interface EquipmentItem {
  equipmentId: EquipmentId;
  quantity: number;
  optional?: boolean;
}

export interface EquipmentOption {
  id: string;
  label: string;
  items: EquipmentItem[];
}

export interface ExercisePrescription {
  id: string;
  style: 'amrap' | 'interval' | 'strength';
  mode: 'reps' | 'time';
  target: number;
  minimum?: number;
  maximum?: number;
  unit: 'total' | 'per_side' | 'seconds';
  estimatedSeconds: number;
  loadGuidance?: string;
  notes?: string;
}

export interface ExerciseMedia {
  id: string;
  kind: 'image' | 'animated_image' | 'video' | 'external_link';
  sourceType: 'bundled' | 'remote' | 'user';
  uri: string;
  thumbnailUri?: string;
  angle?: 'front' | 'side' | 'rear' | 'three_quarter';
  durationMs?: number;
  loop?: boolean;
  muted?: boolean;
  offlinePolicy: 'bundled' | 'cache_if_viewed' | 'downloaded' | 'online_only';
  creator?: string;
  credit?: string;
  license?: string;
  verified: boolean;
}

export interface ExerciseInstructions {
  setup: string[];
  execution: string[];
  cues: string[];
  commonMistakes: string[];
}

export type ExerciseProgressionMode =
  | 'external_load'
  | 'unilateral'
  | 'impact_complexity'
  | 'balance_complexity'
  | 'range_of_motion'
  | 'tempo'
  | 'lever_length'
  | 'skill_only';

export type ExerciseProgressionRole =
  | 'loadable_base'
  | 'skill_regression'
  | 'standard_variant'
  | 'advanced_variant';

export type ExerciseChallengeCeiling =
  | 'low'
  | 'moderate'
  | 'high';

export type ExerciseTrainingFamily =
  | 'hip_hinge_strength'
  | 'hip_extension_strength'
  | 'hamstring_knee_flexion'
  | 'unilateral_hip_hinge_strength'
  | 'bilateral_knee_dominant_strength'
  | 'unilateral_knee_dominant_strength'
  | 'lateral_lower_body_strength'
  | 'lower_body_power'
  | 'lower_body_control_balance'
  | 'calf_strength'
  | 'elastic_lower_leg'
  | 'horizontal_pull_strength'
  | 'vertical_pull_strength'
  | 'horizontal_push_strength'
  | 'vertical_push_strength'
  | 'trunk_anti_extension'
  | 'trunk_anti_rotation'
  | 'trunk_rotation'
  | 'trunk_lateral'
  | 'scapular_control'
  | 'shoulder_rotator_cuff'
  | 'foot_ankle_control';

export interface ExerciseProgressionProfile {
  family: string;
  role: ExerciseProgressionRole;
  progressionModes: ExerciseProgressionMode[];

  /**
   * How challenging the movement can reasonably become without external load.
   * This is deliberately separate from the exercise's technical complexity.
   */
  bodyweightCeiling: ExerciseChallengeCeiling;

  /**
   * How challenging the same movement can become when appropriately loaded.
   * Omit when external loading is not an appropriate progression strategy.
   */
  loadedCeiling?: ExerciseChallengeCeiling;

  /**
   * When true, an experienced athlete should generally receive a loaded
   * prescription when suitable external load is available rather than having
   * the movement disappear from the exercise pool.
   */
  preferLoadForExperiencedAthlete?: boolean;
}

export interface ExerciseCompatibility {
  preferredPairingPatterns?: MovementPattern[];
  avoidPairingPatterns?: MovementPattern[];
  avoidPairingTags?: AvoidanceTag[];
  maximumAppearancesPerWorkout: number;
}

export interface Exercise {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  status: 'draft' | 'active' | 'archived';
  classification: 'bodyweight' | 'equipment';
  category: string;
  shortDescription: string;
  instructions: ExerciseInstructions;
  bodyRegions: BodyRegionLoad[];
  jointLoads: JointLoad[];
  movementPatterns: MovementPattern[];
  avoidanceTags: AvoidanceTag[];
  laterality: Laterality;
  stationRoles: StationRole[];
  equipmentOptions: EquipmentOption[];
  prescriptions: ExercisePrescription[];
  impactLevel: LoadLevel;
  balanceDemand: LoadLevel;
  cardiovascularDemand: LoadLevel;
  technicalComplexity: LoadLevel;
  suitableForAmrap: boolean;
  suitableForTravel: boolean;
  suitableForBeginners: boolean;
  substitutionGroupIds: string[];
  compatibility: ExerciseCompatibility;
  trainingFamily?: ExerciseTrainingFamily;
  progressionProfile?: ExerciseProgressionProfile;
  media: ExerciseMedia[];
  defaultEnabled: boolean;
  contentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface FocusTarget {
  region: BodyRegion;
  emphasis: 'light' | 'moderate' | 'strong';
}

export interface WorkoutGenerationRequest {
  workMinutes: number;
  allowedStationMinutes: Array<4 | 6 | 8 | 12>;
  restSeconds: number;
  exercisesPerStation: 2 | 3 | 'mixed';
  focusTargets: FocusTarget[];
  excludedRegions: Array<BodyRegion | JointRegion>;
  excludedMovementTags: AvoidanceTag[];
  regionRestrictions?: RegionRestriction[];
  excludedMovementPatterns?: MovementPattern[];
  availableEquipment: EquipmentId[];
  workoutStyle:
    | 'strength_cardio_amrap'
    | 'strength_amrap'
    | 'low_impact'
    | 'stability_control'
    | 'bodyweight_conditioning'
    | 'power_athleticism';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  maximumImpact: LoadLevel;
  recoveryAware: boolean;
  avoidPreviousWorkoutExercises: boolean;
  favorFamiliarExercises: boolean;
  allowUnfamiliarExercises: boolean;
  minimizeEquipmentChanges: boolean;
  randomSeed?: string;
}

export interface WorkoutExercisePrescription {
  exerciseId: string;
  exerciseSnapshot: Exercise;
  equipmentOptionId: string;
  prescriptionId: string;
  target: number;
  unit: 'total' | 'per_side' | 'seconds';
  order: number;
  userLoadValue?: number;
  userLoadUnit?: 'lb' | 'kg';
  adaptationNote?: string;
}


export interface WorkoutStation {
  id: string;
  order: number;
  durationSeconds: number;
  format: 'amrap';
  purpose: string;
  exercises: WorkoutExercisePrescription[];
}

export type WorkoutVariantLevel = 'full' | 'reduced' | 'minimum';

export type ExerciseSwapReason =
  | 'unfamiliar'
  | 'equipment_unavailable'
  | 'too_hard'
  | 'too_easy'
  | 'dislike'
  | 'variety';

export type WorkoutDifficultyFeedback = 'too_easy' | 'appropriate' | 'too_hard';

export interface ExerciseSwapRecord {
  replacedExerciseId: string;
  replacementExerciseId: string;
  reason: ExerciseSwapReason;
  swappedAt: string;
}


export interface CoachReviewMetadata {
  coachUserId: string;
  coachDisplayName: string;
  editedAt: string;
  revisionId: string;
  note?: string;
}

export type CoachProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded';

export interface CoachSessionProposalSnapshot {
  sessionDate: string;
  title: string;
  intendedLoad: 'light' | 'moderate' | 'high';
  purpose: PlannedSessionPurpose;
  workout: GeneratedWorkout;
}

export interface CoachSessionProposal {
  id: string;
  athleteId: string;
  coachId: string;
  coachDisplayName: string;
  localSessionId: string;
  baseline: CoachSessionProposalSnapshot;
  proposed: CoachSessionProposalSnapshot;
  coachNote?: string;
  status: CoachProposalStatus;
  createdAt: string;
  reviewedAt?: string;
  athleteNote?: string;
}

export interface CoachProposalDifference {
  dateChanged: boolean;
  titleChanged: boolean;
  intendedLoadChanged: boolean;
  addedExercises: string[];
  removedExercises: string[];
  targetChanges: Array<{
    exerciseName: string;
    before: string;
    after: string;
  }>;
}

export interface SharedWorkoutContext {
  roomCode: string;
  selectionMode: 'single' | 'combined';
  sourceUserIds: string[];
  sourceDisplayNames: string[];
  sourceSessionIds: string[];
  selectedByUserId?: string;
}

export interface FriendWorkoutSubstitution {
  kind: 'friend_workout' | 'combined_friend_workout';
  roomCode: string;
  sourceUserIds: string[];
  sourceDisplayNames: string[];
  sourceSessionIds: string[];
  originalSessionId: string;
  originalSessionTitle: string;
  replacementWorkoutName: string;
  completedAt: string;
}

export interface GeneratedWorkout {
  id: string;
  name: string;
  createdAt: string;
  randomSeed: string;
  request: WorkoutGenerationRequest;
  stations: WorkoutStation[];
  totalWorkSeconds: number;
  totalRestSeconds: number;
  estimatedElapsedSeconds: number;
  requiredEquipment: EquipmentId[];
  targetRegions: BodyRegion[];
  recentLoadAdjustments: string[];
  source: 'generated' | 'favorite_exact' | 'favorite_remix' | 'manual';
  variantLevel?: WorkoutVariantLevel;
  variantOfWorkoutId?: string;
  variantLabel?: string;
  swapHistory?: ExerciseSwapRecord[];
  sharedContext?: SharedWorkoutContext;
}

export interface RecentRegionExposure {
  region: BodyRegion;
  rawExposure: number;
  completedAt: string;
}

export interface ExercisePreference {
  exerciseId: string;
  preference: 'liked' | 'neutral' | 'disliked' | 'hidden';
  familiarity: 'unreviewed' | 'reviewed' | 'familiar';
}

export interface GenerationContext {
  exercises: Exercise[];
  recentRegionExposures?: RecentRegionExposure[];
  exercisePreferences?: ExercisePreference[];
  previousExerciseIds?: string[];
  now?: string;
}

export type GenerationResult =
  | { ok: true; workout: GeneratedWorkout }
  | {
      ok: false;
      reason:
        | 'NO_VALID_STATION_PLAN'
        | 'INSUFFICIENT_EXERCISES'
        | 'CONSTRAINT_CONFLICT'
        | 'VALIDATION_FAILED';
      messages: string[];
    };

export type PerformanceGoalType =
  | 'triathlon_sprint'
  | 'triathlon_olympic'
  | 'ironman_70_3'
  | 'ironman_full'
  | 'swimrun'
  | 'road_10k'
  | 'road_half_marathon'
  | 'road_marathon'
  | 'trail_50k'
  | 'trail_100k'
  | 'swim_speed'
  | 'general_offseason';

export type GoalTerrain =
  | 'flat'
  | 'rolling'
  | 'hilly'
  | 'mountainous'
  | 'technical_trail';

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type EnduranceDiscipline = 'swim' | 'bike' | 'run';
export type CompletedTrainingDiscipline = EnduranceDiscipline | 'strength' | 'hiit';
export type ExternalTrainingClassification = 'unclassified' | 'conditioning' | 'full_body_strength' | 'ignored';
export type WorkoutSensorLinkStatus = 'linked' | 'ambiguous' | 'dismissed';
export type WorkoutSensorLinkMethod = 'automatic' | 'manual';

export type TrainingPhase =
  | 'offseason'
  | 'base'
  | 'build'
  | 'peak'
  | 'taper'
  | 'race_week';

export type PlannedSessionPurpose =
  | 'max_strength'
  | 'posterior_durability'
  | 'single_leg_durability'
  | 'swim_support'
  | 'calf_ankle_capacity'
  | 'trail_durability'
  | 'power'
  | 'stability'
  | 'maintenance'
  | 'full_body';

export type TrainingBlockLength = 1 | 2 | 4 | 8 | 12;

export interface PerformanceGoal {
  id: string;
  type: PerformanceGoalType;
  name: string;
  eventDate?: string;
  weeksUntilEvent: number;
  terrain?: GoalTerrain;
  disciplines: EnduranceDiscipline[];
  priority: 'finish' | 'perform' | 'race';
  sessionsPerWeek: 2 | 3 | 4 | 5;
  defaultSessionMinutes: 24 | 32 | 40 | 48;
  capacityProfile?: {
    totalWeeklyHours: number;
    currentEnduranceHours: number;
    runStatus: 'normal' | 'reduced' | 'return_to_run' | 'not_running';
    maxRunMilesLast12Weeks: number;
    boneStressInjuryHistory: 'none' | 'remote' | 'recent_or_current';
    swimProficiency: 'developing' | 'average' | 'strong';
    bikeProficiency: 'developing' | 'average' | 'strong';
    runProficiency: 'developing' | 'average' | 'strong';
    strengthExperience: 'beginner' | 'intermediate' | 'advanced';
  };
  phaseStrengthSessions?: Partial<Record<TrainingPhase, 0 | 1 | 2 | 3 | 4 | 5>>;
  strengthDoseMetadata?: {
    minutesPerWeek: number;
    minimumEffectiveMinutes: number;
    maximumRecommendedMinutes: number;
    maxHighLoadStrengthDays: 1 | 2 | 3;
    maxTotalHardDays: 3 | 4;
    sessionRoles: Array<'heavy' | 'moderate' | 'upper_body' | 'stability' | 'maintenance'>;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * The user identifies the most demanding or longest session for each discipline.
 * A null value means that discipline is not currently part of the schedule.
 */
export interface EnduranceSchedule {
  keySwim?: Weekday | null;
  keyBike?: Weekday | null;
  keyRun?: Weekday | null;
}

export interface PTCondition {
  id: string;
  name: string;
  affectedSide?: 'left' | 'right' | 'bilateral' | 'not_applicable';
  status: 'active' | 'improving' | 'returning' | 'managed';
  notes?: string;
}

/**
 * A user- or clinician-informed restriction profile. The planner treats selected
 * regions and movement tags as hard exclusions. It does not diagnose conditions.
 */
export interface PTProfile {
  id: string;
  name: string;
  active: boolean;
  conditions: PTCondition[];
  excludedRegions: Array<BodyRegion | JointRegion>;
  excludedMovementTags: AvoidanceTag[];
  protectedAreas?: PainAreaSelection[];
  regionRestrictions?: RegionRestriction[];
  excludedMovementPatterns?: MovementPattern[];
  clinicianNotes?: string;
  createdAt: string;
  updatedAt: string;
}


export type TrainingCheckInStatus =
  | 'normal'
  | 'muscle_soreness'
  | 'tightness_pain'
  | 'unable_to_train';

export interface TrainingCheckIn {
  id: string;
  status: TrainingCheckInStatus;
  severity: 1 | 2 | 3 | 4 | 5;
  affectedRegions: Array<BodyRegion | JointRegion>;
  aggravatedMovementTags: AvoidanceTag[];
  painAreas?: PainAreaSelection[];
  regionRestrictions?: RegionRestriction[];
  aggravatedMovementPatterns?: MovementPattern[];
  notes?: string;
  active: boolean;
  createdAt: string;
  activeUntil: string;
}

export interface PlanRestrictionOverride {
  id: string;
  source: 'temporary_check_in' | 'pt_profile';
  label: string;
  activeFrom: string;
  activeUntil?: string;
  excludedRegions: Array<BodyRegion | JointRegion>;
  excludedMovementTags: AvoidanceTag[];
  regionRestrictions?: RegionRestriction[];
  excludedMovementPatterns?: MovementPattern[];
  penalizedRegions: BodyRegion[];
  pauseStrengthTraining?: boolean;
}

export interface TrainingBlockRequestSnapshot {
  availableEquipment: EquipmentId[];
  excludedRegions: Array<BodyRegion | JointRegion>;
  excludedMovementTags: AvoidanceTag[];
  regionRestrictions?: RegionRestriction[];
  excludedMovementPatterns?: MovementPattern[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  preferredStrengthDays?: Weekday[];
  enduranceSchedule?: EnduranceSchedule;
}

export interface PlanAdaptationRecord {
  id: string;
  source: PlanRestrictionOverride['source'];
  label: string;
  appliedAt: string;
  activeFrom: string;
  activeUntil?: string;
}

export interface WeeklyPlanRequest {
  goal: PerformanceGoal;
  weekStartDate: string;
  availableEquipment: EquipmentId[];
  excludedRegions: Array<BodyRegion | JointRegion>;
  excludedMovementTags: AvoidanceTag[];
  regionRestrictions?: RegionRestriction[];
  excludedMovementPatterns?: MovementPattern[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  preferredStrengthDays?: Weekday[];
  enduranceSchedule?: EnduranceSchedule;
  randomSeed?: string;
}

export interface PlannedStrengthSession {
  id: string;
  date: string;
  order: number;
  title: string;
  purpose: PlannedSessionPurpose;
  intendedLoad: 'light' | 'moderate' | 'high';
  focusTargets: FocusTarget[];
  workout: GeneratedWorkout;
  rationale: string;
  placementNote?: string;
  completionStatus: 'planned' | 'completed' | 'skipped' | 'modified';
  coachReview?: CoachReviewMetadata;
  friendSubstitution?: FriendWorkoutSubstitution;
}

export interface WeeklyTrainingPlan {
  id: string;
  createdAt: string;
  weekStartDate: string;
  weekNumber?: number;
  weeksUntilEvent?: number;
  goal: PerformanceGoal;
  phase: TrainingPhase;
  headline: string;
  phaseExplanation: string;
  sessions: PlannedStrengthSession[];
  warnings: string[];
}

export interface TrainingBlockRequest extends Omit<WeeklyPlanRequest, 'goal'> {
  goal: PerformanceGoal;
  numberOfWeeks: TrainingBlockLength;
}

export interface TrainingBlockPlan {
  id: string;
  createdAt: string;
  numberOfWeeks: TrainingBlockLength;
  goal: PerformanceGoal;
  weeks: WeeklyTrainingPlan[];
  requestSnapshot?: TrainingBlockRequestSnapshot;
  adaptations?: PlanAdaptationRecord[];
  parentBlockId?: string;
}

export type StrengthTrainingConsistency = 'none' | 'occasional' | 'one_per_week' | 'two_per_week' | 'three_plus_per_week';

export interface StrengthLoadBaseline {
  consistencyLastSixWeeks: StrengthTrainingConsistency;
  establishedSessionsPerWeek: number;
  establishedMinutesPerWeek?: number;
  desiredSessionsPerWeek?: number;
  assessedAt: string;
}

export interface StrengthTrainingHistoryEntry {
  id: string;
  completedAt: string;
  durationMinutes: number;
  plannedSessionId?: string;
  source?: 'side_quest' | 'manual' | 'external';
}

export type StrengthResponseClassification =
  | 'felt_fine'
  | 'normal_soreness'
  | 'unusually_sore'
  | 'pain_or_discomfort'
  | 'affected_other_training';

export interface StrengthSessionResponse {
  id: string;
  workoutId?: string;
  plannedSessionId?: string;
  completedAt: string;
  recordedAt: string;
  classification: StrengthResponseClassification;
  sorenessDistribution?: 'localized' | 'multiple_regions' | 'widespread';
  affectedRegions?: Array<BodyRegion | JointRegion>;
  severity?: 1 | 2 | 3 | 4 | 5;
  affectedDailyActivity?: boolean;
  affectedNextWorkout?: boolean;
  notes?: string;
}

export type StrengthLoadAction = 'progress' | 'hold' | 'consolidate' | 'restrict';

export interface StrengthLoadDecision {
  action: StrengthLoadAction;
  baselineSessionsPerWeek: number;
  recentSessionsPerWeek: number;
  requestedSessions: number;
  allowedSessions: 1 | 2 | 3 | 4 | 5;
  durationMultiplier: 0.5 | 0.67 | 0.8 | 1;
  allowFrequencyProgression: boolean;
  allowDurationProgression: boolean;
  allowRepProgression: boolean;
  reduceNovelty: boolean;
  reasons: string[];
  evaluatedAt: string;
}


export type ExerciseFamiliarity = 'new' | 'recently_introduced' | 'familiar' | 'detrained';
export type ExerciseDemandBand = 'low' | 'moderate' | 'high';

export interface ExerciseExposureRecord {
  id: string;
  exerciseId: string;
  completedAt: string;
  completedReps?: number;
  completedSets?: number;
  response?: 'tolerated' | 'demanding' | 'poorly_tolerated' | 'unknown';
}

export interface ExerciseNoveltyProfile {
  exerciseId: string;
  familiarity: ExerciseFamiliarity;
  lifetimeExposures: number;
  recentExposures: number;
  daysSinceLastExposure?: number;
  demand: ExerciseDemandBand;
  noveltyCost: 0 | 1 | 2 | 3;
  introductoryDoseMultiplier: 0.5 | 0.67 | 0.8 | 1;
  rationale: string[];
}

export interface ExerciseNoveltyCandidate {
  exerciseId: string;
  demand: ExerciseDemandBand;
  isRegression?: boolean;
  isRequiredForGoal?: boolean;
}

export interface ExerciseNoveltyDecision {
  maximumNovelExercises: number;
  maximumHighDemandNovelExercises: number;
  selectedExerciseIds: string[];
  deferredExerciseIds: string[];
  profiles: ExerciseNoveltyProfile[];
  reasons: string[];
}

export interface WeeklyPlanningContext extends GenerationContext {
  strengthLoadBaseline?: StrengthLoadBaseline;
  strengthHistory?: StrengthTrainingHistoryEntry[];
  strengthResponses?: StrengthSessionResponse[];
  strengthRampWeekIndex?: number;
  exerciseExposureHistory?: ExerciseExposureRecord[];
}

export type WeeklyPlanResult =
  | { ok: true; plan: WeeklyTrainingPlan }
  | {
      ok: false;
      reason: 'INVALID_GOAL' | 'WORKOUT_GENERATION_FAILED';
      messages: string[];
    };

export type TrainingBlockResult =
  | { ok: true; block: TrainingBlockPlan }
  | {
      ok: false;
      reason: 'INVALID_GOAL' | 'WORKOUT_GENERATION_FAILED';
      messages: string[];
    };



export interface ExerciseLoadHistoryEntry {
  exerciseId: string;
  exerciseName: string;
  loadValue: number;
  loadUnit: 'lb' | 'kg';
  completedAt: string;
}

export interface ExercisePerformanceHistoryEntry {
  exerciseId: string;
  exerciseName: string;
  equipmentId?: EquipmentId;
  targetValue: number;
  targetUnit: 'total' | 'per_side' | 'seconds';
  loadValue?: number;
  loadUnit?: 'lb' | 'kg';
  completionFraction: number;
  completedAt: string;
}

export type CalendarSyncStatus = 'idle' | 'syncing' | 'success' | 'not_modified' | 'error';

export interface TrainingCalendarSource {
  id: string;
  name: string;
  sourceType: 'trainingpeaks_ics' | 'ics' | 'manual';
  url?: string;
  active: boolean;
  autoRefresh?: boolean;
  refreshIntervalMinutes?: number;
  syncStatus?: CalendarSyncStatus;
  lastAttemptedAt?: string;
  lastSuccessfulAt?: string;
  lastSyncedAt?: string;
  lastError?: string;
  consecutiveFailures?: number;
  etag?: string;
  lastModified?: string;
  lastEventCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingCalendarEvent {
  id: string;
  sourceId: string;
  title: string;
  startAt: string;
  endAt?: string;
  allDay: boolean;
  discipline?: EnduranceDiscipline | 'strength' | 'rest' | 'other';
  description?: string;
  location?: string;
  externalUid?: string;
  timeZone?: string;
}

export type EnduranceActivitySource = 'strava' | 'manual';
export type EnduranceIntensity = 'recovery' | 'easy' | 'moderate' | 'hard' | 'race' | 'unknown';
export type EnduranceLoadClass = 'recovery' | 'easy' | 'moderate' | 'hard' | 'long' | 'extreme' | 'race';
export type StrengthPlanningPriority = 'strength_build' | 'balanced' | 'race_specific' | 'return_to_strength';
export type TrainingAdjustmentMode = 'suggestions_only' | 'auto_high_confidence';
export type TrainingAdjustmentAction =
  | 'keep_strength'
  | 'protect_strength_quality'
  | 'move_strength'
  | 'reduce_strength_volume'
  | 'minimum_strength'
  | 'replace_easy_endurance';
export type TrainingAdjustmentConfidence = 'low' | 'moderate' | 'high';
export type TrainingAdjustmentStatus = 'pending' | 'accepted' | 'dismissed' | 'auto_applied' | 'undone';

export interface TrainingIntelligencePreferences {
  mode: TrainingAdjustmentMode;
  lookbackDays: 14 | 21 | 28 | 30;
  useStravaRelativeEffort: boolean;
  updatedAt: string;
}

export interface EnduranceLoadAssessment {
  id: string;
  activityId: string;
  discipline: EnduranceDiscipline;
  loadClass: EnduranceLoadClass;
  confidence: TrainingAdjustmentConfidence;
  lookbackDays: number;
  historyCount: number;
  durationMinutes: number;
  durationRatio?: number;
  relativeEffort?: number;
  relativeEffortRatio?: number;
  distanceMeters?: number;
  elevationGainMeters?: number;
  objectiveSignals: string[];
  stravaSignals: string[];
  extremeGuardrail: boolean;
  assessedAt: string;
}

export interface StrengthAdjustmentProposal {
  id: string;
  sessionId: string;
  sessionTitle: string;
  sessionDate: string;
  phase: TrainingPhase;
  priority: StrengthPlanningPriority;
  action: TrainingAdjustmentAction;
  confidence: TrainingAdjustmentConfidence;
  automaticEligible: boolean;
  status: TrainingAdjustmentStatus;
  triggerActivityIds: string[];
  assessmentIds: string[];
  headline: string;
  explanation: string;
  preservedStrengthRegions: BodyRegion[];
  complementaryRegions: BodyRegion[];
  recommendedVariant?: WorkoutVariantLevel;
  suggestedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingIntelligenceSnapshot {
  generatedAt: string;
  priority: StrengthPlanningPriority;
  phase: TrainingPhase;
  preferences: TrainingIntelligencePreferences;
  assessments: EnduranceLoadAssessment[];
  proposals: StrengthAdjustmentProposal[];
  summary: string;
}

export interface EnduranceActivity {
  id: string;
  source: EnduranceActivitySource;
  externalId: string;
  athleteId?: string;
  name: string;
  discipline: CompletedTrainingDiscipline;
  sportType?: string;
  classification?: ExternalTrainingClassification;
  startAt: string;
  startLocal?: string;
  movingTimeSeconds: number;
  elapsedTimeSeconds: number;
  distanceMeters?: number;
  elevationGainMeters?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  relativeEffort?: number;
  workoutType?: number;
  averageCadence?: number;
  averageWatts?: number;
  weightedAverageWatts?: number;
  kilojoules?: number;
  deviceWatts?: boolean;
  deviceName?: string;
  hasHeartRate?: boolean;
  intensity: EnduranceIntensity;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
  private?: boolean;
  deletedAt?: string;
  importedAt: string;
  updatedAt: string;
}

export interface StrengthWorkoutLinkCandidate {
  id: string;
  name: string;
  source?: string;
  startedAt: string;
  completedAt: string;
}

export interface WorkoutSensorLink {
  id: string;
  activityId: string;
  workoutId?: string;
  status: WorkoutSensorLinkStatus;
  confidence: number;
  method: WorkoutSensorLinkMethod;
  rationale: string[];
  createdAt: string;
  updatedAt: string;
}

export type PlannedCompletedMatchStatus = 'matched' | 'ambiguous' | 'unmatched' | 'dismissed';

export interface PlannedCompletedMatch {
  id: string;
  calendarEventId?: string;
  activityId: string;
  status: PlannedCompletedMatchStatus;
  confidence: number;
  method: 'external_id' | 'time_title_duration' | 'manual' | 'none';
  rationale: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EnduranceRegionContribution {
  id: string;
  activityId: string;
  region: BodyRegion;
  contribution: number;
  confidence: 'low' | 'moderate';
  rationale: string;
  completedAt: string;
}

export interface AutomaticReplanRecord {
  id: string;
  triggerActivityId: string;
  snapshotId: string;
  previousBlockId: string;
  updatedBlockId: string;
  movedSessionIds: string[];
  reason: string;
  createdAt: string;
  undoneAt?: string;
}

export interface TodayRecommendation {
  status: 'planned_session' | 'recover' | 'no_strength_today' | 'no_plan';
  headline: string;
  explanation: string[];
  session?: PlannedStrengthSession;
  recommendedVariant?: WorkoutVariantLevel;
  calendarEvents?: TrainingCalendarEvent[];
}
export type MechanicalLoadLevel = 'none' | 'low' | 'moderate' | 'high';

export type MechanicalLoadDimension =
  | 'axialLoad'
  | 'spinalStabilization'
  | 'spinalFlexion'
  | 'spinalExtension'
  | 'rotation'
  | 'antiRotation'
  | 'eccentricDemand'
  | 'impactDemand'
  | 'tendonDemand'
  | 'overheadDemand'
  | 'shoulderRepetition'
  | 'gripDemand'
  | 'balanceDemand'
  | 'unilateralStabilization'
  | 'technicalDemand'
  | 'rangeOfMotionDemand';

export interface ExerciseMechanicalLoadProfile {
  exerciseId: string;
  axialLoad: MechanicalLoadLevel;
  spinalStabilization: MechanicalLoadLevel;
  spinalFlexion: MechanicalLoadLevel;
  spinalExtension: MechanicalLoadLevel;
  rotation: MechanicalLoadLevel;
  antiRotation: MechanicalLoadLevel;
  eccentricDemand: MechanicalLoadLevel;
  impactDemand: MechanicalLoadLevel;
  tendonDemand: MechanicalLoadLevel;
  overheadDemand: MechanicalLoadLevel;
  shoulderRepetition: MechanicalLoadLevel;
  gripDemand: MechanicalLoadLevel;
  balanceDemand: MechanicalLoadLevel;
  unilateralStabilization: MechanicalLoadLevel;
  technicalDemand: MechanicalLoadLevel;
  rangeOfMotionDemand: MechanicalLoadLevel;
  source: 'explicit' | 'derived';
  confidence: 'low' | 'moderate' | 'high';
  reviewReasons: string[];
}

export interface MechanicalLoadOverride {
  exerciseId: string;
  values: Partial<Omit<ExerciseMechanicalLoadProfile, 'exerciseId' | 'source' | 'confidence' | 'reviewReasons'>>;
  rationale: string;
  reviewedAt?: string;
}

export interface MechanicalLoadCandidate {
  exerciseId: string;
  movementPatterns: MovementPattern[];
  avoidanceTags: AvoidanceTag[];
  laterality: Laterality;
  impactLevel: LoadLevel;
  balanceDemand: LoadLevel;
  technicalComplexity: LoadLevel;
  bodyRegions?: BodyRegionLoad[];
  jointLoads?: JointLoad[];
  stationRoles?: StationRole[];
  equipmentIds?: EquipmentId[];
}

export interface SessionMechanicalLoadSummary {
  exerciseIds: string[];
  peak: Record<MechanicalLoadDimension, MechanicalLoadLevel>;
  accumulated: Record<MechanicalLoadDimension, number>;
  dominantDimensions: MechanicalLoadDimension[];
  reviewExerciseIds: string[];
  explanation: string[];
}

export type StructuralRegion =
  | 'cervical_spine'
  | 'thoracic_spine'
  | 'lumbar_spine'
  | 'shoulder_complex'
  | 'elbow'
  | 'wrist_hand'
  | 'hip'
  | 'knee'
  | 'achilles_calf'
  | 'foot_plantar';

export type StructuralExposureSource = 'strength' | 'swim' | 'bike' | 'run' | 'other';
export type StructuralExposureStatus = 'low' | 'building' | 'high' | 'reduce';

export interface StructuralExposureEntry {
  id: string;
  occurredAt: string;
  source: StructuralExposureSource;
  region: StructuralRegion;
  dose: number;
  confidence: 'low' | 'moderate' | 'high';
  rationale: string;
  exerciseId?: string;
  activityId?: string;
}

export interface PlannedStructuralExposure {
  region: StructuralRegion;
  dose: number;
  source: StructuralExposureSource;
  rationale: string;
}

export interface StructuralExposureRegionSummary {
  region: StructuralRegion;
  recentDose7d: number;
  recentDose21dPerWeek: number;
  plannedDose: number;
  status: StructuralExposureStatus;
  confidence: 'low' | 'moderate' | 'high';
  dominantSources: StructuralExposureSource[];
  reasons: string[];
}

export interface StructuralExposureDecision {
  action: 'proceed' | 'hold_progression' | 'modify' | 'restrict_region';
  summaries: StructuralExposureRegionSummary[];
  constrainedRegions: StructuralRegion[];
  avoidDimensions: MechanicalLoadDimension[];
  sessionScale: number;
  explanations: string[];
}

export interface EnduranceStructuralExposureInput {
  activityId: string;
  discipline: 'swim' | 'bike' | 'run';
  occurredAt: string;
  durationMinutes: number;
  intensity?: 'easy' | 'moderate' | 'hard';
  distanceMeters?: number;
  elevationLossMeters?: number;
  usedPaddles?: boolean;
  surface?: 'road' | 'trail' | 'treadmill' | 'track' | 'unknown';
}

export type CrossSportSessionDiscipline = 'strength' | 'swim' | 'bike' | 'run';
export type CrossSportSessionIntent = 'recovery' | 'easy' | 'quality' | 'long' | 'race_specific';

export interface CrossSportStructuralSession {
  sessionId: string;
  discipline: CrossSportSessionDiscipline;
  startsAt: string;
  durationMinutes: number;
  intent?: CrossSportSessionIntent;
  exposure: PlannedStructuralExposure[];
  movable?: boolean;
  priority?: 'supporting' | 'important' | 'key';
}

export interface CrossSportRegionOverlap {
  region: StructuralRegion;
  sessionIds: string[];
  disciplines: CrossSportSessionDiscipline[];
  combinedDose: number;
  windowHours: number;
  severity: 'watch' | 'modify' | 'separate';
  rationale: string;
}

export interface CrossSportSessionAdjustment {
  sessionId: string;
  action: 'keep' | 'reduce' | 'replace' | 'move';
  scale?: number;
  moveByHours?: number;
  protectedRegions: StructuralRegion[];
  rationale: string[];
}

export interface CrossSportStructuralPlanDecision {
  action: 'proceed' | 'redistribute' | 'separate_sessions' | 'protect_region';
  overlaps: CrossSportRegionOverlap[];
  adjustments: CrossSportSessionAdjustment[];
  constrainedRegions: StructuralRegion[];
  explanations: string[];
}

export type ProgressionVariable = 'load' | 'reps' | 'duration' | 'frequency' | 'novelty' | 'complexity';
export type ProgressionDirection = 'increase' | 'hold' | 'reduce';
export type ProgressionReadiness = 'ready' | 'cautious' | 'not_ready';

export interface ProgressionResponseSummary {
  completedAsPlanned: boolean;
  perceivedDifficulty?: 'too_easy' | 'appropriate' | 'too_hard';
  sorenessResolvedHours?: number;
  painDuringOrAfter?: boolean;
  affectedNextWorkout?: boolean;
}

export interface ProgressionCandidate {
  variable: ProgressionVariable;
  currentValue: number;
  proposedValue: number;
  relativeChange: number;
  rationale: string;
  priority?: number;
}

export interface ProgressionControlInput {
  sessionId: string;
  strengthLoadAction: StrengthLoadAction;
  response: ProgressionResponseSummary;
  structuralDecision?: CrossSportStructuralPlanDecision;
  noveltyDecision?: ExerciseNoveltyDecision;
  candidates: ProgressionCandidate[];
  establishedBaseline?: boolean;
  confidence?: 'low' | 'moderate' | 'high';
}

export interface ProgressionSelection {
  variable: ProgressionVariable;
  direction: ProgressionDirection;
  currentValue: number;
  targetValue: number;
  rationale: string;
}

export interface ProgressionControlDecision {
  readiness: ProgressionReadiness;
  action: 'progress' | 'hold' | 'reduce';
  selections: ProgressionSelection[];
  blockedVariables: ProgressionVariable[];
  explanations: string[];
}

export type LoadManagementWeekKind = 'normal' | 'consolidation' | 'deload' | 'restriction';
export type LoadManagementTrigger =
  | 'scheduled_cycle'
  | 'progression_streak'
  | 'structural_exposure'
  | 'persistent_soreness'
  | 'pain_response'
  | 'novelty_accumulation'
  | 'return_to_training'
  | 'incomplete_sessions'
  | 'athlete_request';

export interface LoadManagementWeekHistory {
  weekStartDate: string;
  completedStrengthSessions: number;
  plannedStrengthSessions: number;
  progressionCount: number;
  unfamiliarExerciseCount: number;
  maximumSorenessResolvedHours?: number;
  painDuringOrAfter?: boolean;
  affectedNextWorkout?: boolean;
  structuralAction?: CrossSportStructuralPlanDecision['action'];
  strengthLoadAction?: StrengthLoadAction;
}

export interface LoadManagementSessionInput {
  sessionId: string;
  discipline: CrossSportSessionDiscipline;
  priority: 'supporting' | 'important' | 'key';
  durationMinutes: number;
  movable?: boolean;
  structuralRegions?: StructuralRegion[];
}

export interface LoadManagementWeekInput {
  weekStartDate: string;
  recentWeeks: LoadManagementWeekHistory[];
  upcomingSessions: LoadManagementSessionInput[];
  returnToTraining?: boolean;
  athleteRequestedRecovery?: boolean;
  weeksSinceLastDeload?: number;
  plannedProgression?: ProgressionControlDecision;
  currentStructuralDecision?: CrossSportStructuralPlanDecision;
}

export interface LoadManagementSessionAdjustment {
  sessionId: string;
  action: 'keep' | 'reduce' | 'replace' | 'move' | 'remove';
  durationScale: number;
  intensityScale: number;
  noveltyAllowed: boolean;
  rationale: string[];
}

export interface LoadManagementWeekDecision {
  kind: LoadManagementWeekKind;
  triggers: LoadManagementTrigger[];
  strengthFrequencyScale: number;
  sessionDurationScale: number;
  mechanicalDemandScale: number;
  noveltyBudget: number;
  progressionAllowed: boolean;
  protectedSessionIds: string[];
  adjustments: LoadManagementSessionAdjustment[];
  explanations: string[];
}


export type PostWorkoutDifficulty = 'too_easy' | 'appropriate' | 'too_hard';
export type PostWorkoutPainTiming = 'during' | 'immediate_after' | 'later_same_day' | 'next_day';
export type PostWorkoutResponseAction = 'progress' | 'repeat' | 'reduce' | 'substitute' | 'restrict_region';

export interface ExerciseResponseObservation {
  exerciseId: string;
  completed: boolean;
  repsCompleted?: number;
  loadUsed?: number;
  durationSeconds?: number;
  difficulty?: PostWorkoutDifficulty;
  techniqueStable?: boolean;
  painRegions?: StructuralRegion[];
  notes?: string;
}

export interface PostWorkoutResponseRecord {
  responseId: string;
  sessionId: string;
  completedAt: string;
  completedAsPlanned: boolean;
  sessionDifficulty: PostWorkoutDifficulty;
  sorenessRegions: StructuralRegion[];
  sorenessResolvedHours?: number;
  painRegions: StructuralRegion[];
  painTiming?: PostWorkoutPainTiming;
  affectedNextWorkout: boolean;
  recoveryConfidence: 'low' | 'moderate' | 'high';
  exerciseResponses: ExerciseResponseObservation[];
}

export interface ExerciseToleranceProfile {
  exerciseId: string;
  toleratedExposureCount: number;
  difficultExposureCount: number;
  painExposureCount: number;
  completionRate: number;
  typicalDifficulty?: PostWorkoutDifficulty;
  lastPainRegions: StructuralRegion[];
  status: 'well_tolerated' | 'monitor' | 'reduce' | 'avoid_temporarily';
  confidence: 'low' | 'moderate' | 'high';
  reasons: string[];
}

export interface PostWorkoutResponseLoopInput {
  response: PostWorkoutResponseRecord;
  recentResponses: PostWorkoutResponseRecord[];
  currentProgression?: ProgressionControlDecision;
  currentLoadManagement?: LoadManagementWeekDecision;
}

export interface ExerciseResponseAdjustment {
  exerciseId: string;
  action: PostWorkoutResponseAction;
  loadScale: number;
  volumeScale: number;
  replaceWithFamiliarAlternative: boolean;
  protectedRegions: StructuralRegion[];
  rationale: string[];
}

export interface PostWorkoutResponseDecision {
  sessionAction: PostWorkoutResponseAction;
  progressionAllowed: boolean;
  noveltyAllowed: boolean;
  nextSessionScale: number;
  restrictedRegions: StructuralRegion[];
  exerciseProfiles: ExerciseToleranceProfile[];
  exerciseAdjustments: ExerciseResponseAdjustment[];
  explanations: string[];
}

export type AdaptiveTrainingState =
  | 'build'
  | 'build_plus'
  | 'consolidate'
  | 'recover'
  | 'restriction'
  | 'return_to_training'
  | 'travel'
  | 'race_week'
  | 'peak'
  | 'transition';

export type AdaptiveDecisionDomain =
  | 'life_context'
  | 'mental_health'
  | 'pain'
  | 'structural_load'
  | 'recovery'
  | 'progression'
  | 'novelty'
  | 'preference'
  | 'variety';

export type AdaptiveDecisionConfidence = 'low' | 'moderate' | 'high';

export interface AthleteLifeContext {
  lifeStress?: 'low' | 'moderate' | 'high' | 'overwhelming';
  mentalEnergy?: 'good' | 'limited' | 'depleted';
  sleepDisruption?: boolean;
  illnessOrSystemicSymptoms?: boolean;
  timeAvailableMinutes?: number;
  athleteRequestedRest?: boolean;
  athleteRequestedSimplification?: boolean;
  trainingIsProfessionalObligation?: boolean;
}

export interface UnifiedAdaptivePlanningInput {
  planningDate: string;
  athleteId: string;
  currentState: AdaptiveTrainingState;
  lifeContext: AthleteLifeContext;
  structuralDecision?: CrossSportStructuralPlanDecision;
  progressionDecision?: ProgressionControlDecision;
  loadManagementDecision?: LoadManagementWeekDecision;
  responseDecision?: PostWorkoutResponseDecision;
  noveltyDecision?: ExerciseNoveltyDecision;
  candidateSessionIds: string[];
  keySessionIds: string[];
}

export interface AdaptiveEvidenceItem {
  domain: AdaptiveDecisionDomain;
  priority: number;
  summary: string;
  confidence: AdaptiveDecisionConfidence;
}

export interface AdaptiveSessionDirective {
  sessionId: string;
  action: 'keep' | 'progress' | 'repeat' | 'reduce' | 'replace' | 'move' | 'remove';
  durationScale: number;
  intensityScale: number;
  noveltyAllowed: boolean;
  protectedRegions: StructuralRegion[];
  reasons: string[];
}

export interface AdaptiveDecisionLogEntry {
  decidedAt: string;
  state: AdaptiveTrainingState;
  decision: string;
  confidence: AdaptiveDecisionConfidence;
  evidence: AdaptiveEvidenceItem[];
  overriddenAlternatives: string[];
}

export interface UnifiedAdaptivePlanningDecision {
  state: AdaptiveTrainingState;
  headline: string;
  focus: string;
  confidence: AdaptiveDecisionConfidence;
  progressionAllowed: boolean;
  noveltyBudget: number;
  protectedSessionIds: string[];
  directives: AdaptiveSessionDirective[];
  evidence: AdaptiveEvidenceItem[];
  overriddenAlternatives: string[];
  coachNotes: string[];
  decisionLog: AdaptiveDecisionLogEntry;
}

export type AthleteResponseSignalQuality = 'insufficient' | 'emerging' | 'established';
export type AthleteToleranceBand = 'low' | 'typical' | 'high';
export type AthleteAdaptationDirection = 'reduce' | 'hold' | 'progress';

export interface AthleteResponseObservation {
  observationId: string;
  athleteId: string;
  completedAt: string;
  sessionId: string;
  discipline: CrossSportSessionDiscipline;
  exerciseIds: string[];
  regions: StructuralRegion[];
  plannedLoad: number;
  completedLoad: number;
  sessionDifficulty: PostWorkoutDifficulty;
  sorenessResolvedHours?: number;
  painRegions: StructuralRegion[];
  affectedNextWorkout: boolean;
  sleepDisrupted?: boolean;
  lifeStress?: AthleteLifeContext['lifeStress'];
}

export interface AthleteToleranceEstimate {
  key: string;
  sampleCount: number;
  signalQuality: AthleteResponseSignalQuality;
  toleranceBand: AthleteToleranceBand;
  typicalRecoveryHours?: number;
  completionRate: number;
  excessiveResponseRate: number;
  painResponseRate: number;
  confidence: AdaptiveDecisionConfidence;
  reasons: string[];
}

export interface AthleteResponseProfile {
  athleteId: string;
  generatedAt: string;
  observationCount: number;
  globalSignalQuality: AthleteResponseSignalQuality;
  exerciseTolerance: AthleteToleranceEstimate[];
  regionTolerance: AthleteToleranceEstimate[];
  disciplineTolerance: AthleteToleranceEstimate[];
  recoveryLatencyHours?: number;
  conservativeCeiling: number;
  explanations: string[];
}

export interface AthleteResponseModelInput {
  athleteId: string;
  generatedAt: string;
  observations: AthleteResponseObservation[];
  lookbackDays?: number;
  minimumEmergingSamples?: number;
  minimumEstablishedSamples?: number;
}

export interface AthletePersonalizedAdjustment {
  direction: AthleteAdaptationDirection;
  loadScale: number;
  volumeScale: number;
  noveltyScale: number;
  confidence: AdaptiveDecisionConfidence;
  reasons: string[];
}

export type ForecastResource =
  | 'upper_push'
  | 'upper_pull'
  | 'shoulder'
  | 'grip'
  | 'quadriceps'
  | 'hamstrings'
  | 'calves'
  | 'lumbar'
  | 'cardiovascular'
  | 'local_muscular_endurance'
  | 'explosive_power'
  | 'mental_freshness';

export type RecoveryCurveShape = 'linear' | 'exponential' | 'delayed_peak';

export interface CapacityRecoveryCurve {
  resource: ForecastResource;
  demand: number;
  peakDelayHours: number;
  halfLifeHours: number;
  fullRecoveryHours: number;
  shape: RecoveryCurveShape;
  confidence: AdaptiveDecisionConfidence;
  source: 'generic' | 'athlete_response';
}

export interface ForecastSessionDemand {
  sessionId: string;
  startsAt: string;
  title: string;
  discipline: string;
  priority: 'supporting' | 'important' | 'key' | 'event';
  curves: CapacityRecoveryCurve[];
}

export interface CapacityForecastPoint {
  at: string;
  resource: ForecastResource;
  availableCapacity: number;
  confidence: AdaptiveDecisionConfidence;
  contributingSessionIds: string[];
}

export interface CapacityForecastConflict {
  id: string;
  at: string;
  resource: ForecastResource;
  availableCapacity: number;
  threshold: number;
  severity: 'watch' | 'meaningful' | 'critical';
  affectedSessionId?: string;
  reasons: string[];
}

export interface CapacityForecastInput {
  generatedAt: string;
  horizonHours?: number;
  intervalHours?: number;
  completedSessions: ForecastSessionDemand[];
  plannedSessions: ForecastSessionDemand[];
  athleteResponseProfile?: AthleteResponseProfile;
  resourceThresholds?: Partial<Record<ForecastResource, number>>;
}

export interface CapacityForecastResult {
  generatedAt: string;
  horizonHours: number;
  points: CapacityForecastPoint[];
  conflicts: CapacityForecastConflict[];
  lowestCapacityByResource: Partial<Record<ForecastResource, number>>;
  confidence: AdaptiveDecisionConfidence;
  explanations: string[];
}

export type CalendarConstraintKind =
  | 'work'
  | 'travel'
  | 'family'
  | 'appointment'
  | 'facility_closed'
  | 'equipment_limited'
  | 'sleep_disruption'
  | 'protected_personal_time';

export type CalendarConstraintSeverity = 'soft' | 'meaningful' | 'hard';

export interface AthleteCalendarConstraint {
  constraintId: string;
  startsAt: string;
  endsAt: string;
  kind: CalendarConstraintKind;
  severity: CalendarConstraintSeverity;
  title: string;
  availableMinutes?: number;
  availableEquipment?: string[];
  notes?: string;
}

export interface CalendarPlanningSession {
  sessionId: string;
  startsAt: string;
  durationMinutes: number;
  title: string;
  discipline: string;
  priority: ForecastSessionDemand['priority'];
  movable: boolean;
  minimumRecoveryHours?: number;
  requiredEquipment?: string[];
  forecastResources?: ForecastResource[];
}

export interface CalendarPlanningWindow {
  startsAt: string;
  endsAt: string;
  availableMinutes: number;
  availableEquipment?: string[];
  source: 'athlete_preference' | 'calendar_gap' | 'travel' | 'manual';
}

export type CalendarProposalAction = 'keep' | 'move' | 'shorten' | 'substitute' | 'remove';

export interface CalendarAdjustmentProposal {
  proposalId: string;
  sessionId: string;
  action: CalendarProposalAction;
  originalStartsAt: string;
  proposedStartsAt?: string;
  proposedDurationMinutes?: number;
  confidence: AdaptiveDecisionConfidence;
  requiresAthleteApproval: boolean;
  reasons: string[];
  affectedConstraintIds: string[];
  forecastConflictIds: string[];
}

export interface CalendarIntelligenceInput {
  generatedAt: string;
  sessions: CalendarPlanningSession[];
  constraints: AthleteCalendarConstraint[];
  windows: CalendarPlanningWindow[];
  capacityForecast?: CapacityForecastResult;
  minimumMoveNoticeHours?: number;
  maximumMoveDays?: number;
}

export interface CalendarIntelligenceResult {
  generatedAt: string;
  proposals: CalendarAdjustmentProposal[];
  unchangedSessionIds: string[];
  protectedSessionIds: string[];
  explanations: string[];
}

export type OptimizationObjective =
  | 'protect_key_sessions'
  | 'reduce_capacity_conflicts'
  | 'respect_life_constraints'
  | 'preserve_strength'
  | 'maintain_recovery'
  | 'minimize_changes';

export interface MultiWeekOptimizationSession extends CalendarPlanningSession {
  weekIndex: number;
  originalStartsAt: string;
  targetLoad?: number;
}

export interface MultiWeekOptimizationWeek {
  weekIndex: number;
  startsOn: string;
  phase: AdaptiveTrainingState;
  sessions: MultiWeekOptimizationSession[];
  plannedLoad?: number;
  progressionCeiling?: number;
}

export interface MultiWeekOptimizationCandidate {
  candidateId: string;
  weeks: MultiWeekOptimizationWeek[];
  calendarResult?: CalendarIntelligenceResult;
  capacityForecast?: CapacityForecastResult;
  changeCount: number;
  athleteApprovedSessionIds?: string[];
}

export interface OptimizationObjectiveScore {
  objective: OptimizationObjective;
  score: number;
  weight: number;
  reasons: string[];
}

export interface MultiWeekOptimizationEvaluation {
  candidateId: string;
  totalScore: number;
  objectiveScores: OptimizationObjectiveScore[];
  disqualified: boolean;
  disqualificationReasons: string[];
  protectedSessionIds: string[];
  proposedChangeSessionIds: string[];
  explanations: string[];
}

export interface MultiWeekOptimizationInput {
  generatedAt: string;
  baselineCandidateId: string;
  candidates: MultiWeekOptimizationCandidate[];
  objectiveWeights?: Partial<Record<OptimizationObjective, number>>;
  maximumWeeklyLoadIncrease?: number;
  maximumAutomaticChanges?: number;
}

export interface MultiWeekOptimizationProposal {
  proposalId: string;
  baselineCandidateId: string;
  recommendedCandidateId: string;
  confidence: AdaptiveDecisionConfidence;
  requiresAthleteApproval: true;
  evaluations: MultiWeekOptimizationEvaluation[];
  reasons: string[];
  safeguards: string[];
}

export type TrainingObjective =
  | 'max_strength'
  | 'hypertrophy'
  | 'muscular_endurance'
  | 'aerobic_base'
  | 'vo2_max'
  | 'lactate_threshold'
  | 'neuromuscular_speed'
  | 'technique'
  | 'recovery'
  | 'race_specific'
  | 'injury_prevention'
  | 'mobility';

export type TrainingSessionRole =
  | 'event'
  | 'key'
  | 'supporting'
  | 'maintenance'
  | 'technique'
  | 'recovery'
  | 'optional'
  | 'bonus';

export type TrainingBlockPhase = 'offseason' | 'base' | 'build' | 'peak' | 'taper' | 'race_week' | 'recovery';

export interface TrainingObjectiveProfile {
  objective: TrainingObjective;
  priority: number;
  minimumWeeklyExposures?: number;
  maximumWeeklyExposures?: number;
  rationale: string;
}

export interface IntelligentTrainingSession {
  sessionId: string;
  weekIndex: number;
  startsAt: string;
  durationMinutes: number;
  title: string;
  discipline: string;
  objective: TrainingObjective;
  role: TrainingSessionRole;
  targetLoad?: number;
  movable: boolean;
}

export interface TrainingBlockDefinition {
  blockId: string;
  phase: TrainingBlockPhase;
  primaryObjective: TrainingObjective;
  secondaryObjectives: TrainingObjectiveProfile[];
  startsOn: string;
  endsOn: string;
  raceDate?: string;
  strengthPriority: number;
}

export interface AdaptationBalanceFinding {
  objective: TrainingObjective;
  weeklyExposureCount: number;
  status: 'insufficient' | 'balanced' | 'excessive';
  reasons: string[];
}

export interface TrainingInterferenceFinding {
  findingId: string;
  sessionIds: string[];
  severity: 'watch' | 'meaningful' | 'high';
  competingObjectives: TrainingObjective[];
  reasons: string[];
}

export interface TrainingDebtEntry {
  objective: TrainingObjective;
  amount: number;
  sourceSessionIds: string[];
  priority: number;
  expiresAfterDays: number;
  reasons: string[];
}

export interface TrainingBlockIntelligenceInput {
  generatedAt: string;
  block: TrainingBlockDefinition;
  sessions: IntelligentTrainingSession[];
  missedSessionIds?: string[];
  priorDebt?: TrainingDebtEntry[];
}

export interface TrainingBlockIntelligenceResult {
  generatedAt: string;
  blockId: string;
  phase: TrainingBlockPhase;
  primaryObjective: TrainingObjective;
  adaptationBalance: AdaptationBalanceFinding[];
  interferenceFindings: TrainingInterferenceFinding[];
  trainingDebt: TrainingDebtEntry[];
  protectedSessionIds: string[];
  sacrificeOrderSessionIds: string[];
  explanations: string[];
  safeguards: string[];
}

export interface AdaptationEvidencePoint {
  evidenceId: string;
  occurredAt: string;
  sessionId?: string;
  objective: TrainingObjective;
  adaptationLoad: number;
  completionRatio?: number;
  responseQuality?: number;
  source: 'completed_session' | 'performance_marker' | 'athlete_response' | 'coach_review';
  notes?: string[];
}

export interface AdaptationTrajectory {
  objective: TrainingObjective;
  estimatedLevel: number;
  changeOver28Days: number;
  direction: 'improving' | 'stable' | 'declining';
  confidence: AdaptiveDecisionConfidence;
  evidenceCount: number;
  halfLifeDays: number;
  reasons: string[];
}

export interface AdaptationForecast {
  objective: TrainingObjective;
  horizonDays: number;
  projectedLevelWithoutNewStimulus: number;
  maintenanceExposureNeeded: number;
  confidence: AdaptiveDecisionConfidence;
  reasons: string[];
}

export interface LongTermAdaptationInput {
  generatedAt: string;
  objectives: TrainingObjective[];
  evidence: AdaptationEvidencePoint[];
  halfLifeOverrides?: Partial<Record<TrainingObjective, number>>;
  forecastHorizonsDays?: number[];
}

export interface LongTermAdaptationResult {
  generatedAt: string;
  trajectories: AdaptationTrajectory[];
  forecasts: AdaptationForecast[];
  strongestObjective?: TrainingObjective;
  mostAtRiskObjective?: TrainingObjective;
  explanations: string[];
  safeguards: string[];
}

export type EnduranceGoal =
  | 'sprint_triathlon'
  | 'olympic_triathlon'
  | 'half_ironman'
  | 'full_ironman'
  | 'road_10k'
  | 'half_marathon'
  | 'marathon'
  | 'trail_100k'
  | 'swim_run'
  | 'general_endurance';

export interface GoalDisciplinePriority {
  discipline: 'swim' | 'bike' | 'run' | 'strength' | 'mobility' | 'recovery';
  priority: number;
  minimumWeeklySessions?: number;
  preferredWeeklySessions?: number;
  rationale: string;
}

export interface GoalSpecificProfile {
  goal: EnduranceGoal;
  label: string;
  primaryObjectives: TrainingObjective[];
  disciplinePriorities: GoalDisciplinePriority[];
  keySessionTypes: string[];
  raceSpecificityWindowWeeks: number;
  taperWindowWeeks: number;
  longSessionDiscipline?: 'swim' | 'bike' | 'run' | 'brick' | 'terrain';
  strengthRules: string[];
  safeguards: string[];
}

export interface GoalSpecificCoachingInput {
  generatedAt: string;
  goal: EnduranceGoal;
  weeksUntilEvent?: number;
  currentPhase: TrainingBlockPhase;
  sessions: IntelligentTrainingSession[];
  adaptation?: LongTermAdaptationResult;
  availableWeeklyHours?: number;
  currentlyRunning?: boolean;
  returnToRun?: boolean;
}

export interface GoalSpecificFinding {
  findingId: string;
  severity: 'info' | 'watch' | 'important';
  category: 'discipline_balance' | 'key_session' | 'specificity' | 'strength' | 'readiness' | 'safety';
  message: string;
  affectedSessionIds: string[];
  reasons: string[];
}

export interface GoalSpecificCoachingResult {
  generatedAt: string;
  goal: EnduranceGoal;
  profile: GoalSpecificProfile;
  findings: GoalSpecificFinding[];
  protectedSessionIds: string[];
  suggestedObjectiveOrder: TrainingObjective[];
  coachSummary: string[];
  requiresAthleteApproval: true;
  safeguards: string[];
}

export type CoachDecisionAction =
  | 'keep'
  | 'move'
  | 'shorten'
  | 'replace'
  | 'remove'
  | 'recover'
  | 'review';

export type CoachDecisionPriority = 'critical' | 'high' | 'normal' | 'low';

export interface UnifiedCoachSignal {
  signalId: string;
  source:
    | 'athlete_response'
    | 'capacity_forecast'
    | 'calendar'
    | 'multi_week_optimizer'
    | 'training_block'
    | 'adaptation'
    | 'goal_specific'
    | 'safety';
  sessionId?: string;
  severity: 'info' | 'watch' | 'meaningful' | 'critical';
  confidence: AdaptiveDecisionConfidence;
  message: string;
  reasons: string[];
}

export interface UnifiedCoachDecision {
  decisionId: string;
  sessionId?: string;
  action: CoachDecisionAction;
  priority: CoachDecisionPriority;
  confidence: AdaptiveDecisionConfidence;
  requiresAthleteApproval: boolean;
  title: string;
  explanation: string;
  supportingSignalIds: string[];
  rejectedAlternatives: string[];
}

export interface UnifiedCoachEngineInput {
  generatedAt: string;
  sessions: IntelligentTrainingSession[];
  athleteResponse?: AthleteResponseProfile;
  capacityForecast?: CapacityForecastResult;
  calendar?: CalendarIntelligenceResult;
  optimization?: MultiWeekOptimizationProposal;
  trainingBlock?: TrainingBlockIntelligenceResult;
  adaptation?: LongTermAdaptationResult;
  goalCoaching?: GoalSpecificCoachingResult;
  painOrInjuryRestriction?: boolean;
  illnessOrMedicalRestriction?: boolean;
  athleteApprovedSessionIds?: string[];
}

export interface UnifiedCoachEngineResult {
  generatedAt: string;
  status: 'stable' | 'review' | 'adjustment_proposed' | 'safety_hold';
  confidence: AdaptiveDecisionConfidence;
  signals: UnifiedCoachSignal[];
  decisions: UnifiedCoachDecision[];
  protectedSessionIds: string[];
  coachSummary: string[];
  requiresAthleteApproval: boolean;
  safeguards: string[];
}

export type CoachDecisionLifecycleStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'applied'
  | 'reverted';

export type CoachDecisionLifecycleEventType =
  | 'proposed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'applied'
  | 'reverted';

export interface CoachDecisionLifecycleEvent {
  eventId: string;
  decisionId: string;
  occurredAt: string;
  type: CoachDecisionLifecycleEventType;
  actor: 'coach_engine' | 'athlete' | 'system';
  reason?: string;
  planRevisionId?: string;
}

export interface CoachDecisionLifecycleRecord {
  decisionId: string;
  sessionId?: string;
  action: CoachDecisionAction;
  status: CoachDecisionLifecycleStatus;
  proposedAt: string;
  expiresAt: string;
  resolvedAt?: string;
  appliedPlanRevisionId?: string;
  currentExplanation: string;
  eventIds: string[];
}

export interface CoachDecisionLifecycleInput {
  generatedAt: string;
  coachResult: UnifiedCoachEngineResult;
  priorRecords?: CoachDecisionLifecycleRecord[];
  priorEvents?: CoachDecisionLifecycleEvent[];
  athleteResponses?: Array<{
    decisionId: string;
    response: 'accept' | 'decline';
    occurredAt: string;
    reason?: string;
  }>;
  appliedDecisions?: Array<{
    decisionId: string;
    occurredAt: string;
    planRevisionId: string;
  }>;
  revertedPlanRevisionIds?: Array<{
    planRevisionId: string;
    occurredAt: string;
    reason?: string;
  }>;
  proposalTtlHours?: number;
}

export interface CoachDecisionLifecycleResult {
  generatedAt: string;
  records: CoachDecisionLifecycleRecord[];
  events: CoachDecisionLifecycleEvent[];
  pendingDecisionIds: string[];
  actionableDecisionIds: string[];
  expiredDecisionIds: string[];
  appliedPlanRevisionIds: string[];
  safeguards: string[];
}

export type CoachDecisionOutcomeRating = 'helped' | 'neutral' | 'hurt' | 'unknown';

export interface CoachDecisionOutcomeObservation {
  observationId: string;
  decisionId: string;
  planRevisionId?: string;
  observedAt: string;
  rating: CoachDecisionOutcomeRating;
  completedAsPlanned?: boolean;
  athleteReason?: string;
  responseBefore?: AthleteResponseProfile;
  responseAfter?: AthleteResponseProfile;
}

export interface CoachDecisionOutcomeAggregate {
  action: CoachDecisionAction;
  observations: number;
  helped: number;
  neutral: number;
  hurt: number;
  unknown: number;
  completionRate?: number;
  confidence: AdaptiveDecisionConfidence;
  summary: string;
}

export interface CoachDecisionOutcomeLearningInput {
  generatedAt: string;
  lifecycle: CoachDecisionLifecycleResult;
  observations: CoachDecisionOutcomeObservation[];
  priorObservations?: CoachDecisionOutcomeObservation[];
}

export interface CoachDecisionOutcomeLearningResult {
  generatedAt: string;
  observations: CoachDecisionOutcomeObservation[];
  aggregates: CoachDecisionOutcomeAggregate[];
  helpfulDecisionIds: string[];
  harmfulDecisionIds: string[];
  insufficientEvidenceActions: CoachDecisionAction[];
  coachingNotes: string[];
  safeguards: string[];
}


export type CoachAutonomyLevel = 'advisory_only' | 'ask_before_changes' | 'allow_minor_changes';

export interface AthleteCoachingPreferences {
  autonomyLevel: CoachAutonomyLevel;
  allowedActions: CoachDecisionAction[];
  blockedActions?: CoachDecisionAction[];
  protectedSessionIds?: string[];
  maximumAutomaticPriority?: 'low' | 'normal';
  explanationStyle?: 'concise' | 'detailed';
  updatedAt: string;
}

export interface CoachPreferencePolicyInput {
  generatedAt: string;
  coachResult: UnifiedCoachEngineResult;
  preferences: AthleteCoachingPreferences;
  outcomeLearning?: CoachDecisionOutcomeLearningResult;
}

export interface CoachPreferencePolicyDecision {
  decision: UnifiedCoachDecision;
  disposition: 'allowed' | 'approval_required' | 'blocked' | 'review_only';
  policyReasons: string[];
}

export interface CoachPreferencePolicyResult {
  generatedAt: string;
  autonomyLevel: CoachAutonomyLevel;
  decisions: CoachPreferencePolicyDecision[];
  allowedDecisionIds: string[];
  approvalRequiredDecisionIds: string[];
  blockedDecisionIds: string[];
  reviewOnlyDecisionIds: string[];
  safeguards: string[];
}

export type CoachAttentionTiming = 'now' | 'today' | 'later' | 'informational';

export interface CoachAttentionQueueSettings {
  maxImmediatePrompts?: number;
  quietHours?: { startHour: number; endHour: number };
  deferLowPriorityHours?: number;
}

export interface CoachAttentionQueueItem {
  queueItemId: string;
  decisionId: string;
  sessionId?: string;
  action: CoachDecisionAction;
  timing: CoachAttentionTiming;
  priority: UnifiedCoachDecision['priority'];
  disposition: CoachPreferencePolicyDecision['disposition'];
  title: string;
  summary: string;
  dueAt?: string;
  interruptive: boolean;
  reasons: string[];
}

export interface CoachAttentionQueueInput {
  generatedAt: string;
  policy: CoachPreferencePolicyResult;
  lifecycle?: CoachDecisionLifecycleResult;
  settings?: CoachAttentionQueueSettings;
}

export interface CoachAttentionQueueResult {
  generatedAt: string;
  items: CoachAttentionQueueItem[];
  immediateItemIds: string[];
  todayItemIds: string[];
  deferredItemIds: string[];
  informationalItemIds: string[];
  suppressedDuplicateDecisionIds: string[];
  nextPromptAt?: string;
  safeguards: string[];
}

export type CoachEvidenceRole = 'supporting' | 'opposing' | 'context' | 'missing';
export type CoachEvidenceQuality = 'direct' | 'derived' | 'self_reported' | 'unknown';

export interface CoachEvidenceItem {
  evidenceId: string;
  decisionId: string;
  signalId?: string;
  source: UnifiedCoachSignal['source'] | 'outcome_learning' | 'athlete_preference' | 'missing_data';
  role: CoachEvidenceRole;
  quality: CoachEvidenceQuality;
  confidence: AdaptiveDecisionConfidence;
  weight: number;
  summary: string;
  details: string[];
}

export interface CoachConfidenceCalibration {
  decisionId: string;
  score: number;
  label: AdaptiveDecisionConfidence;
  supportingWeight: number;
  opposingWeight: number;
  evidenceCount: number;
  missingEvidenceCount: number;
  cappedByMissingEvidence: boolean;
  rationale: string[];
}

export interface CoachDecisionExplanation {
  decisionId: string;
  title: string;
  recommendation: string;
  conciseWhy: string[];
  detailedWhy: string[];
  primaryEvidenceIds: string[];
  opposingEvidenceIds: string[];
  contextualEvidenceIds: string[];
  missingEvidenceIds: string[];
  rejectedAlternatives: string[];
  confidence: CoachConfidenceCalibration;
}

export interface CoachEvidenceConfidenceInput {
  generatedAt: string;
  coachResult: UnifiedCoachEngineResult;
  outcomeLearning?: CoachDecisionOutcomeLearningResult;
  preferences?: AthleteCoachingPreferences;
  explanationStyle?: 'concise' | 'detailed';
}

export interface CoachEvidenceConfidenceResult {
  generatedAt: string;
  evidence: CoachEvidenceItem[];
  explanations: CoachDecisionExplanation[];
  explanationByDecisionId: Record<string, CoachDecisionExplanation>;
  safeguards: string[];
}

export type CoachScenarioKind = 'keep' | 'move' | 'shorten' | 'replace' | 'remove' | 'recover' | 'custom';

export interface CoachScenarioProjection {
  adaptation: number;
  recovery: number;
  performance: number;
  injuryRisk: number;
  calendarFit: number;
  preferenceFit: number;
  disruption: number;
}

export interface CoachScenarioCandidate {
  scenarioId: string;
  decisionId?: string;
  sessionId?: string;
  kind: CoachScenarioKind;
  title: string;
  description: string;
  projection: CoachScenarioProjection;
  evidenceIds?: string[];
  hardConstraintViolations?: string[];
  athleteApprovalRequired?: boolean;
}

export interface CoachScenarioWeights {
  adaptation: number;
  recovery: number;
  performance: number;
  injuryRisk: number;
  calendarFit: number;
  preferenceFit: number;
  disruption: number;
}

export interface CoachScenarioSimulatorInput {
  generatedAt: string;
  candidates: CoachScenarioCandidate[];
  weights?: Partial<CoachScenarioWeights>;
  minimumRecovery?: number;
  maximumInjuryRisk?: number;
  protectedSessionIds?: string[];
}

export interface CoachScenarioScore {
  scenarioId: string;
  utilityScore: number;
  rank: number;
  eligible: boolean;
  recommended: boolean;
  tradeoffs: string[];
  constraintViolations: string[];
  projection: CoachScenarioProjection;
  componentScores: Record<keyof CoachScenarioWeights, number>;
}

export interface CoachScenarioSimulatorResult {
  generatedAt: string;
  recommendedScenarioId?: string;
  rankedScenarioIds: string[];
  scenarios: CoachScenarioScore[];
  scenarioById: Record<string, CoachScenarioScore>;
  summary: string[];
  safeguards: string[];
}

export type DigitalTwinConfidence = 'low' | 'moderate' | 'high';
export type DigitalTwinParameterKey =
  | 'recoveryHalfLifeHours'
  | 'sorenessPersistenceHours'
  | 'recoveryVariability'
  | 'strengthResponse'
  | 'enduranceResponse'
  | 'mixedTrainingResponse'
  | 'completionRate'
  | 'swapRate'
  | 'postponementRate'
  | 'sleepLossSensitivity'
  | 'travelSensitivity'
  | 'heatSensitivity'
  | 'consecutiveHardDaySensitivity'
  | 'calendarCompressionSensitivity';

export interface TwinEvidence {
  evidenceId: string;
  observedAt: string;
  source: 'workout_response' | 'completion' | 'readiness' | 'recovery' | 'context';
  summary: string;
  quality: 'direct' | 'derived' | 'self_reported';
}

export interface TwinParameter<T extends number = number> {
  estimate: T;
  populationDefault: T;
  confidence: DigitalTwinConfidence;
  evidenceCount: number;
  uncertainty: number;
  lastUpdatedAt: string;
}

export interface RecoveryModel {
  recoveryHalfLifeHours: TwinParameter;
  sorenessPersistenceHours: TwinParameter;
  recoveryVariability: TwinParameter;
}

export interface AdaptationModel {
  strengthResponse: TwinParameter;
  enduranceResponse: TwinParameter;
  mixedTrainingResponse: TwinParameter;
}

export interface ComplianceModel {
  completionRate: TwinParameter;
  swapRate: TwinParameter;
  postponementRate: TwinParameter;
}

export interface SensitivityModel {
  sleepLossSensitivity: TwinParameter;
  travelSensitivity: TwinParameter;
  heatSensitivity: TwinParameter;
  consecutiveHardDaySensitivity: TwinParameter;
  calendarCompressionSensitivity: TwinParameter;
}

export interface AthleteDigitalTwin {
  athleteId: string;
  createdAt: string;
  updatedAt: string;
  recovery: RecoveryModel;
  adaptation: AdaptationModel;
  compliance: ComplianceModel;
  sensitivity: SensitivityModel;
  recentEvidence: TwinEvidence[];
  safeguards: string[];
}

export interface DigitalTwinUpdateObservation {
  observationId: string;
  observedAt: string;
  workoutType: 'strength' | 'endurance' | 'mixed' | 'recovery';
  plannedDurationMinutes?: number;
  completedDurationMinutes?: number;
  completedAsPlanned?: boolean;
  swapped?: boolean;
  postponed?: boolean;
  sessionRpe?: number;
  sorenessAfter?: number;
  readinessBefore?: number;
  readinessNextDay?: number;
  recoveredAfterHours?: number;
  sleepLoss?: boolean;
  travel?: boolean;
  heatExposure?: boolean;
  consecutiveHardDays?: number;
  calendarCompression?: number;
}

export interface DigitalTwinUpdate {
  observationId: string;
  updatedAt: string;
  changedParameters: DigitalTwinParameterKey[];
  learningRate: number;
  notes: string[];
}

export interface DigitalTwinPredictionInput {
  scenarioId: string;
  workoutType: DigitalTwinUpdateObservation['workoutType'];
  load: number;
  recoveryWindowHours: number;
  sleepLoss?: boolean;
  travel?: boolean;
  heatExposure?: boolean;
  consecutiveHardDays?: number;
  calendarCompression?: number;
}

export interface DigitalTwinPrediction {
  scenarioId: string;
  expectedAdaptation: number;
  expectedRecovery: number;
  expectedPerformance: number;
  expectedInjuryRisk: number;
  predictedRecoveryHours: number;
  confidence: DigitalTwinConfidence;
  personalizedWeight: number;
  rationale: string[];
}

export interface DigitalTwinConfidenceSummary {
  overall: DigitalTwinConfidence;
  totalEvidence: number;
  lowConfidenceParameters: DigitalTwinParameterKey[];
  summary: string;
}

export type TwinDriftType = 'none' | 'expected' | 'temporary' | 'data_quality' | 'structural';
export type TwinReliability = 'stable' | 'watch' | 'fallback';

export interface TwinPredictionOutcome {
  outcomeId: string;
  parameterKey: DigitalTwinParameterKey;
  predictedValue: number;
  observedValue: number;
  predictedAt: string;
  observedAt: string;
  evidenceId?: string;
}

export interface TwinCalibrationRecord {
  parameterKey: DigitalTwinParameterKey;
  sampleCount: number;
  meanAbsoluteError: number;
  bias: number;
  reliability: TwinReliability;
  updatedAt: string;
}

export interface TwinParameterSnapshot {
  snapshotId: string;
  parameterKey: DigitalTwinParameterKey;
  parameter: TwinParameter;
  createdAt: string;
  reason: string;
}

export interface TwinRollbackPoint {
  rollbackId: string;
  parameterKey: DigitalTwinParameterKey;
  fromEstimate: number;
  toEstimate: number;
  appliedAt: string;
  snapshotId: string;
  reason: string;
}

export interface TwinEvidenceExclusion {
  evidenceId: string;
  excludedAt: string;
  reason: string;
  requestedBy: 'athlete' | 'coach' | 'data_quality';
}

export interface TwinDriftAssessment {
  parameterKey: DigitalTwinParameterKey;
  driftType: TwinDriftType;
  severity: number;
  reliability: TwinReliability;
  reasons: string[];
  recommendedAction: 'continue' | 'slow_learning' | 'freeze' | 'rollback' | 'population_fallback';
}

export interface TwinGovernanceState {
  calibration: Partial<Record<DigitalTwinParameterKey, TwinCalibrationRecord>>;
  snapshots: TwinParameterSnapshot[];
  rollbacks: TwinRollbackPoint[];
  exclusions: TwinEvidenceExclusion[];
  frozenParameters: DigitalTwinParameterKey[];
  drift: Partial<Record<DigitalTwinParameterKey, TwinDriftAssessment>>;
  safeguards: string[];
}

export interface TwinReliabilitySummary {
  overall: TwinReliability;
  stableParameters: DigitalTwinParameterKey[];
  watchParameters: DigitalTwinParameterKey[];
  fallbackParameters: DigitalTwinParameterKey[];
  summary: string[];
}


export type CoachDecisionReviewState = 'pending_outcome' | 'ready_for_review' | 'reviewed' | 'excluded_from_learning';
export type CoachDecisionSource = 'automatic_prompt' | 'athlete_request' | 'coach_proposal' | 'calendar_conflict' | 'recovery_guardrail' | 'injury_guardrail';
export type CoachDecisionSelectionKind = 'accepted' | 'modified' | 'rejected';

export interface CoachDecisionOption {
  optionId: string;
  label: string;
  scenarioId?: string;
  predictedOutcome?: DigitalTwinPrediction;
  constraintViolations: string[];
  protectedSessionImpact: string[];
  rationale: string[];
}

export interface CoachDecisionContext {
  capturedAt: string;
  athleteStateSummary: string[];
  constraints: string[];
  protectedSessionIds: string[];
  twinConfidence?: DigitalTwinConfidenceSummary;
  twinReliability?: TwinReliabilitySummary;
}

export interface CoachDecisionSelection {
  selectedAt: string;
  kind: CoachDecisionSelectionKind;
  selectedOptionId?: string;
  athleteReason?: string;
  modifications?: string[];
}

export interface CoachDecisionOutcome {
  observedAt: string;
  workoutCompleted?: boolean;
  nextDayReadiness?: number;
  sorenessDurationHours?: number;
  painIncreased?: boolean;
  protectedSessionCompleted?: boolean;
  scheduleDisruption?: number;
  athleteHelpful?: boolean;
  requiredAnotherAdjustment?: boolean;
  notes: string[];
}

export interface CoachDecisionLearningResult {
  generatedAt: string;
  eligibleForLearning: boolean;
  observedOptionId?: string;
  preferenceSignals: string[];
  complianceSignals: string[];
  modelSignals: string[];
  confidence: DigitalTwinConfidence;
  evidenceCount: number;
  safeguards: string[];
}

export interface CoachDecisionLedgerExplanation {
  headline: string;
  mainReasons: string[];
  confidence: DigitalTwinConfidence;
  reliability?: TwinReliability;
  safeguards: string[];
}

export interface CoachDecisionRecord {
  decisionId: string;
  athleteId: string;
  createdAt: string;
  source: CoachDecisionSource;
  context: CoachDecisionContext;
  options: CoachDecisionOption[];
  recommendedOptionId?: string;
  explanation: CoachDecisionLedgerExplanation;
  selection?: CoachDecisionSelection;
  outcome?: CoachDecisionOutcome;
  learning?: CoachDecisionLearningResult;
  reviewState: CoachDecisionReviewState;
  excludedReason?: string;
}

export interface CoachDecisionHistorySummary {
  totalDecisions: number;
  pendingOutcomes: number;
  reviewed: number;
  excludedFromLearning: number;
  athleteOverrides: number;
  recentDecisionIds: string[];
}


export type CoachPolicyState = 'candidate' | 'active' | 'limited' | 'frozen' | 'retired';
export type CoachPolicyOrigin = 'population_default' | 'athlete_preference' | 'observed_outcome' | 'clinician_constraint' | 'manual_coach_rule';
export type CoachPolicyPriority = 'clinician' | 'safety' | 'athlete_restriction' | 'protected_session' | 'physiological' | 'schedule_preference' | 'population_default';

export interface CoachPolicyContext {
  tags: string[];
  trainingPhase?: string;
  protectedSessionIds: string[];
  clinicianRestrictions: string[];
  athleteRestrictions: string[];
}

export interface CoachPolicyAction {
  actionId: string;
  scenarioId?: string;
  actionType: string;
  scoreAdjustment: number;
}

export interface CoachPolicyEvidence {
  decisionId: string;
  optionId: string;
  outcomeDirection: 'supporting' | 'contradicting' | 'neutral';
  contextTags: string[];
  quality: number;
  excluded: boolean;
}

export interface CoachPolicyRule {
  ruleId: string;
  label: string;
  state: CoachPolicyState;
  origin: CoachPolicyOrigin;
  priority: CoachPolicyPriority;
  requiredContextTags: string[];
  action: CoachPolicyAction;
  evidence: CoachPolicyEvidence[];
  confidence: DigitalTwinConfidence;
  createdAt: string;
  updatedAt: string;
}

export interface CoachPolicy {
  policyId: string;
  athleteId: string;
  rules: CoachPolicyRule[];
  maxAbsoluteAdjustment: number;
  safeguards: string[];
}

export interface CoachPolicyAdjustment {
  ruleId: string;
  scenarioId?: string;
  requestedAdjustment: number;
  appliedAdjustment: number;
  confidence: DigitalTwinConfidence;
  reason: string;
}

export interface CoachPolicyConflict {
  conflictId: string;
  ruleIds: string[];
  winningRuleId: string;
  reason: string;
}

export interface CoachPolicyApplication {
  baseScore: number;
  finalScore: number;
  adjustments: CoachPolicyAdjustment[];
  conflicts: CoachPolicyConflict[];
  matchedRuleIds: string[];
  populationFallbackUsed: boolean;
  explanation: string[];
}

export interface CoachPolicyReview {
  ruleId: string;
  reviewState: 'not_needed' | 'athlete_confirmation_required' | 'governance_review_required';
  reasons: string[];
}

export type CoachPolicyEvaluationState =
  | 'shadow'
  | 'collecting_evidence'
  | 'eligible_for_promotion'
  | 'promoted'
  | 'under_review'
  | 'suspended';

export type CoachPolicyOutcomeClassification =
  | 'beneficial'
  | 'neutral'
  | 'harmful'
  | 'inconclusive'
  | 'not_comparable';

export type CoachPolicyComparability = 'direct' | 'indirect' | 'not_assessable';

export interface CoachPolicyEvaluationContext {
  contextTags: string[];
  trainingPhase?: string;
  sessionType?: string;
  protectedSessionIds: string[];
  restrictions: string[];
  twinReliability: TwinReliability;
  evidenceQuality: number;
}

export interface CoachPolicyPrediction {
  scenarioId: string;
  score: number;
  rank: number;
  recordedAt: string;
}

export interface CoachPolicyComparison {
  baselineScenarioId: string;
  policyScenarioId: string;
  baselineScore: number;
  policyAdjustedScore: number;
  policyAdjustment: number;
  athleteSelectedScenarioId?: string;
  comparability: CoachPolicyComparability;
  comparabilityReasons: string[];
}

export interface CoachPolicyOutcomeAssessment {
  decisionId: string;
  observedAt?: string;
  classification: CoachPolicyOutcomeClassification;
  selectedScenarioId?: string;
  completion?: boolean;
  recoveryAcceptable?: boolean;
  protectedSessionPreserved?: boolean;
  painIncreased?: boolean;
  athleteHelpful?: boolean;
  excluded: boolean;
  reasons: string[];
}

export interface CoachPolicyEvaluation {
  evaluationId: string;
  policyRuleId: string;
  state: CoachPolicyEvaluationState;
  context: CoachPolicyEvaluationContext;
  baselinePrediction: CoachPolicyPrediction;
  shadowPrediction: CoachPolicyPrediction;
  comparison: CoachPolicyComparison;
  outcomes: CoachPolicyOutcomeAssessment[];
  createdAt: string;
  updatedAt: string;
  safeguards: string[];
}

export interface CoachPolicyPerformanceSummary {
  policyRuleId: string;
  comparableOutcomeCount: number;
  beneficialCount: number;
  neutralCount: number;
  harmfulCount: number;
  inconclusiveCount: number;
  contextCoverage: 'narrow' | 'moderate' | 'broad';
  evidenceQuality: DigitalTwinConfidence;
  explanation: string[];
}

export interface CoachPolicyPromotionDecision {
  policyRuleId: string;
  eligible: boolean;
  targetState: CoachPolicyEvaluationState;
  boundedInfluence: number;
  reasons: string[];
  reversible: true;
}

export type CoachPolicyExperimentStatus = 'draft' | 'awaiting_consent' | 'active' | 'completed' | 'cancelled' | 'unsafe';

export interface CoachPolicyExperimentArm {
  armId: string;
  scenarioId: string;
  label: string;
  prohibited: boolean;
  prohibitionReasons: string[];
}

export interface CoachPolicyExperiment {
  experimentId: string;
  policyRuleId: string;
  hypothesis: string;
  contextTags: string[];
  arms: CoachPolicyExperimentArm[];
  athleteConsent: boolean;
  status: CoachPolicyExperimentStatus;
  stopConditions: string[];
  safetyExclusions: string[];
  createdAt: string;
  expiresAt: string;
}

export interface CoachPolicyExperimentResult {
  experimentId: string;
  selectedArmId?: string;
  completedAt?: string;
  outcomeClassification: CoachPolicyOutcomeClassification;
  affectedCompliance: false;
  notes: string[];
}

export type CoachPolicyPortfolioEntryState = 'candidate' | 'shadow' | 'limited' | 'active' | 'constrained' | 'merged' | 'suspended' | 'retired';
export type CoachPolicyRelationshipType = 'duplicate' | 'overlapping' | 'subsumes' | 'subsumed_by' | 'contradictory' | 'complementary' | 'independent';
export type CoachPolicyConflictSeverity = 'informational' | 'resolvable' | 'blocking' | 'safety_critical';
export type CoachPolicyScopeRating = 'narrow' | 'appropriate' | 'broad' | 'overgeneralized' | 'unsupported';
export type CoachPolicySuppressionReason = 'duplicate_adjustment' | 'lower_authority' | 'weaker_evidence' | 'context_mismatch' | 'overbroad_scope' | 'portfolio_budget' | 'active_conflict' | 'governance_suspension' | 'shadow_only';
export type CoachPolicyPortfolioReviewOutcome = 'retain' | 'narrow' | 'merge' | 'suspend' | 'retire' | 'request_athlete_review';

export interface CoachPolicyPortfolioEntry {
  rule: CoachPolicyRule;
  state: CoachPolicyPortfolioEntryState;
  lastApplicableAt?: string;
  mergedIntoRuleId?: string;
  sourceRuleIds: string[];
  scopeRating: CoachPolicyScopeRating;
}

export interface CoachPolicyPortfolio {
  portfolioId: string;
  athleteId: string;
  entries: CoachPolicyPortfolioEntry[];
  maxEvaluatedPerDecision: number;
  maxInfluentialPerDecision: number;
  maxPerScoreDimension: number;
  audit: CoachPolicyPortfolioAuditEvent[];
  safeguards: string[];
}

export interface CoachPolicyRelationship {
  leftRuleId: string;
  rightRuleId: string;
  type: CoachPolicyRelationshipType;
  severity: CoachPolicyConflictSeverity;
  reasons: string[];
}

export interface CoachPolicyOverlap extends CoachPolicyRelationship {
  sharedContextTags: string[];
  sharedActionType?: string;
}

export interface CoachPolicyContradiction extends CoachPolicyRelationship {
  blocking: boolean;
  winningRuleId?: string;
}

export interface CoachPolicyScopeAssessment {
  ruleId: string;
  rating: CoachPolicyScopeRating;
  comparableContexts: number;
  distinctPhases: number;
  distinctSessionTypes: number;
  reasons: string[];
}

export interface CoachPolicyConsolidation {
  consolidationId: string;
  sourceRuleIds: string[];
  mergedRule: CoachPolicyRule;
  reversible: true;
  requiresAthleteReview: boolean;
  reasons: string[];
}

export interface CoachPolicyPortfolioDecision {
  consideredPolicyIds: string[];
  applicablePolicyIds: string[];
  selectedPolicyIds: string[];
  suppressedPolicyIds: string[];
  suppressionReasons: Record<string, CoachPolicySuppressionReason>;
  unresolvedConflicts: CoachPolicyContradiction[];
  totalAdjustment: number;
  portfolioConfidence: DigitalTwinConfidence;
  fallbackUsed: boolean;
}

export interface CoachPolicyPortfolioReview {
  ruleId: string;
  outcome: CoachPolicyPortfolioReviewOutcome;
  requiresAthleteReview: boolean;
  reasons: string[];
}

export interface CoachPolicyPortfolioAuditEvent {
  eventId: string;
  ruleIds: string[];
  eventType: 'added' | 'selected' | 'suppressed' | 'merged' | 'constrained' | 'suspended' | 'retired' | 'restored';
  occurredAt: string;
  reasons: string[];
}

export type CoachPolicyReleaseState = 'draft' | 'shadow' | 'canary' | 'active' | 'paused' | 'rolled_back' | 'retired';
export type CoachPolicyReleaseDecision = 'hold' | 'advance_to_shadow' | 'advance_to_canary' | 'activate' | 'pause' | 'rollback' | 'retire';

export interface CoachPolicyReleaseSnapshot {
  snapshotId: string;
  portfolioId: string;
  ruleIds: string[];
  createdAt: string;
  portfolioHash: string;
  sourceReleaseId?: string;
}

export interface CoachPolicyRelease {
  releaseId: string;
  portfolioId: string;
  version: number;
  state: CoachPolicyReleaseState;
  snapshot: CoachPolicyReleaseSnapshot;
  previousReleaseId?: string;
  athleteApproved: boolean;
  activatedAt?: string;
  pausedAt?: string;
  rolledBackAt?: string;
  reasons: string[];
  safeguards: string[];
}

export interface CoachPolicyReleaseHealth {
  releaseId: string;
  evaluatedDecisions: number;
  harmfulOutcomes: number;
  blockingConflicts: number;
  driftDetected: boolean;
  missingEvidenceRate: number;
  athleteRejectionRate: number;
  healthy: boolean;
  reasons: string[];
}

export interface CoachPolicyReleaseGate {
  releaseId: string;
  requestedDecision: CoachPolicyReleaseDecision;
  allowed: boolean;
  requiresAthleteApproval: boolean;
  reasons: string[];
}

export interface CoachPolicyRollbackPlan {
  rollbackId: string;
  fromReleaseId: string;
  toReleaseId: string;
  reversible: true;
  preservesAuditHistory: true;
  reasons: string[];
}

export interface CoachPolicyReleaseAuditEvent {
  eventId: string;
  releaseId: string;
  eventType: 'created' | 'shadowed' | 'canary_started' | 'activated' | 'paused' | 'rolled_back' | 'retired';
  occurredAt: string;
  actor: 'system' | 'athlete' | 'coach' | 'clinician';
  reasons: string[];
}

export interface CoachPolicyReleaseRegistry {
  portfolioId: string;
  releases: CoachPolicyRelease[];
  activeReleaseId?: string;
  audit: CoachPolicyReleaseAuditEvent[];
}

// V26.14 — Longitudinal Outcome Learning
export type LongitudinalWindowKind = 'rolling_4_week' | 'rolling_8_week' | 'rolling_12_week' | 'macrocycle' | 'custom';
export type LongitudinalOutcomeDirection = 'improving' | 'stable' | 'declining' | 'insufficient_evidence';
export type LongitudinalAssociation = 'positive' | 'neutral' | 'negative' | 'inconclusive' | 'not_comparable';
export type LongitudinalConfidence = 'low' | 'medium' | 'high';

export interface LongitudinalOutcomeWindow {
  windowId: string;
  kind: LongitudinalWindowKind;
  startAt: string;
  endAt: string;
  bounded: true;
}

export interface TrainingBlockContext {
  phase?: string;
  goal?: string;
  raceDistance?: string;
  injuryState?: string;
  experienceLevel?: string;
  scheduleConstraints?: string[];
}

export interface TrainingBlockMetric {
  key: string;
  value?: number;
  direction?: LongitudinalOutcomeDirection;
  observed: boolean;
  sourceIds: string[];
}

export interface TrainingBlock {
  blockId: string;
  window: LongitudinalOutcomeWindow;
  context: TrainingBlockContext;
  decisionIds: string[];
  policyIds: string[];
  metrics: TrainingBlockMetric[];
  excluded: boolean;
  exclusionReasons: string[];
}

export interface TrainingBlockOutcome {
  blockId: string;
  dimensions: TrainingBlockMetric[];
  completeness: number;
  confidence: LongitudinalConfidence;
}

export interface StrategyOutcomeEvidence {
  evidenceId: string;
  strategyId: string;
  blockId: string;
  association: LongitudinalAssociation;
  comparable: boolean;
  observedOnly: true;
  sourceIds: string[];
  notes: string[];
}

export interface CoachingStrategyOutcome {
  strategyId: string;
  comparableBlocks: number;
  positiveBlocks: number;
  neutralBlocks: number;
  negativeBlocks: number;
  inconclusiveBlocks: number;
  confidence: LongitudinalConfidence;
  applicableContexts: TrainingBlockContext[];
  evidence: StrategyOutcomeEvidence[];
}

export interface OutcomeTrajectory {
  metricKey: string;
  points: Array<{ blockId: string; value?: number; direction: LongitudinalOutcomeDirection }>;
  overallDirection: LongitudinalOutcomeDirection;
}

export interface OutcomeComparator {
  currentBlockId: string;
  comparisonBlockId: string;
  comparable: boolean;
  reasons: string[];
}

export interface OutcomeDrift {
  strategyId: string;
  detected: boolean;
  previousAssociation?: LongitudinalAssociation;
  currentAssociation?: LongitudinalAssociation;
  reasons: string[];
}

export interface StrategyPerformanceReport {
  strategy: CoachingStrategyOutcome;
  trajectories: OutcomeTrajectory[];
  drift: OutcomeDrift;
  limitations: string[];
  explanation: string[];
  causalClaimAllowed: false;
  auditable: true;
}

export type CausalHypothesisStatus = 'draft' | 'screened' | 'supported' | 'weakened' | 'rejected' | 'insufficient_evidence';
export type CausalEvidenceStrength = 'none' | 'very_low' | 'low' | 'moderate';
export type CausalComparisonMethod = 'exact_context_match' | 'nearest_context_match' | 'within_athlete_crossover' | 'interrupted_time_series';
export type CausalThreatKind = 'confounding' | 'selection_bias' | 'measurement_error' | 'reverse_causation' | 'time_varying_context' | 'insufficient_overlap' | 'missing_data';

export interface CausalQuestion {
  questionId: string;
  strategyId: string;
  exposure: string;
  outcomeKeys: string[];
  targetContext: TrainingBlockContext;
  createdAt: string;
}

export interface CausalAssumption {
  assumptionId: string;
  description: string;
  testable: boolean;
  satisfied?: boolean;
  evidenceIds: string[];
}

export interface CausalThreat {
  kind: CausalThreatKind;
  severity: 'low' | 'medium' | 'high';
  description: string;
  mitigated: boolean;
  evidenceIds: string[];
}

export interface MatchedTrainingBlockPair {
  pairId: string;
  exposedBlockId: string;
  comparisonBlockId: string;
  method: CausalComparisonMethod;
  matchScore: number;
  comparable: boolean;
  mismatchReasons: string[];
}

export interface CausalEffectEstimate {
  estimateId: string;
  questionId: string;
  outcomeKey: string;
  direction: 'beneficial' | 'neutral' | 'harmful' | 'indeterminate';
  standardizedDifference?: number;
  uncertainty: 'high' | 'very_high';
  evidenceStrength: CausalEvidenceStrength;
  causalClaimAllowed: false;
  pairIds: string[];
  limitations: string[];
}

export interface CausalEvidenceAssessment {
  assessmentId: string;
  question: CausalQuestion;
  assumptions: CausalAssumption[];
  threats: CausalThreat[];
  matchedPairs: MatchedTrainingBlockPair[];
  estimates: CausalEffectEstimate[];
  status: CausalHypothesisStatus;
  evidenceStrength: CausalEvidenceStrength;
  promotionBlocked: boolean;
  explanation: string[];
  auditable: true;
}

// V26.16 — Coach Uncertainty Reasoning
export type CoachUncertaintyLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' | 'unknown';
export type CoachRecommendationStrength = 'strong' | 'moderate' | 'tentative' | 'insufficient_evidence' | 'do_not_recommend';
export type CoachUncertaintyDimensionKind = 'evidence' | 'model' | 'context' | 'outcome' | 'decision';
export type CoachUncertaintySourceKind = 'missing_data' | 'conflicting_evidence' | 'context_mismatch' | 'model_disagreement' | 'outcome_variability' | 'measurement_limit' | 'causal_limit';

export interface CoachUncertaintyDimension {
  kind: CoachUncertaintyDimensionKind;
  level: CoachUncertaintyLevel;
  reasons: string[];
  evidenceIds: string[];
}

export interface CoachUncertaintySource {
  sourceId: string;
  kind: CoachUncertaintySourceKind;
  level: CoachUncertaintyLevel;
  description: string;
  evidenceIds: string[];
  resolvable: boolean;
}

export interface CoachEvidenceConflict {
  conflictId: string;
  evidenceIds: string[];
  description: string;
  material: boolean;
  preserved: true;
}

export interface CoachInformationGap {
  gapId: string;
  field: string;
  description: string;
  materialToDecision: boolean;
  couldChangeRecommendation: boolean;
  requestFromAthlete: boolean;
}

export interface CoachDecisionStability {
  stable: boolean;
  testedAlternatives: number;
  recommendationChanged: boolean;
  reasons: string[];
  requiresAthleteConfirmation: boolean;
}

export interface CoachEvidenceUpdateTrigger {
  triggerId: string;
  field: string;
  condition: string;
  reason: string;
}

export interface CoachUncertaintyExplanation {
  headline: string;
  summary: string[];
  conflicts: string[];
  missingInformation: string[];
  whatWouldChangeThis: string[];
  avoidsNumericPrecision: true;
}

export interface CoachUncertaintyAssessment {
  assessmentId: string;
  recommendationId: string;
  dimensions: CoachUncertaintyDimension[];
  sources: CoachUncertaintySource[];
  conflicts: CoachEvidenceConflict[];
  informationGaps: CoachInformationGap[];
  stability: CoachDecisionStability;
  recommendationStrength: CoachRecommendationStrength;
  updateTriggers: CoachEvidenceUpdateTrigger[];
  explanation: CoachUncertaintyExplanation;
  automaticPlanChangeAllowed: boolean;
  governanceRequired: true;
  auditable: true;
}

// V26.17 — Multi-Objective Coaching Optimization
export type CoachObjectiveKind = 'performance' | 'strength' | 'injury_risk' | 'fatigue' | 'recovery' | 'enjoyment' | 'schedule_stability' | 'athlete_preference';
export type CoachObjectiveDirection = 'maximize' | 'minimize' | 'maintain';
export type CoachTradeoffStatus = 'dominant' | 'pareto_optimal' | 'dominated' | 'infeasible';

export interface CoachObjective {
  objectiveId: string;
  kind: CoachObjectiveKind;
  direction: CoachObjectiveDirection;
  importance: 'low' | 'medium' | 'high' | 'binding';
  target?: number;
  tolerance?: number;
  evidenceIds: string[];
}

export interface CoachObjectiveOutcome {
  objectiveId: string;
  expectedDirection: 'improve' | 'preserve' | 'worsen' | 'unknown';
  magnitude: 'small' | 'moderate' | 'large' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
  explanation: string;
}

export interface CoachOptimizationCandidate {
  candidateId: string;
  label: string;
  outcomes: CoachObjectiveOutcome[];
  constraintViolations: string[];
  governanceApproved: boolean;
}

export interface CoachTradeoff {
  objectiveA: string;
  objectiveB: string;
  description: string;
  material: boolean;
}

export interface CoachParetoCandidate {
  candidateId: string;
  status: CoachTradeoffStatus;
  dominatedBy: string[];
  tradeoffs: CoachTradeoff[];
}

export interface CoachObjectivePreference {
  objectiveId: string;
  rank: number;
  source: 'athlete' | 'clinician' | 'coach' | 'system_default';
  declared: boolean;
}

export interface CoachOptimizationDecision {
  optimizationId: string;
  selectedCandidateId?: string;
  feasibleCandidateIds: string[];
  paretoFrontierIds: string[];
  candidates: CoachParetoCandidate[];
  objectives: CoachObjective[];
  preferences: CoachObjectivePreference[];
  unresolvedTradeoffs: CoachTradeoff[];
  requiresAthleteChoice: boolean;
  automaticPlanChangeAllowed: boolean;
  explanation: string[];
  governanceRequired: true;
  auditable: true;
}


// V26.18 — Coach Simulation and Stress Testing
export type CoachSimulationMode = 'baseline' | 'optimistic' | 'pessimistic' | 'stress_test' | 'edge_case';
export type CoachSimulationOutcome = 'beneficial' | 'acceptable' | 'fragile' | 'harmful' | 'indeterminate';

export interface CoachSimulationAssumption {
  assumptionId: string;
  field: string;
  value: string | number | boolean;
  source: 'athlete' | 'clinician' | 'observed' | 'inferred' | 'system_default';
  uncertainty: 'low' | 'moderate' | 'high' | 'unknown';
}

export interface CoachSimulationScenario {
  scenarioId: string;
  label: string;
  mode: CoachSimulationMode;
  assumptions: CoachSimulationAssumption[];
  candidateId: string;
}

export interface CoachSimulationResult {
  scenarioId: string;
  candidateId: string;
  outcome: CoachSimulationOutcome;
  objectiveOutcomes: CoachObjectiveOutcome[];
  constraintViolations: string[];
  safetyViolation: boolean;
  explanation: string[];
}

export interface CoachSimulationStressTest {
  stressTestId: string;
  candidateId: string;
  testedScenarioIds: string[];
  failureScenarioIds: string[];
  robust: boolean;
  fragileAssumptions: string[];
  requiresAthleteConfirmation: boolean;
}

export interface CoachSimulationDecision {
  simulationId: string;
  candidateIds: string[];
  scenarios: CoachSimulationScenario[];
  results: CoachSimulationResult[];
  stressTests: CoachSimulationStressTest[];
  robustCandidateIds: string[];
  rejectedCandidateIds: string[];
  selectedCandidateId?: string;
  automaticPlanChangeAllowed: boolean;
  explanation: string[];
  governanceRequired: true;
  auditable: true;
}

// V26.19 — Coach Meta-Learning
export type CoachLearningContextDimension =
  | 'training_phase'
  | 'sport_mix'
  | 'recovery_state'
  | 'schedule_pattern'
  | 'injury_context'
  | 'experience_level';

export type CoachTransferability = 'high' | 'moderate' | 'low' | 'not_transferable' | 'unknown';
export type CoachMetaRecommendation = 'reuse' | 'adapt' | 'retest' | 'do_not_transfer';

export interface CoachLearningContext {
  contextId: string;
  dimensions: Partial<Record<CoachLearningContextDimension, string>>;
  athleteId?: string;
  observedAt: string;
}

export interface CoachLearningEpisode {
  episodeId: string;
  strategyId: string;
  context: CoachLearningContext;
  outcome: 'beneficial' | 'neutral' | 'harmful' | 'unknown';
  evidenceStrength: 'strong' | 'moderate' | 'weak' | 'insufficient';
  athleteApproved: boolean;
  safetyViolation: boolean;
  provenance: string[];
}

export interface CoachContextSimilarity {
  sourceContextId: string;
  targetContextId: string;
  matchedDimensions: CoachLearningContextDimension[];
  mismatchedDimensions: CoachLearningContextDimension[];
  unknownDimensions: CoachLearningContextDimension[];
  transferability: CoachTransferability;
}

export interface CoachStrategyTransferAssessment {
  strategyId: string;
  sourceEpisodeIds: string[];
  targetContextId: string;
  similarity: CoachContextSimilarity;
  recommendation: CoachMetaRecommendation;
  supportingEpisodeIds: string[];
  conflictingEpisodeIds: string[];
  automaticApplicationAllowed: boolean;
  athleteConfirmationRequired: boolean;
  explanation: string[];
  auditable: boolean;
}

export interface CoachMetaLearningReport {
  reportId: string;
  targetContextId: string;
  assessments: CoachStrategyTransferAssessment[];
  reusableStrategyIds: string[];
  adaptationRequiredStrategyIds: string[];
  blockedStrategyIds: string[];
  explanation: string[];
  governanceRequired: true;
}

// V26.20 — Unified Coaching OS
export type UnifiedCoachStage =
  | 'evidence'
  | 'causal_guardrails'
  | 'uncertainty'
  | 'optimization'
  | 'simulation'
  | 'meta_learning'
  | 'governance'
  | 'athlete_decision';

export type UnifiedCoachDisposition =
  | 'recommend'
  | 'offer_choice'
  | 'request_information'
  | 'hold'
  | 'block';

export interface UnifiedCoachStageResult {
  stage: UnifiedCoachStage;
  status: 'passed' | 'attention' | 'blocked' | 'not_available';
  summary: string;
  evidenceRefs: string[];
  blockingReasons: string[];
}

export interface UnifiedCoachCandidate {
  candidateId: string;
  label: string;
  feasible: boolean;
  robust: boolean;
  recommendationStrength: 'strong' | 'moderate' | 'tentative' | 'insufficient_evidence' | 'do_not_recommend';
  athleteConfirmationRequired: boolean;
  safetyViolation: boolean;
  clinicianRestrictionViolation: boolean;
  governanceApproved: boolean;
  explanation: string[];
}

export interface UnifiedCoachRequest {
  requestId: string;
  athleteId: string;
  createdAt: string;
  candidateIds: string[];
  requestedAutomaticChange: boolean;
  unresolvedInformationGaps: string[];
  provenance: string[];
}

export interface UnifiedCoachingOsDecision {
  decisionId: string;
  requestId: string;
  disposition: UnifiedCoachDisposition;
  selectedCandidateId?: string;
  eligibleCandidateIds: string[];
  rejectedCandidateIds: string[];
  stageResults: UnifiedCoachStageResult[];
  automaticPlanChangeAllowed: boolean;
  athleteConfirmationRequired: boolean;
  informationRequested: string[];
  explanation: string[];
  provenance: string[];
  auditable: true;
  governanceRequired: true;
}

export interface UnifiedCoachSummary {
  headline: string;
  recommendation?: string;
  confidenceLabel: string;
  reason: string;
  nextAction: string;
  technicalDetailsAvailable: boolean;
}

// V26.21 — Decision reassessment and expiry
export type CoachReassessmentTriggerKind =
  | 'scheduled_review'
  | 'athlete_check_in'
  | 'workout_completed'
  | 'workout_missed'
  | 'symptom_change'
  | 'restriction_change'
  | 'availability_change'
  | 'new_evidence'
  | 'manual_review';

export type CoachDecisionFreshness = 'current' | 'review_due' | 'stale' | 'invalidated';

export interface CoachReassessmentTrigger {
  triggerId: string;
  kind: CoachReassessmentTriggerKind;
  occurredAt: string;
  material: boolean;
  summary: string;
  provenance: string[];
}

export interface CoachDecisionReviewPolicy {
  policyId: string;
  reviewAfterHours: number;
  expireAfterHours: number;
  materialTriggerKinds: CoachReassessmentTriggerKind[];
  requireAthleteCheckInBeforeReapply: boolean;
}

export interface CoachDecisionReassessmentRequest {
  requestId: string;
  decisionId: string;
  decisionCreatedAt: string;
  evaluatedAt: string;
  previouslyApplied: boolean;
  triggers: CoachReassessmentTrigger[];
  policy: CoachDecisionReviewPolicy;
}

export interface CoachDecisionReassessment {
  reassessmentId: string;
  decisionId: string;
  freshness: CoachDecisionFreshness;
  materialTriggerIds: string[];
  automaticReapplicationAllowed: boolean;
  athleteConfirmationRequired: boolean;
  fullRecomputationRequired: boolean;
  nextReviewAt?: string;
  explanation: string[];
  provenance: string[];
  auditable: true;
}


// V26.22 — Decision audit replay
export type CoachAuditEventKind =
  | 'request_received'
  | 'stage_evaluated'
  | 'candidate_rejected'
  | 'candidate_selected'
  | 'information_requested'
  | 'athlete_confirmation'
  | 'decision_applied'
  | 'decision_reassessed'
  | 'decision_invalidated';

export interface CoachDecisionAuditEvent {
  eventId: string;
  decisionId: string;
  occurredAt: string;
  sequence: number;
  kind: CoachAuditEventKind;
  actor: 'system' | 'athlete' | 'coach' | 'clinician';
  summary: string;
  inputRefs: string[];
  outputRefs: string[];
  policyRefs: string[];
  previousEventHash?: string;
  eventHash: string;
}

export interface CoachDecisionAuditTrail {
  trailId: string;
  decisionId: string;
  events: CoachDecisionAuditEvent[];
  complete: boolean;
  integrityVerified: boolean;
  missingSequenceNumbers: number[];
  explanation: string[];
  auditable: true;
}

export interface CoachDecisionReplayResult {
  replayId: string;
  decisionId: string;
  reproducedDisposition?: UnifiedCoachDisposition;
  expectedDisposition?: UnifiedCoachDisposition;
  reproducedSelectedCandidateId?: string;
  expectedSelectedCandidateId?: string;
  deterministicMatch: boolean;
  replayable: boolean;
  divergenceReasons: string[];
  provenance: string[];
  auditable: true;
}

export interface CoachAuditExport {
  exportId: string;
  decisionId: string;
  generatedAt: string;
  eventCount: number;
  integrityVerified: boolean;
  humanSummary: string[];
  technicalPayloadIncluded: boolean;
}

// V26.23 — Counterfactual coach reasoning
export type CounterfactualVariable =
  | 'recovery'
  | 'soreness'
  | 'availability_minutes'
  | 'race_proximity'
  | 'recent_training_load'
  | 'injury_status'
  | 'athlete_preference'
  | 'equipment_access'
  | 'weather';

export type DecisionSensitivity = 'stable' | 'moderately_sensitive' | 'highly_sensitive' | 'indeterminate';

export interface CounterfactualScenario {
  scenarioId: string;
  decisionId: string;
  variable: CounterfactualVariable;
  baselineValue: string | number | boolean;
  counterfactualValue: string | number | boolean;
  changedFields: string[];
  immutableFieldsPreserved: boolean;
  safetyConstraintsPreserved: boolean;
  realistic: boolean;
  explanation: string[];
}

export interface CounterfactualOutcome {
  scenarioId: string;
  originalCandidateId?: string;
  counterfactualCandidateId?: string;
  dispositionChanged: boolean;
  candidateChanged: boolean;
  materiallyChanged: boolean;
  blockedBySafety: boolean;
  reasons: string[];
}

export interface DecisionBoundary {
  variable: CounterfactualVariable;
  boundaryValue?: string | number | boolean;
  found: boolean;
  direction?: 'increase' | 'decrease' | 'change';
  explanation: string[];
}

export interface CounterfactualExplanation {
  decisionId: string;
  sensitivity: DecisionSensitivity;
  primaryDrivers: CounterfactualVariable[];
  minimalChanges: string[];
  unchangedFactors: string[];
  noRealisticChangeWouldAlterDecision: boolean;
  safetyNote: string;
  provenance: string[];
  auditable: true;
}

// V26.24 — Athlete response, override, and appeal workflow
export type AthleteDecisionResponseKind =
  | 'accept'
  | 'accept_with_modification'
  | 'defer'
  | 'decline'
  | 'request_alternative'
  | 'appeal';

export type AthleteAppealReasonKind =
  | 'symptoms_changed'
  | 'schedule_changed'
  | 'equipment_unavailable'
  | 'preference_mismatch'
  | 'recommendation_unclear'
  | 'safety_concern'
  | 'clinician_guidance'
  | 'other';

export type AthleteAppealDisposition =
  | 'accepted'
  | 'alternative_required'
  | 'reassessment_required'
  | 'clinician_review_required'
  | 'declined_with_explanation';

export interface AthleteDecisionResponse {
  responseId: string;
  decisionId: string;
  athleteId: string;
  kind: AthleteDecisionResponseKind;
  submittedAt: string;
  reasonKinds: AthleteAppealReasonKind[];
  note?: string;
  requestedCandidateId?: string;
  requestedChanges: string[];
  provenance: string[];
}

export interface AthleteDecisionAppeal {
  appealId: string;
  decisionId: string;
  responseId: string;
  createdAt: string;
  reasonKinds: AthleteAppealReasonKind[];
  materialNewInformation: boolean;
  allegesSafetyConcern: boolean;
  citesClinicianGuidance: boolean;
  requestedResolution?: string;
  provenance: string[];
  auditable: true;
}

export interface AthleteAppealAssessment {
  assessmentId: string;
  appealId: string;
  disposition: AthleteAppealDisposition;
  automaticOverrideAllowed: boolean;
  fullReassessmentRequired: boolean;
  clinicianReviewRequired: boolean;
  selectedAlternativeCandidateId?: string;
  explanation: string[];
  provenance: string[];
  auditable: true;
}

export interface AthleteResponseSummary {
  headline: string;
  status: string;
  explanation: string;
  nextAction: string;
  technicalDetailsAvailable: boolean;
}

// V26.25 — Coaching workflow and protected recurring commitments
export type ProtectedCommitmentSource = 'athlete' | 'calendar' | 'coach' | 'club';
export type CoachingWorkflowKind = 'recommendation' | 'approval' | 'appeal' | 'reassessment' | 'expiry' | 'clinician_review';
export type CoachingWorkflowStatus = 'open' | 'waiting_for_athlete' | 'waiting_for_coach' | 'waiting_for_clinician' | 'resolved' | 'expired';

export interface ProtectedRecurringCommitment {
  commitmentId: string;
  athleteId: string;
  title: string;
  sport?: 'swim' | 'bike' | 'run' | 'strength' | 'recovery' | 'other';
  weekdays: number[];
  localStartTime: string;
  durationMinutes: number;
  timezone: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  immovable: boolean;
  source: ProtectedCommitmentSource;
  notes?: string;
  provenance: string[];
}

export interface ProposedSchedulePlacement {
  placementId: string;
  title: string;
  localDate: string;
  localStartTime: string;
  durationMinutes: number;
  timezone: string;
}

export interface ProtectedCommitmentConflict {
  commitmentId: string;
  placementId: string;
  overlapMinutes: number;
  hardConflict: boolean;
  explanation: string;
}

export interface ScheduleProtectionResult {
  placementId: string;
  allowed: boolean;
  conflicts: ProtectedCommitmentConflict[];
  requiresAthleteOverride: boolean;
  explanation: string[];
  auditable: true;
}

export interface CoachingWorkflowItem {
  workflowItemId: string;
  decisionId: string;
  kind: CoachingWorkflowKind;
  status: CoachingWorkflowStatus;
  title: string;
  summary: string;
  createdAt: string;
  dueAt?: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  athleteActionRequired: boolean;
  blockedByCommitmentIds: string[];
  provenance: string[];
}

export interface CoachingWorkflowInbox {
  generatedAt: string;
  items: CoachingWorkflowItem[];
  actionRequiredItemIds: string[];
  waitingItemIds: string[];
  informationalItemIds: string[];
  safeguards: string[];
}

// V26.26 — Season operations center
export type SeasonEventKind =
  | 'race'
  | 'training_camp'
  | 'travel'
  | 'vacation'
  | 'illness'
  | 'recovery_week'
  | 'taper'
  | 'testing'
  | 'transition'
  | 'equipment_constraint'
  | 'environment_constraint';

export type SeasonConstraintSeverity = 'hard' | 'approval_required' | 'preference';

export interface SeasonOperationEvent {
  eventId: string;
  athleteId: string;
  kind: SeasonEventKind;
  title: string;
  startsOn: string;
  endsOn: string;
  timezone: string;
  severity: SeasonConstraintSeverity;
  allowedSports?: Array<'swim' | 'bike' | 'run' | 'strength' | 'recovery'>;
  unavailableEquipment: string[];
  availableEquipment: string[];
  environmentTags: string[];
  notes?: string;
  provenance: string[];
}

export interface SeasonAdjustmentProposal {
  proposalId: string;
  eventId: string;
  affectedSessionIds: string[];
  moveSessionIds: string[];
  replaceSessionIds: string[];
  removeSessionIds: string[];
  volumeChangePercent: number;
  explanation: string[];
  alternativesConsidered: string[];
  tradeoffs: string[];
  confidence: 'high' | 'moderate' | 'low' | 'indeterminate';
  requiresAthleteApproval: boolean;
  auditable: true;
}

export interface SeasonTimeline {
  athleteId: string;
  startsOn: string;
  endsOn: string;
  events: SeasonOperationEvent[];
  protectedCommitmentIds: string[];
  safeguards: string[];
}

export interface SeasonSessionContext {
  sessionId: string;
  sport: 'swim' | 'bike' | 'run' | 'strength' | 'recovery';
  localDate: string;
  equipmentRequired: string[];
  environmentRequired: string[];
  movable: boolean;
}

export interface SeasonConstraintEvaluation {
  sessionId: string;
  allowed: boolean;
  blockingEventIds: string[];
  reviewEventIds: string[];
  reasons: string[];
  auditable: true;
}

// V27.0 — Coaching product integration
export type ExecutablePlanActionKind =
  | 'move_session'
  | 'replace_session'
  | 'resize_session'
  | 'remove_session'
  | 'add_session'
  | 'preserve_session';

export type ExecutablePlanChangeStatus = 'preview' | 'approved' | 'applied' | 'rejected' | 'undone' | 'blocked';

export interface ExecutablePlanSessionSnapshot {
  sessionId: string;
  title: string;
  sport: 'swim' | 'bike' | 'run' | 'strength' | 'recovery';
  localDate: string;
  localStartTime?: string;
  durationMinutes: number;
  protected: boolean;
}

export interface ExecutablePlanAction {
  actionId: string;
  kind: ExecutablePlanActionKind;
  before?: ExecutablePlanSessionSnapshot;
  after?: ExecutablePlanSessionSnapshot;
  reason: string;
  sourceDecisionId: string;
  sourceProposalId?: string;
}

export interface ExecutablePlanChangeSet {
  changeSetId: string;
  athleteId: string;
  sourceDecisionId: string;
  createdAt: string;
  status: ExecutablePlanChangeStatus;
  actions: ExecutablePlanAction[];
  blockedReasons: string[];
  requiresAthleteApproval: boolean;
  idempotencyKey: string;
  provenance: string[];
  auditable: true;
}

export interface PlanChangePreview {
  changeSetId: string;
  headline: string;
  summary: string[];
  preservedSessionIds: string[];
  changedSessionIds: string[];
  blockedActionIds: string[];
  requiresAthleteApproval: boolean;
}

export interface PlanChangeApplicationResult {
  changeSetId: string;
  status: 'applied' | 'blocked' | 'already_applied';
  appliedActionIds: string[];
  skippedActionIds: string[];
  undoToken?: string;
  explanation: string[];
  auditable: true;
}

export interface PlanChangeUndoResult {
  changeSetId: string;
  status: 'undone' | 'not_found' | 'not_allowed';
  restoredSessionIds: string[];
  explanation: string[];
  auditable: true;
}


// V27.1 — Daily coaching loop
export type DailyCoachPriorityKind = 'protect' | 'complete' | 'shorten' | 'delay' | 'substitute' | 'recover' | 'skip';
export type DailyCoachEventKind = 'completed' | 'skipped' | 'cut_short' | 'fatigue' | 'pain' | 'weather_change' | 'pool_closure' | 'travel_delay' | 'equipment_unavailable';
export type DailyCoachDecisionStatus = 'informational' | 'pending_athlete' | 'blocked' | 'no_change';

export interface DailyCoachSession {
  sessionId: string;
  title: string;
  sport: 'swim' | 'bike' | 'run' | 'strength' | 'recovery';
  localDate: string;
  localStartTime?: string;
  durationMinutes: number;
  protected: boolean;
  priorityRank: number;
}

export interface DailyCoachSignal {
  signalId: string;
  kind: DailyCoachEventKind;
  occurredAt: string;
  sessionId?: string;
  severity?: 'low' | 'moderate' | 'high';
  note?: string;
}

export interface DailyCoachPriority {
  priorityId: string;
  kind: DailyCoachPriorityKind;
  sessionId?: string;
  headline: string;
  rationale: string;
  protected: boolean;
}

export interface DailyCoachOption {
  optionId: string;
  label: string;
  summary: string;
  trainingEffect: string;
  recoveryImpact: string;
  raceImpact: string;
  confidence: 'low' | 'moderate' | 'high';
  requiresAthleteApproval: boolean;
}

export interface DailyCoachBrief {
  briefId: string;
  athleteId: string;
  localDate: string;
  headline: string;
  summary: string[];
  priorities: DailyCoachPriority[];
  protectedCommitmentIds: string[];
  pendingDecisionIds: string[];
  generatedAt: string;
  auditable: true;
}

export interface DailyCoachDecision {
  decisionId: string;
  triggerSignalIds: string[];
  status: DailyCoachDecisionStatus;
  headline: string;
  options: DailyCoachOption[];
  recommendedOptionId?: string;
  explanation: string[];
  requiresAthleteApproval: boolean;
  auditable: true;
}

export interface AdaptiveCheckIn {
  checkInId: string;
  prompt: string;
  reason: string;
  relatedSessionId?: string;
  answerKind: 'yes_no' | 'scale' | 'text' | 'single_select';
  options?: string[];
  requiredBeforeDecision: boolean;
}

// V27.2 — Session execution loop
export type SessionExecutionStatus = 'planned' | 'ready' | 'modified' | 'completed' | 'stopped' | 'skipped';
export type SessionReadinessRecommendation = 'proceed' | 'shorten' | 'substitute' | 'delay' | 'recover' | 'review_required';

export interface SessionReadinessInput {
  sessionId: string;
  checkedAt: string;
  energy: 'low' | 'okay' | 'good';
  soreness: 'none' | 'mild' | 'moderate' | 'high';
  pain: 'none' | 'mild' | 'moderate' | 'high';
  availableMinutes: number;
  plannedMinutes: number;
  equipmentAvailable: boolean;
  environmentFeasible: boolean;
  protected: boolean;
}

export interface SessionReadinessAssessment {
  sessionId: string;
  recommendation: SessionReadinessRecommendation;
  headline: string;
  reasons: string[];
  requiresAthleteApproval: boolean;
  requiresClinicalReview: boolean;
  generatedAt: string;
  auditable: true;
}

export interface SessionExecutionRecord {
  executionId: string;
  sessionId: string;
  status: SessionExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  actualMinutes?: number;
  perceivedEffort?: 'easy' | 'steady' | 'hard' | 'very_hard';
  painDuring?: 'none' | 'mild' | 'moderate' | 'high';
  athleteNote?: string;
  modificationSummary?: string;
}

export interface PostSessionCoachSummary {
  executionId: string;
  headline: string;
  observations: string[];
  nextAction: 'none' | 'monitor' | 'offer_plan_change' | 'clinical_review';
  planChangeApplied: false;
  requiresAthleteApproval: boolean;
  auditable: true;
}


// V27.3 — Active workout logging
export type WorkoutExerciseLoadUnit = 'lb' | 'kg' | 'bodyweight' | 'band' | 'none';
export type WorkoutExerciseSideMode = 'total' | 'per_side' | 'time';

export interface ActiveWorkoutExercise {
  exerciseId: string;
  name: string;
  targetReps?: number;
  targetSeconds?: number;
  sideMode: WorkoutExerciseSideMode;
  loadUnit: WorkoutExerciseLoadUnit;
  suggestedLoad?: number;
  optional: boolean;
  order: number;
}

export interface ActiveWorkoutStation {
  stationId: string;
  title: string;
  durationMinutes: number;
  exercises: ActiveWorkoutExercise[];
  order: number;
}

export interface ActiveWorkoutDraft {
  workoutId: string;
  title: string;
  stations: ActiveWorkoutStation[];
  status: 'draft' | 'active' | 'completed';
  editedBeforeStart: boolean;
  startedAt?: string;
  completedAt?: string;
}

export interface ExercisePerformanceEntry {
  exerciseId: string;
  completedReps?: number;
  completedSeconds?: number;
  load?: number;
  loadUnit: WorkoutExerciseLoadUnit;
  note?: string;
}

export interface WorkoutRoundLog {
  roundLogId: string;
  workoutId: string;
  stationId: string;
  roundNumber: number;
  recordedDuringRest: true;
  recordedAt: string;
  exerciseEntries: ExercisePerformanceEntry[];
}

export interface ActiveWorkoutEdit {
  stationId: string;
  durationMinutes?: number;
  exerciseId?: string;
  targetReps?: number;
  targetSeconds?: number;
}

export interface ActiveWorkoutProgress {
  workoutId: string;
  completedRoundLogs: number;
  exerciseTotals: Array<{
    exerciseId: string;
    totalReps: number;
    totalSeconds: number;
    latestLoad?: number;
    loadUnit: WorkoutExerciseLoadUnit;
  }>;
}
// V27.4 — Workout completion, naming, and sharing
export type WorkoutNameTone = 'adventure' | 'playful' | 'focused' | 'minimal';
export type MuscleMapView = 'front' | 'back';
export type WorkoutShareAudience = 'private' | 'friends' | 'public';

export interface CompletedWorkoutExerciseSummary {
  exerciseId: string;
  name: string;
  totalReps: number;
  totalSeconds: number;
  latestLoad?: number;
  loadUnit: WorkoutExerciseLoadUnit;
}

export interface WorkoutMuscleRegion {
  regionId: string;
  label: string;
  view: MuscleMapView;
  contribution: 'primary' | 'secondary';
}

export interface CompletedWorkoutSummary {
  workoutId: string;
  originalTitle: string;
  displayName: string;
  completedAt: string;
  actualMinutes: number;
  completedRoundLogs: number;
  exercises: CompletedWorkoutExerciseSummary[];
  muscleRegions: WorkoutMuscleRegion[];
  editedBeforeStart: boolean;
  athleteNote?: string;
}

export interface WorkoutSharePreferences {
  audience: WorkoutShareAudience;
  includeDuration: boolean;
  includeExerciseNames: boolean;
  includeRoundCount: boolean;
  includeWeights: boolean;
  includeMuscleMap: boolean;
  includeAthleteNote: boolean;
}

export interface WorkoutShareCard {
  shareCardId: string;
  workoutId: string;
  displayName: string;
  subtitle: string;
  facts: string[];
  muscleRegions: WorkoutMuscleRegion[];
  exerciseNames: string[];
  athleteNote?: string;
  weightsIncluded: boolean;
  audience: WorkoutShareAudience;
  generatedAt: string;
  privacySummary: string;
}

export interface SavedWorkoutReference {
  savedWorkoutId: string;
  sourceWorkoutId: string;
  displayName: string;
  originalTitle: string;
  savedAt: string;
  completedVersion: true;
  favorite: boolean;
}


// V27.5 — Active workout persistence and interruption recovery
export type ActiveWorkoutPersistenceStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type ActiveWorkoutTimerState = 'running' | 'paused' | 'stopped';

export interface ActiveWorkoutCheckpoint {
  schemaVersion: 1;
  checkpointId: string;
  workoutId: string;
  persistenceStatus: ActiveWorkoutPersistenceStatus;
  draft: ActiveWorkoutDraft;
  roundLogs: WorkoutRoundLog[];
  currentStationId?: string;
  currentRoundNumber: number;
  elapsedSeconds: number;
  timerState: ActiveWorkoutTimerState;
  savedAt: string;
  revision: number;
  completionRecordId?: string;
  completedAt?: string;
  abandonedAt?: string;
}

export interface ActiveWorkoutRestoreResult {
  checkpoint: ActiveWorkoutCheckpoint;
  recoveredAfterInterruption: boolean;
  duplicateRoundLogsRemoved: number;
  warnings: string[];
}

export interface ActiveWorkoutPersistenceWrite {
  storageKey: string;
  serializedCheckpoint: string;
  expectedPreviousRevision: number | null;
  nextRevision: number;
}

export interface ActiveWorkoutCompletionCommit {
  checkpoint: ActiveWorkoutCheckpoint;
  completionRecordId: string;
  alreadyCommitted: boolean;
}

// V27.6 — Mobile workout flow integration
export type MobileWorkoutScreen =
  | 'pre_workout'
  | 'active_station'
  | 'rest_logging'
  | 'paused'
  | 'completion_summary';

export type MobileWorkoutPrimaryAction =
  | 'start'
  | 'complete_round'
  | 'save_round'
  | 'resume'
  | 'finish'
  | 'done';

export interface MobileWorkoutFlowState {
  workoutId: string;
  screen: MobileWorkoutScreen;
  checkpoint?: ActiveWorkoutCheckpoint;
  draft: ActiveWorkoutDraft;
  pendingRoundLog?: WorkoutRoundLog;
  completedSummary?: CompletedWorkoutSummary;
  primaryAction: MobileWorkoutPrimaryAction;
  canEditStructure: boolean;
  canPause: boolean;
  canFinish: boolean;
  statusMessage: string;
}

export interface MobilePreWorkoutEditorModel {
  workoutId: string;
  title: string;
  totalPlannedMinutes: number;
  stationCount: number;
  stations: Array<{
    stationId: string;
    title: string;
    durationMinutes: number;
    exerciseCount: number;
    editable: boolean;
  }>;
  canAddFinisher: boolean;
  startLabel: string;
}

export interface MobileRestLoggingModel {
  workoutId: string;
  stationId: string;
  roundNumber: number;
  exerciseRows: Array<{
    exerciseId: string;
    name: string;
    targetLabel: string;
    completedReps?: number;
    completedSeconds?: number;
    load?: number;
    loadUnit: WorkoutExerciseLoadUnit;
  }>;
  saveLabel: string;
}

export interface MobileWorkoutCompletionModel {
  summary: CompletedWorkoutSummary;
  shareCard: WorkoutShareCard;
  actions: Array<'favorite' | 'rename' | 'share' | 'done'>;
  weightsShared: boolean;
}

// V27.7 — Workout history, recall, and progression
export type WorkoutHistoryCollection =
  | 'favorites'
  | 'recent'
  | 'coach_recommended'
  | 'race_specific'
  | 'push'
  | 'pull'
  | 'lower_body'
  | 'core'
  | 'mobility'
  | 'hotel_gym'
  | 'home_gym';

export type WorkoutRepeatMode = 'exact' | 'progressed' | 'recovery' | 'variation';
export type WorkoutProgressionKind = 'load' | 'reps' | 'duration' | 'exercise_variant' | 'none';

export interface WorkoutHistoryRecord {
  historyId: string;
  workoutId: string;
  sourceWorkoutId: string;
  displayName: string;
  completedAt: string;
  durationMinutes: number;
  completedSummary: CompletedWorkoutSummary;
  originalDraft: ActiveWorkoutDraft;
  completedDraft: ActiveWorkoutDraft;
  collections: WorkoutHistoryCollection[];
  favorite: boolean;
  notes?: string;
  perceivedExertion?: number;
}

export interface WorkoutProgressionRecommendation {
  workoutId: string;
  kind: WorkoutProgressionKind;
  rationale: string;
  eligible: boolean;
  confidence: 'low' | 'moderate' | 'high';
  targetExerciseId?: string;
  targetDelta?: number;
}

export interface WorkoutRecallRequest {
  historyId: string;
  mode: WorkoutRepeatMode;
  preserveTrainingIntent: boolean;
}

export interface WorkoutHistoryFilter {
  query?: string;
  collection?: WorkoutHistoryCollection;
  minimumDurationMinutes?: number;
  maximumDurationMinutes?: number;
  completedAfter?: string;
  completedBefore?: string;
  favoriteOnly?: boolean;
}

// V27.8 — End-to-end validation and production hardening
export type WorkoutFlowValidationStage =
  | 'generated'
  | 'edited'
  | 'started'
  | 'logged'
  | 'paused'
  | 'resumed'
  | 'finished'
  | 'persisted'
  | 'favorited'
  | 'shared';

export interface WorkoutFlowValidationIssue {
  stage: WorkoutFlowValidationStage;
  severity: 'warning' | 'error';
  code: string;
  message: string;
}

export interface WorkoutFlowValidationReport {
  workoutId: string;
  passed: boolean;
  completedStages: WorkoutFlowValidationStage[];
  issues: WorkoutFlowValidationIssue[];
  duplicateCompletionDetected: boolean;
  staleCheckpointDetected: boolean;
  generatedAt: string;
}

export interface WorkoutMigrationResult {
  sourceSchemaVersion: number;
  targetSchemaVersion: number;
  migrated: boolean;
  preservedWorkoutId: boolean;
  warnings: string[];
}

// V28.0 — UI architecture foundation
export type SideQuestPrimaryTab = 'today' | 'train' | 'plan' | 'progress' | 'you';

export type UiSectionPresentation =
  | 'hero'
  | 'inline-summary'
  | 'timeline'
  | 'horizontal-rail'
  | 'workspace'
  | 'body-map'
  | 'settings-group';

export type UiSectionVisibility = 'always' | 'when-relevant' | 'when-active' | 'when-populated';

export interface UiPageAction {
  id: string;
  label: string;
  kind: 'primary' | 'secondary' | 'tertiary' | 'destructive';
  interaction: 'inline' | 'bottom-sheet' | 'modal' | 'push' | 'full-screen-mode';
  destination?: string;
}

export interface UiPageSection {
  id: string;
  title: string;
  purpose: string;
  presentation: UiSectionPresentation;
  visibility: UiSectionVisibility;
  directInformation: string[];
  actions: UiPageAction[];
  maximumVisibleItems?: number;
}

export interface UiPageBlueprint {
  tab: SideQuestPrimaryTab;
  title: string;
  coreQuestion: string;
  primaryObject: string;
  sections: UiPageSection[];
  excludedContent: string[];
}

export interface UiArchitectureDefinition {
  version: '28.0';
  tabs: SideQuestPrimaryTab[];
  pages: UiPageBlueprint[];
  contextualSurfaces: string[];
  principles: string[];
}

export interface UiArchitectureAuditIssue {
  page: SideQuestPrimaryTab;
  sectionId?: string;
  code:
    | 'missing-primary-object'
    | 'empty-main-page'
    | 'router-list-risk'
    | 'duplicate-section'
    | 'too-many-primary-actions'
    | 'missing-direct-information';
  message: string;
}

export interface UiArchitectureAudit {
  passed: boolean;
  issues: UiArchitectureAuditIssue[];
}

// V28.1 — Today workspace
export type TodayRecommendationState = 'ready' | 'adjusted' | 'decision_required' | 'rest_day' | 'empty';
export type TodayReadinessState = 'ready_as_planned' | 'modify' | 'recover' | 'review';
export type TodayTimelineItemKind = 'swim' | 'bike' | 'run' | 'strength' | 'recovery' | 'commitment';
export type TodayTimelineFlexibility = 'fixed' | 'protected' | 'flexible';

export interface TodayWorkoutRecommendation {
  id: string;
  name: string;
  workoutType: string;
  durationMinutes: number;
  purpose: string;
  timingLabel: string;
  equipmentLabel: string;
  whyToday: string;
  state: TodayRecommendationState;
  canStart: boolean;
  canEdit: boolean;
  canMove: boolean;
  canReplace: boolean;
}

export interface TodayReadinessSummary {
  state: TodayReadinessState;
  title: string;
  interpretation: string;
  painOrRestriction?: string;
  updatedAt?: string;
}

export interface TodayTimelineItem {
  id: string;
  kind: TodayTimelineItemKind;
  title: string;
  startLabel?: string;
  durationMinutes?: number;
  flexibility: TodayTimelineFlexibility;
  conflict: boolean;
  conflictMessage?: string;
}

export interface TodayCoachingOption {
  id: string;
  label: string;
  consequence: string;
  recommended: boolean;
}

export interface TodayCoachingResponse {
  id: string;
  trigger: string;
  summary: string;
  options: TodayCoachingOption[];
  requiresDecision: boolean;
}

export interface TodayUpcomingDay {
  dateLabel: string;
  headline: string;
  sessionCount: number;
  totalMinutes: number;
}

export interface TodayWorkspaceModel {
  dateLabel: string;
  greeting: string;
  recommendation: TodayWorkoutRecommendation;
  readiness: TodayReadinessSummary;
  timeline: TodayTimelineItem[];
  coachingResponse?: TodayCoachingResponse;
  upcoming: TodayUpcomingDay[];
  unresolvedInboxCount: number;
}

// V28.2 — Train workspace
export type TrainWorkoutSource = 'generated' | 'saved' | 'recent' | 'coach' | 'shared';
export type TrainWorkoutState = 'ready' | 'active' | 'paused' | 'completed' | 'unavailable';
export type TrainFocus = 'full_body' | 'lower_body' | 'upper_body' | 'core' | 'swim_support' | 'bike_support' | 'run_support' | 'mobility';
export type TrainIntensity = 'easy' | 'moderate' | 'hard' | 'adaptive';

export interface TrainActiveWorkoutSummary {
  workoutId: string;
  name: string;
  state: Extract<TrainWorkoutState, 'active' | 'paused'>;
  elapsedSeconds: number;
  currentStationLabel: string;
  currentRound: number;
  totalRounds: number;
}

export interface TrainBuilderPreferences {
  durationMinutes: number;
  equipmentLabel: string;
  focus: TrainFocus;
  intensity: TrainIntensity;
  locationLabel: string;
  restrictionLabels: string[];
}

export interface TrainQuickPreset {
  id: string;
  label: string;
  description: string;
  preferences: Partial<TrainBuilderPreferences>;
}

export interface TrainWorkoutCard {
  workoutId: string;
  name: string;
  source: TrainWorkoutSource;
  state: TrainWorkoutState;
  durationMinutes: number;
  focusLabel: string;
  equipmentLabel: string;
  muscleEmphasis: string[];
  recommendationReason?: string;
  canStart: boolean;
  canPreview: boolean;
  canSwap: boolean;
}

export interface TrainTogetherPrompt {
  invitationId: string;
  title: string;
  detail: string;
  actionLabel: string;
}

export interface TrainWorkspaceModel {
  activeWorkout?: TrainActiveWorkoutSummary;
  builder: TrainBuilderPreferences;
  quickPresets: TrainQuickPreset[];
  recommended: TrainWorkoutCard[];
  savedAndRecent: TrainWorkoutCard[];
  workoutTogether?: TrainTogetherPrompt;
}

// V28.3 — Plan workspace
export type PlanSessionSport = 'swim' | 'bike' | 'run' | 'strength' | 'recovery' | 'rest' | 'other';
export type PlanSessionStatus = 'planned' | 'completed' | 'missed' | 'moved' | 'proposed';
export type PlanFlexibility = 'fixed' | 'preferred' | 'flexible';
export type PlanAlertSeverity = 'info' | 'attention' | 'high';
export type PlanActionPresentation = 'inline' | 'bottom_sheet' | 'modal';

export interface PlanPhaseSummary {
  phaseId: string;
  title: string;
  weekLabel: string;
  objective: string;
  goalLabel?: string;
  goalDateLabel?: string;
}

export interface PlanSession {
  sessionId: string;
  title: string;
  sport: PlanSessionSport;
  status: PlanSessionStatus;
  durationMinutes: number;
  intensityLabel?: string;
  purposeLabel: string;
  timeLabel?: string;
  locationLabel?: string;
  flexibility: PlanFlexibility;
  isPriority: boolean;
  note?: string;
}

export interface PlanCommitment {
  commitmentId: string;
  title: string;
  timeLabel?: string;
  protected: boolean;
}

export interface PlanDay {
  dateKey: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  sessions: PlanSession[];
  commitments: PlanCommitment[];
}

export interface PlanResolutionAction {
  actionId: string;
  label: string;
  presentation: PlanActionPresentation;
  destructive?: boolean;
}

export interface PlanAlert {
  alertId: string;
  severity: PlanAlertSeverity;
  title: string;
  explanation: string;
  affectedSessionIds: string[];
  actions: PlanResolutionAction[];
}

export interface PlanControl {
  controlId: string;
  label: string;
  presentation: Extract<PlanActionPresentation, 'bottom_sheet' | 'modal'>;
}

export interface PlanRoadmapBlock {
  blockId: string;
  title: string;
  dateRangeLabel: string;
  emphasis: string;
  state: 'completed' | 'current' | 'upcoming';
}

export interface PlanWorkspaceModel {
  phase: PlanPhaseSummary;
  days: PlanDay[];
  alerts: PlanAlert[];
  controls: PlanControl[];
  roadmap: PlanRoadmapBlock[];
}

// V28.4 — Progress workspace
export type ProgressRegionalState =
  | 'ready_to_progress'
  | 'on_plan'
  | 'recently_trained'
  | 'strength_opportunity'
  | 'recover_before_loading'
  | 'review_symptoms';
export type ProgressTrendDirection = 'improving' | 'stable' | 'building' | 'recovering' | 'insufficient_data';
export type ProgressHistoryStatus = 'completed' | 'partial' | 'modified' | 'stopped';
export type ProgressMilestoneKind = 'first' | 'progression' | 'return' | 'block' | 'personal';

export interface ProgressRegionalStatus {
  regionId: string;
  regionLabel: string;
  state: ProgressRegionalState;
  interpretation: string;
  nextStep?: string;
  relatedSportLabels: string[];
}

export interface ProgressImprovement {
  improvementId: string;
  title: string;
  explanation: string;
  occurredAtLabel: string;
  exerciseId?: string;
  workoutId?: string;
}

export interface ProgressMovementTrend {
  movementId: string;
  movementLabel: string;
  direction: ProgressTrendDirection;
  summary: string;
  evidenceCount: number;
  latestValueLabel?: string;
  nextProgression?: string;
}

export interface ProgressTrainingBalance {
  summary: string;
  substantialStimulus: string[];
  maintained: string[];
  opportunities: string[];
  nextEmphasis: string[];
}

export interface ProgressHistoryItem {
  workoutId: string;
  name: string;
  completedAtLabel: string;
  durationMinutes: number;
  focusLabel: string;
  status: ProgressHistoryStatus;
  note?: string;
  canRepeat: boolean;
}

export interface ProgressMilestone {
  milestoneId: string;
  kind: ProgressMilestoneKind;
  title: string;
  detail: string;
  achievedAtLabel: string;
}

export interface ProgressWorkspaceModel {
  headline: string;
  interpretation: string;
  regionalStatus: ProgressRegionalStatus[];
  improvements: ProgressImprovement[];
  movementTrends: ProgressMovementTrend[];
  trainingBalance: ProgressTrainingBalance;
  recentHistory: ProgressHistoryItem[];
  milestones: ProgressMilestone[];
}

// V28.5 — You workspace
export type YouConnectionState = 'connected' | 'attention' | 'not_connected' | 'unsupported';
export type YouAccessState = 'active' | 'pending' | 'expired' | 'none';
export type YouControlPresentation = 'inline' | 'bottom_sheet' | 'modal' | 'route';

export interface YouAthleteProfileSummary {
  displayName?: string;
  primaryGoalLabel: string;
  nextEventLabel?: string;
  phaseLabel: string;
  weeklyAvailabilityLabel: string;
  strengthFrequencyLabel: string;
  equipmentProfileLabel: string;
}

export interface YouContextItem {
  contextId: string;
  label: string;
  value: string;
  detail?: string;
  needsAttention: boolean;
  editPresentation: Exclude<YouControlPresentation, 'route'>;
}

export interface YouConnectionItem {
  connectionId: string;
  providerLabel: string;
  state: YouConnectionState;
  statusLabel: string;
  detail?: string;
  lastSyncLabel?: string;
  actionLabel: string;
}

export interface YouCoachAccessSummary {
  state: YouAccessState;
  coachLabel?: string;
  detail: string;
  actionLabel?: string;
}

export interface YouSocialSummary {
  friendCount: number;
  pendingInvitationCount: number;
  sharingDefaultLabel: string;
  privacyLabel: string;
}

export interface YouSettingRow {
  settingId: string;
  label: string;
  valueLabel?: string;
  detail?: string;
  presentation: YouControlPresentation;
  attention?: boolean;
}

export interface YouWorkspaceModel {
  profile: YouAthleteProfileSummary;
  currentContext: YouContextItem[];
  connections: YouConnectionItem[];
  coachAccess: YouCoachAccessSummary;
  social: YouSocialSummary;
  appControls: YouSettingRow[];
}

// V28.6 — Athlete-first milestones and A/B/C race periodization
export type RacePriority = 'A' | 'B' | 'C';
export type SecondaryRaceIntent = 'race_fully' | 'supported_hard_workout' | 'training_day' | 'participate_without_disruption';
export type RaceAdjustmentKind = 'full_peak' | 'short_taper' | 'minimal_freshening' | 'replace_key_session' | 'recovery_only';
export type TrainingWinCategory = 'judgment' | 'recovery' | 'durability' | 'participation' | 'maintenance' | 'performance' | 'experience';
export type TrainingWinSafetyState = 'celebrate' | 'hold' | 'suppress';
export type AthleteFirstTrendState = 'building' | 'maintained' | 'reduced_intentionally' | 'returning' | 'modified' | 'insufficient_evidence';

export interface SeasonRace {
  raceId: string;
  name: string;
  date: string;
  sportLabel: string;
  distanceLabel?: string;
  priority: RacePriority;
  expectedEffortLabel?: string;
  travelRequired?: boolean;
  intent?: SecondaryRaceIntent;
}

export interface RacePeriodizationContext {
  races: SeasonRace[];
  currentDate: string;
  activePhaseLabel: string;
}

export interface SecondaryRaceAdjustment {
  raceId: string;
  priority: Exclude<RacePriority, 'A'>;
  weeksBeforeARace?: number;
  treatment: RaceAdjustmentKind;
  lighterDaysBefore: number;
  recoveryDaysAfter: number;
  preserveARaceOrientation: true;
  replaceExistingKeySession: boolean;
  guidance: string[];
}

export interface RaceHierarchyModel {
  aRace: SeasonRace;
  secondaryRaces: SeasonRace[];
  adjustments: SecondaryRaceAdjustment[];
  macrocycleOrientation: string;
}

export interface TrainingWinCandidate {
  winId: string;
  category: TrainingWinCategory;
  title: string;
  detail: string;
  occurredAtLabel: string;
  painIncreased?: boolean;
  safetyRecommendationIgnored?: boolean;
  requiredUnplannedExtraWork?: boolean;
  reflectsAppropriateModification?: boolean;
}

export interface TrainingWin extends TrainingWinCandidate {
  safetyState: TrainingWinSafetyState;
  celebrationReason: string;
}

export interface AthleteFirstMovementTrend {
  movementId: string;
  movementLabel: string;
  state: AthleteFirstTrendState;
  summary: string;
  evidenceCount: number;
}

export interface AthleteFirstProgressModel {
  headline: string;
  interpretation: string;
  trainingWins: TrainingWin[];
  movementTrends: AthleteFirstMovementTrend[];
  milestonesEnabled: boolean;
  milestoneNotificationsEnabled: boolean;
  safetyMessage?: string;
}

// V29.0.1 — Shared visible shell and navigation
// SideQuestPrimaryTab is canonically declared in the V28.0 UI architecture contracts above.
export type SideQuestCanvasTone = 'warm_neutral' | 'cool_neutral' | 'environmental';
export type SideQuestShellDensity = 'comfortable' | 'compact';
export type SideQuestHeaderActionKind = 'inbox' | 'profile' | 'search' | 'none';

export interface SideQuestNavigationItem {
  tab: SideQuestPrimaryTab;
  label: string;
  iconKey: 'sun' | 'dumbbell' | 'calendar' | 'body' | 'person';
  accessibilityLabel: string;
}

export interface SideQuestMastheadModel {
  wordmark: 'Side Quest';
  pageLabel: string;
  contextLabel?: string;
  action: SideQuestHeaderActionKind;
  attentionCount?: number;
  compact: true;
}

export interface SideQuestActiveWorkoutBar {
  workoutId: string;
  workoutName: string;
  progressLabel: string;
  resumeLabel: 'Resume';
  visibleAcrossTabs: true;
}

export interface SideQuestVisualTokens {
  outerGutter: number;
  cardRadius: number;
  cardGap: number;
  mastheadHeight: number;
  bottomNavigationHeight: number;
  minimumTapTarget: number;
  canvasTone: SideQuestCanvasTone;
  density: SideQuestShellDensity;
  useCardBorders: boolean;
  useCardShadow: boolean;
}

export interface SideQuestShellModel {
  activeTab: SideQuestPrimaryTab;
  masthead: SideQuestMastheadModel;
  navigation: SideQuestNavigationItem[];
  tokens: SideQuestVisualTokens;
  activeWorkout?: SideQuestActiveWorkoutBar;
  hideBottomNavigation: boolean;
  screenReaderOrder: string[];
}

// V29.1 — Visible Today workspace
export type V29TodayTone = 'standard' | 'recovery' | 'attention' | 'open';
export type V29TodayActionKind = 'start' | 'edit' | 'move' | 'replace' | 'check_in' | 'add_restriction' | 'apply_adjustment' | 'keep_original' | 'view_reasoning' | 'build_workout' | 'add_session' | 'recovery_day';

export interface V29TodayAction {
  actionId: string;
  kind: V29TodayActionKind;
  label: string;
  primary: boolean;
  accessibilityLabel: string;
}

export interface V29TodayHeroCard {
  eyebrow: string;
  title: string;
  metaLine: string;
  purpose: string;
  sourceLabel?: string;
  tone: V29TodayTone;
  actions: V29TodayAction[];
}

export interface V29TodayReadinessCard {
  title: string;
  interpretation: string;
  tone: V29TodayTone;
  restrictionLabel?: string;
  actions: V29TodayAction[];
}

export interface V29TodayTimelineRow {
  id: string;
  timeLabel: string;
  title: string;
  detail: string;
  statusLabel?: string;
  conflictMessage?: string;
  iconKey: string;
}

export interface V29TodayDecisionCard {
  title: string;
  explanation: string;
  tone: 'attention';
  actions: V29TodayAction[];
}

export interface V29TodayUpcomingCard {
  dayLabel: string;
  title: string;
  detail: string;
}

export interface V29TodayVisibleScreenModel {
  dateLabel: string;
  phaseContext?: string;
  hero: V29TodayHeroCard;
  readiness: V29TodayReadinessCard;
  timeline: V29TodayTimelineRow[];
  decision?: V29TodayDecisionCard;
  upcoming: V29TodayUpcomingCard[];
  screenReaderOrder: Array<'date' | 'readiness' | 'hero' | 'timeline' | 'decision' | 'upcoming'>;
  bottomInsetForNavigation: number;
}

// V29.2 — Visible Train workspace
export type V29TrainActionKind =
  | 'resume_workout'
  | 'build_workout'
  | 'apply_preset'
  | 'start_workout'
  | 'preview_workout'
  | 'swap_workout'
  | 'open_saved'
  | 'open_together';

export interface V29TrainAction {
  actionId: string;
  kind: V29TrainActionKind;
  label: string;
  accessibilityLabel: string;
  primary?: boolean;
  workoutId?: string;
  presetId?: string;
}

export interface V29TrainActiveCard {
  eyebrow: string;
  title: string;
  progressLabel: string;
  stationLabel: string;
  actions: V29TrainAction[];
}

export interface V29TrainBuilderCard {
  title: string;
  summary: string;
  durationLabel: string;
  equipmentLabel: string;
  focusLabel: string;
  intensityLabel: string;
  locationLabel: string;
  restrictionLabel?: string;
  actions: V29TrainAction[];
}

export interface V29TrainPresetCard {
  id: string;
  title: string;
  description: string;
  action: V29TrainAction;
}

export interface V29TrainWorkoutVisibleCard {
  workoutId: string;
  eyebrow: string;
  title: string;
  metaLine: string;
  emphasisLabel?: string;
  reason?: string;
  unavailableMessage?: string;
  actions: V29TrainAction[];
}

export interface V29TrainTogetherCard {
  title: string;
  detail: string;
  action: V29TrainAction;
}

export interface V29TrainVisibleScreenModel {
  activeWorkout?: V29TrainActiveCard;
  builder: V29TrainBuilderCard;
  presets: V29TrainPresetCard[];
  recommended: V29TrainWorkoutVisibleCard[];
  savedAndRecent: V29TrainWorkoutVisibleCard[];
  workoutTogether?: V29TrainTogetherCard;
  bottomInsetForNavigation: number;
}

// V29.3 — Visible Plan workspace
export type V29PlanActionKind =
  | 'open_session'
  | 'move_session'
  | 'edit_session'
  | 'resolve_alert'
  | 'adjust_availability'
  | 'change_emphasis'
  | 'add_event'
  | 'add_commitment'
  | 'open_roadmap';

export interface V29PlanAction {
  actionId: string;
  kind: V29PlanActionKind;
  label: string;
  primary: boolean;
  accessibilityLabel: string;
}

export interface V29PlanPhaseCard {
  eyebrow: string;
  title: string;
  weekLabel: string;
  objective: string;
  goalLine?: string;
}

export interface V29PlanSessionRow {
  sessionId: string;
  sport: PlanSessionSport;
  title: string;
  detail: string;
  timeLabel?: string;
  statusLabel: string;
  priorityLabel?: string;
  tone: 'standard' | 'completed' | 'attention' | 'proposed';
  actions: V29PlanAction[];
}

export interface V29PlanDayCard {
  dateKey: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  commitmentLabels: string[];
  sessions: V29PlanSessionRow[];
  emptyMessage?: string;
}

export interface V29PlanAlertCard {
  alertId: string;
  title: string;
  explanation: string;
  tone: 'info' | 'attention' | 'high';
  actions: V29PlanAction[];
}

export interface V29PlanRoadmapCard {
  blockId: string;
  title: string;
  dateRangeLabel: string;
  emphasis: string;
  stateLabel: string;
  current: boolean;
  actions: V29PlanAction[];
}

export interface V29PlanVisibleScreenModel {
  phase: V29PlanPhaseCard;
  weekLabel: string;
  totalTimeLabel: string;
  sportSummary: string[];
  days: V29PlanDayCard[];
  alerts: V29PlanAlertCard[];
  controls: V29PlanAction[];
  roadmap: V29PlanRoadmapCard[];
  emptyState?: string;
  screenReaderOrder: Array<'phase' | 'alerts' | 'week' | 'controls' | 'roadmap'>;
  bottomInsetForNavigation: number;
}

// V29.4 — Visible Progress workspace
export type V29ProgressActionKind =
  | 'open_region'
  | 'open_movement'
  | 'open_workout'
  | 'repeat_workout'
  | 'open_milestones'
  | 'open_training_balance';

export interface V29ProgressAction {
  actionId: string;
  kind: V29ProgressActionKind;
  label: string;
  accessibilityLabel: string;
  primary?: boolean;
  targetId?: string;
}

export interface V29ProgressOverviewCard {
  eyebrow: string;
  title: string;
  interpretation: string;
  primaryMessage: string;
}

export interface V29ProgressRegionalCard {
  regionId: string;
  regionLabel: string;
  stateLabel: string;
  interpretation: string;
  nextStep?: string;
  sportLine?: string;
  tone: 'progress' | 'steady' | 'recent' | 'opportunity' | 'recovery' | 'attention';
  actions: V29ProgressAction[];
}

export interface V29ProgressWinCard {
  improvementId: string;
  title: string;
  explanation: string;
  occurredAtLabel: string;
}

export interface V29ProgressMovementCard {
  movementId: string;
  movementLabel: string;
  directionLabel: string;
  summary: string;
  evidenceLabel: string;
  latestValueLabel?: string;
  nextProgression?: string;
  actions: V29ProgressAction[];
}

export interface V29ProgressBalanceCard {
  summary: string;
  sections: Array<{
    label: string;
    items: string[];
  }>;
  actions: V29ProgressAction[];
}

export interface V29ProgressHistoryCard {
  workoutId: string;
  name: string;
  completedAtLabel: string;
  detail: string;
  statusLabel: string;
  note?: string;
  actions: V29ProgressAction[];
}

export interface V29ProgressMilestoneCard {
  milestoneId: string;
  categoryLabel: string;
  title: string;
  detail: string;
  achievedAtLabel: string;
}

export interface V29ProgressVisibleScreenModel {
  overview: V29ProgressOverviewCard;
  regionalStatus: V29ProgressRegionalCard[];
  trainingWins: V29ProgressWinCard[];
  movementTrends: V29ProgressMovementCard[];
  trainingBalance: V29ProgressBalanceCard;
  recentHistory: V29ProgressHistoryCard[];
  milestones: V29ProgressMilestoneCard[];
  emptyState?: string;
  screenReaderOrder: Array<'overview' | 'regional_status' | 'training_wins' | 'movement_trends' | 'training_balance' | 'history' | 'milestones'>;
  bottomInsetForNavigation: number;
}

// V29.5 — Visible You workspace
export type V29YouActionKind =
  | 'edit_profile'
  | 'edit_context'
  | 'manage_connection'
  | 'manage_coach_access'
  | 'open_friends'
  | 'open_sharing'
  | 'open_privacy'
  | 'open_notifications'
  | 'open_accessibility'
  | 'open_data_controls'
  | 'open_support';

export interface V29YouAction {
  actionId: string;
  kind: V29YouActionKind;
  label: string;
  accessibilityLabel: string;
  primary?: boolean;
  targetId?: string;
}

export interface V29YouProfileCard {
  displayName?: string;
  primaryGoalLabel: string;
  nextEventLabel?: string;
  phaseLabel: string;
  weeklyAvailabilityLabel: string;
  strengthFrequencyLabel: string;
  equipmentProfileLabel: string;
  actions: V29YouAction[];
}

export interface V29YouContextCard {
  contextId: string;
  label: string;
  value: string;
  detail?: string;
  needsAttention: boolean;
  actions: V29YouAction[];
}

export interface V29YouConnectionCard {
  connectionId: string;
  providerLabel: string;
  stateLabel: string;
  detail?: string;
  lastSyncLabel?: string;
  attention: boolean;
  actions: V29YouAction[];
}

export interface V29YouCoachCard {
  stateLabel: string;
  coachLabel?: string;
  detail: string;
  actions: V29YouAction[];
}

export interface V29YouSocialCard {
  friendCountLabel: string;
  invitationLabel?: string;
  sharingDefaultLabel: string;
  privacyLabel: string;
  actions: V29YouAction[];
}

export interface V29YouSettingCard {
  settingId: string;
  label: string;
  valueLabel?: string;
  detail?: string;
  attention: boolean;
  actions: V29YouAction[];
}

export interface V29YouVisibleScreenModel {
  profile: V29YouProfileCard;
  currentContext: V29YouContextCard[];
  connections: V29YouConnectionCard[];
  coachAccess: V29YouCoachCard;
  social: V29YouSocialCard;
  appControls: V29YouSettingCard[];
  screenReaderOrder: Array<'profile' | 'context' | 'connections' | 'coach' | 'social' | 'controls'>;
  bottomInsetForNavigation: number;
}

export type RecommendationReasonCode =
  | 'goal_alignment'
  | 'phase_alignment'
  | 'schedule_fit'
  | 'preferred_day'
  | 'return_to_run'
  | 'bone_stress_caution'
  | 'sport_background'
  | 'strength_experience'
  | 'equipment_fit'
  | 'restriction_fit'
  | 'recovery_spacing'
  | 'session_purpose';

export type TrainingAdaptation =
  | 'run_durability'
  | 'swim_support'
  | 'bike_support'
  | 'hip_stability'
  | 'single_leg_strength'
  | 'posterior_chain_capacity'
  | 'calf_ankle_capacity'
  | 'trunk_control'
  | 'upper_body_strength'
  | 'movement_quality'
  | 'power'
  | 'general_strength';

export interface RecommendationReason {
  code: RecommendationReasonCode;
  summary: string;
  detail?: string;
  evidenceSource: 'goal' | 'athlete_profile' | 'schedule' | 'workout' | 'restriction' | 'training_history' | 'integration';
}

export interface PredictedWorkoutFatigue {
  muscular: 1 | 2 | 3 | 4 | 5;
  cardiovascular: 1 | 2 | 3 | 4 | 5;
  neural: 1 | 2 | 3 | 4 | 5;
  recoveryHours: number;
  uncertainty: 'low' | 'moderate' | 'high';
}

export interface RecommendationConfidence {
  score: number;
  label: AdaptiveDecisionConfidence;
  evidenceInputs: string[];
  missingInputs: string[];
  rationale: string[];
}

export interface WorkoutRecommendationExplanation {
  sessionId: string;
  generatedAt: string;
  conciseWhy: string[];
  detailedReasons: RecommendationReason[];
  expectedAdaptations: TrainingAdaptation[];
  fatigue: PredictedWorkoutFatigue;
  confidence: RecommendationConfidence;
  whyNotHarder?: string;
  safeguards: string[];
}
