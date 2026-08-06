import type {
  BodyRegion,
  BodyRegionLoad,
  AutomaticReplanRecord,
  EnduranceActivity,
  EnduranceRegionContribution,
  ExternalTrainingClassification,
  EquipmentId,
  Exercise,
  ExerciseLoadHistoryEntry,
  ExercisePerformanceHistoryEntry,
  ExercisePreference,
  FriendWorkoutSubstitution,
  GeneratedWorkout,
  MovementPattern,
  PlannedCompletedMatch,
  RecentRegionExposure,
  TrainingCalendarEvent,
  TrainingCalendarSource,
  TrainingIntelligencePreferences,
  TrainingIntelligenceSnapshot,
  StrengthAdjustmentProposal,
  WorkoutDifficultyFeedback,
  WorkoutSensorLink,
} from '@circuit/domain';
import * as SQLite from 'expo-sqlite';
import 'expo-sqlite/localStorage/install';

import type { DailyReadinessCheckIn } from './readiness';

let db = SQLite.openDatabaseSync('circuit-generator.db');
let activeDatabaseName = 'circuit-generator.db';
let initialized = false;

type StorageLike = { getItem(key:string):string|null; setItem(key:string,value:string):void };
const profileStorage = (globalThis as typeof globalThis & { localStorage: StorageLike }).localStorage;

export async function activateUserDatabase(userId: string): Promise<void> {
  const ownerKey = 'circuit.original-database-owner';
  let originalOwner = profileStorage.getItem(ownerKey);
  if (!originalOwner) { originalOwner = userId; profileStorage.setItem(ownerKey, userId); }
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const nextName = originalOwner === userId ? 'circuit-generator.db' : `circuit-generator-${safeId}.db`;
  if (nextName === activeDatabaseName) { await initializeDatabase(); return; }
  db = SQLite.openDatabaseSync(nextName);
  activeDatabaseName = nextName;
  initialized = false;
  await initializeDatabase();
}

export function getActiveDatabaseName(): string { return activeDatabaseName; }

export interface FavoriteWorkoutRecord {
  id: string;
  name: string;
  workout: GeneratedWorkout;
  createdAt: string;
}

export async function initializeDatabase(): Promise<void> {
  if (initialized) return;

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS favorite_workouts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      workout_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS completed_workouts (
      id TEXT PRIMARY KEY NOT NULL,
      workout_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      completion_fraction REAL NOT NULL,
      station_rounds_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS body_region_exposures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id TEXT NOT NULL,
      region TEXT NOT NULL,
      raw_exposure REAL NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_exposures_completed_at
      ON body_region_exposures(completed_at);

    CREATE TABLE IF NOT EXISTS performance_goals (
      id TEXT PRIMARY KEY NOT NULL,
      goal_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS weekly_training_plans (
      id TEXT PRIMARY KEY NOT NULL,
      goal_id TEXT NOT NULL,
      week_start_date TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_weekly_plans_updated_at
      ON weekly_training_plans(updated_at);


    CREATE TABLE IF NOT EXISTS training_blocks (
      id TEXT PRIMARY KEY NOT NULL,
      goal_id TEXT NOT NULL,
      block_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_training_blocks_updated_at
      ON training_blocks(updated_at);


    CREATE TABLE IF NOT EXISTS pt_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      profile_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pt_profiles_updated_at
      ON pt_profiles(updated_at);

    CREATE TABLE IF NOT EXISTS training_check_ins (
      id TEXT PRIMARY KEY NOT NULL,
      check_in_json TEXT NOT NULL,
      active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_training_check_ins_active
      ON training_check_ins(active, updated_at);


    CREATE TABLE IF NOT EXISTS exercise_preferences (
      exercise_id TEXT PRIMARY KEY NOT NULL,
      preference TEXT NOT NULL,
      familiarity TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_feedback (
      workout_instance_id TEXT PRIMARY KEY NOT NULL,
      workout_id TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercise_load_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      load_value REAL NOT NULL,
      load_unit TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_exercise_load_history
      ON exercise_load_history(exercise_id, completed_at DESC);

    CREATE TABLE IF NOT EXISTS exercise_performance_history (
      id TEXT PRIMARY KEY NOT NULL,
      workout_instance_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      equipment_id TEXT,
      target_value REAL NOT NULL,
      target_unit TEXT NOT NULL,
      load_value REAL,
      load_unit TEXT,
      completion_fraction REAL NOT NULL,
      completed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_exercise_performance_history
      ON exercise_performance_history(exercise_id, completed_at DESC);

    CREATE TABLE IF NOT EXISTS training_calendar_sources (
      id TEXT PRIMARY KEY NOT NULL,
      source_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS training_calendar_events (
      id TEXT PRIMARY KEY NOT NULL,
      source_id TEXT NOT NULL,
      event_json TEXT NOT NULL,
      start_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_training_calendar_events_start
      ON training_calendar_events(start_at);

    CREATE TABLE IF NOT EXISTS custom_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      exercise_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_custom_exercises_updated_at
      ON custom_exercises(active, updated_at DESC);

    CREATE TABLE IF NOT EXISTS readiness_check_ins (
      date TEXT PRIMARY KEY NOT NULL,
      check_in_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_readiness_check_ins_updated
      ON readiness_check_ins(updated_at DESC);

    CREATE TABLE IF NOT EXISTS workout_reflections (
      workout_instance_id TEXT PRIMARY KEY NOT NULL,
      workout_id TEXT NOT NULL,
      workout_name TEXT NOT NULL,
      rpe INTEGER,
      energy_after INTEGER,
      notes TEXT,
      completed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workout_reflections_completed
      ON workout_reflections(completed_at DESC);

    CREATE TABLE IF NOT EXISTS plan_change_snapshots (
      id TEXT PRIMARY KEY NOT NULL,
      block_id TEXT NOT NULL,
      block_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      restored_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_plan_change_snapshots_created
      ON plan_change_snapshots(created_at DESC);

    CREATE TABLE IF NOT EXISTS progression_targets (
      exercise_id TEXT PRIMARY KEY NOT NULL,
      target_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS beta_feedback (
      id TEXT PRIMARY KEY NOT NULL,
      feedback_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS race_checklist_state (
      goal_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      completed INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (goal_id, item_id)
    );


    CREATE TABLE IF NOT EXISTS equipment_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      profile_json TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_equipment_profiles_updated
      ON equipment_profiles(updated_at DESC);

    CREATE TABLE IF NOT EXISTS workout_ledger (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      name TEXT NOT NULL,
      workout_json TEXT,
      exercises_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      completion_fraction REAL NOT NULL,
      station_rounds_json TEXT NOT NULL,
      notes TEXT,
      planned_session_id TEXT,
      relation_to_plan TEXT NOT NULL DEFAULT 'unrelated',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workout_ledger_completed
      ON workout_ledger(completed_at DESC);

    CREATE TABLE IF NOT EXISTS social_preferences (
      id TEXT PRIMARY KEY NOT NULL,
      preferences_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS endurance_activities (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      activity_json TEXT NOT NULL,
      start_at TEXT NOT NULL,
      deleted_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(source, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_endurance_activities_start
      ON endurance_activities(start_at DESC);

    CREATE TABLE IF NOT EXISTS workout_sensor_links (
      id TEXT PRIMARY KEY NOT NULL,
      activity_id TEXT NOT NULL UNIQUE,
      workout_id TEXT,
      status TEXT NOT NULL,
      confidence REAL NOT NULL,
      method TEXT NOT NULL,
      link_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workout_sensor_links_workout
      ON workout_sensor_links(workout_id);

    CREATE TABLE IF NOT EXISTS planned_completed_matches (
      id TEXT PRIMARY KEY NOT NULL,
      activity_id TEXT NOT NULL,
      calendar_event_id TEXT,
      status TEXT NOT NULL,
      confidence REAL NOT NULL,
      match_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_planned_completed_activity
      ON planned_completed_matches(activity_id);

    CREATE TABLE IF NOT EXISTS endurance_region_contributions (
      id TEXT PRIMARY KEY NOT NULL,
      activity_id TEXT NOT NULL,
      region TEXT NOT NULL,
      contribution REAL NOT NULL,
      completed_at TEXT NOT NULL,
      contribution_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_endurance_contributions_completed
      ON endurance_region_contributions(completed_at DESC);

    CREATE TABLE IF NOT EXISTS automatic_replan_records (
      id TEXT PRIMARY KEY NOT NULL,
      trigger_activity_id TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      record_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      undone_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_automatic_replans_created
      ON automatic_replan_records(created_at DESC);

    CREATE TABLE IF NOT EXISTS integration_sync_state (
      integration_id TEXT PRIMARY KEY NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS training_intelligence_state (
      id TEXT PRIMARY KEY NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS training_adjustment_history (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_json TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_training_adjustment_history_updated
      ON training_adjustment_history(updated_at DESC);


    CREATE TABLE IF NOT EXISTS cloud_operation_queue (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      next_attempt_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cloud_operation_queue_due
      ON cloud_operation_queue(status, next_attempt_at, created_at);
  `);

  await migrateCompletedWorkoutsIntoLedger();
  initialized = true;
}

export async function saveFavoriteWorkout(workout: GeneratedWorkout): Promise<void> {
  await initializeDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO favorite_workouts (id, name, workout_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       workout_json = excluded.workout_json,
       updated_at = excluded.updated_at`,
    workout.id,
    workout.name,
    JSON.stringify(workout),
    now,
    now,
  );
}

export async function deleteFavoriteWorkout(workoutId: string): Promise<void> {
  await initializeDatabase();
  await db.runAsync('DELETE FROM favorite_workouts WHERE id = ?', workoutId);
}

export async function isWorkoutFavorite(workoutId: string): Promise<boolean> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM favorite_workouts WHERE id = ? LIMIT 1',
    workoutId,
  );
  return Boolean(row);
}

export async function listFavoriteWorkouts(): Promise<FavoriteWorkoutRecord[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    workout_json: string;
    created_at: string;
  }>('SELECT id, name, workout_json, created_at FROM favorite_workouts ORDER BY updated_at DESC');

  return rows.flatMap((row) => {
    try {
      return [{
        id: row.id,
        name: row.name,
        workout: JSON.parse(row.workout_json) as GeneratedWorkout,
        createdAt: row.created_at,
      }];
    } catch {
      return [];
    }
  });
}

export async function saveCompletedWorkout({
  workout,
  startedAt,
  completedAt,
  completionFraction,
  stationRounds,
  exerciseLoads = {},
  exerciseSets = {},
  notes,
  plannedSessionId,
  ledgerSource,
  relationToPlan,
  friendSubstitution,
  idempotencyKey,
}: {
  workout: GeneratedWorkout;
  startedAt: string;
  completedAt: string;
  completionFraction: number;
  stationRounds: Record<string, number>;
  exerciseLoads?: Record<string, { value: number; unit: 'lb' | 'kg'; name: string }>;
  exerciseSets?: Record<string, LoggedSet[]>;
  notes?: string;
  plannedSessionId?: string;
  ledgerSource?: WorkoutLedgerSource;
  relationToPlan?: WorkoutPlanRelation;
  friendSubstitution?: Omit<FriendWorkoutSubstitution, 'completedAt'>;
  idempotencyKey?: string;
}): Promise<void> {
  await initializeDatabase();
  const workoutInstanceId = idempotencyKey?.trim() || `${workout.id}_${completedAt}`;
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM completed_workouts WHERE id = ? LIMIT 1',
    workoutInstanceId,
  );
  if (existing) return;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO completed_workouts
       (id, workout_json, started_at, completed_at, completion_fraction, station_rounds_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      workoutInstanceId,
      JSON.stringify(workout),
      startedAt,
      completedAt,
      completionFraction,
      JSON.stringify(stationRounds),
    );

    const exposures = calculateWorkoutExposures(workout, completionFraction);
    for (const [region, rawExposure] of exposures) {
      await db.runAsync(
        `INSERT INTO body_region_exposures (workout_id, region, raw_exposure, completed_at)
         VALUES (?, ?, ?, ?)`,
        workoutInstanceId,
        region,
        rawExposure,
        completedAt,
      );
    }


    for (const [exerciseId, load] of Object.entries(exerciseLoads)) {
      if (!Number.isFinite(load.value) || load.value <= 0) continue;
      await db.runAsync(
        `INSERT INTO exercise_load_history
         (exercise_id, exercise_name, load_value, load_unit, completed_at)
         VALUES (?, ?, ?, ?, ?)`,
        exerciseId,
        load.name,
        load.value,
        load.unit,
        completedAt,
      );
    }

    for (const item of workout.stations.flatMap((station) => station.exercises)) {
      const load = exerciseLoads[item.exerciseId];
      const option = item.exerciseSnapshot.equipmentOptions.find((candidate) => candidate.id === item.equipmentOptionId);
      const equipmentId = option?.items.find((entry) => entry.equipmentId !== 'bodyweight')?.equipmentId
        ?? option?.items[0]?.equipmentId;
      await db.runAsync(
        `INSERT OR REPLACE INTO exercise_performance_history
         (id, workout_instance_id, exercise_id, exercise_name, equipment_id,
          target_value, target_unit, load_value, load_unit, completion_fraction, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${workoutInstanceId}_${item.exerciseId}`,
        workoutInstanceId,
        item.exerciseId,
        item.exerciseSnapshot.name,
        equipmentId ?? null,
        item.target,
        item.unit,
        load?.value ?? null,
        load?.unit ?? null,
        completionFraction,
        completedAt,
      );
    }

    const loggedExercises: LoggedExercise[] = workout.stations.flatMap((station) =>
      station.exercises.map((item) => {
        const option = item.exerciseSnapshot.equipmentOptions.find((candidate) => candidate.id === item.equipmentOptionId);
        const equipmentId = option?.items.find((entry) => entry.equipmentId !== 'bodyweight')?.equipmentId
          ?? option?.items[0]?.equipmentId;
        const fallbackLoad = exerciseLoads[item.exerciseId];
        const sets = exerciseSets[item.exerciseId]?.length
          ? exerciseSets[item.exerciseId]
          : [{
              id: `${workoutInstanceId}_${item.exerciseId}_set_1`,
              reps: item.unit === 'seconds' ? undefined : item.target,
              seconds: item.unit === 'seconds' ? item.target : undefined,
              loadValue: fallbackLoad?.value,
              loadUnit: fallbackLoad?.unit,
              loadBasis: inferLoadBasis(equipmentId),
              completed: true,
            }];
        return {
          id: `${workoutInstanceId}_${item.exerciseId}`,
          exerciseId: item.exerciseId,
          name: item.exerciseSnapshot.name,
          equipmentId,
          sets,
          bodyRegions: item.exerciseSnapshot.bodyRegions,
          movementPatterns: item.exerciseSnapshot.movementPatterns,
          notes: item.adaptationNote,
        } satisfies LoggedExercise;
      }),
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO workout_ledger
       (id, source, name, workout_json, exercises_json, started_at, completed_at,
        completion_fraction, station_rounds_json, notes, planned_session_id,
        relation_to_plan, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      workoutInstanceId,
      ledgerSource ?? (workout.sharedContext ? 'workout_together' : workout.source === 'manual' ? 'custom' : 'side_quest'),
      workout.name,
      JSON.stringify(workout),
      JSON.stringify(loggedExercises),
      startedAt,
      completedAt,
      completionFraction,
      JSON.stringify(stationRounds),
      notes ?? null,
      plannedSessionId ?? null,
      relationToPlan ?? (plannedSessionId ? 'replaced_planned' : 'unrelated'),
      completedAt,
      new Date().toISOString(),
    );
  });

  // The workout ledger is the canonical record. Rebuild derived exposure and
  // progression tables from the sets the athlete actually logged.
  await rebuildDerivedTrainingMemory();
  await markPlannedSessionCompletedForWorkout(
    workout.id,
    plannedSessionId,
    friendSubstitution ? { ...friendSubstitution, completedAt } : undefined,
  );
}

async function markPlannedSessionCompletedForWorkout(
  workoutId: string,
  plannedSessionId?: string,
  friendSubstitution?: FriendWorkoutSubstitution,
): Promise<void> {
  const saved = await getLatestTrainingBlock();
  if (!saved) return;
  let changed = false;
  const block = {
    ...saved.block,
    weeks: saved.block.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) => {
        const matchesPlannedSession = plannedSessionId
          ? session.id === plannedSessionId
          : session.workout.id === workoutId;
        if (!matchesPlannedSession || session.completionStatus === 'completed') return session;
        changed = true;
        return {
          ...session,
          completionStatus: 'completed' as const,
          friendSubstitution: friendSubstitution ?? session.friendSubstitution,
        };
      }),
    })),
  };
  if (changed) await saveTrainingBlock(block);
}

export async function updatePlannedSessionStatus(
  sessionId: string,
  status: import('@circuit/domain').PlannedStrengthSession['completionStatus'],
): Promise<import('@circuit/domain').TrainingBlockPlan | null> {
  const saved = await getLatestTrainingBlock();
  if (!saved) return null;
  let changed = false;
  const block: import('@circuit/domain').TrainingBlockPlan = {
    ...saved.block,
    weeks: saved.block.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        changed = true;
        return { ...session, completionStatus: status };
      }),
    })),
  };
  if (!changed) return saved.block;
  await saveTrainingBlock(block);
  return block;
}

export async function getRecentRegionExposures(
  lookbackHours = 72,
): Promise<RecentRegionExposure[]> {
  await initializeDatabase();
  const cutoff = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();
  const rows = await db.getAllAsync<{
    region: BodyRegion;
    raw_exposure: number;
    completed_at: string;
  }>(
    `SELECT region, raw_exposure, completed_at
     FROM body_region_exposures
     WHERE completed_at >= ?
     ORDER BY completed_at DESC`,
    cutoff,
  );

  return rows.map((row) => ({
    region: row.region,
    rawExposure: row.raw_exposure,
    completedAt: row.completed_at,
  }));
}

export async function getPreviousExerciseIds(): Promise<string[]> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ exercises_json: string }>(
    `SELECT exercises_json FROM workout_ledger ORDER BY completed_at DESC LIMIT 1`,
  );
  if (!row) return [];
  try {
    const exercises = JSON.parse(row.exercises_json) as LoggedExercise[];
    return exercises.flatMap((exercise) => exercise.exerciseId ? [exercise.exerciseId] : []);
  } catch {
    return [];
  }
}

function calculateWorkoutExposures(
  workout: GeneratedWorkout,
  completionFraction: number,
): Map<BodyRegion, number> {
  const totals = new Map<BodyRegion, number>();
  const fraction = Math.max(0, Math.min(1, completionFraction));

  for (const station of workout.stations) {
    const stationMinutes = station.durationSeconds / 60;
    for (const exercise of station.exercises) {
      for (const load of exercise.exerciseSnapshot.bodyRegions) {
        const roleMultiplier = load.role === 'primary' ? 1 : load.role === 'secondary' ? 0.65 : 0.4;
        const exposure = load.load * stationMinutes * roleMultiplier * fraction;
        totals.set(load.region, (totals.get(load.region) ?? 0) + exposure);
      }
    }
  }

  return totals;
}

export interface SavedWeeklyPlanRecord {
  id: string;
  plan: import('@circuit/domain').WeeklyTrainingPlan;
  createdAt: string;
}

export async function savePerformanceGoal(
  goal: import('@circuit/domain').PerformanceGoal,
): Promise<void> {
  await initializeDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO performance_goals (id, goal_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       goal_json = excluded.goal_json,
       updated_at = excluded.updated_at`,
    goal.id,
    JSON.stringify(goal),
    goal.createdAt,
    now,
  );
}

export async function getLatestPerformanceGoal(): Promise<import('@circuit/domain').PerformanceGoal | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ goal_json: string }>(
    'SELECT goal_json FROM performance_goals ORDER BY updated_at DESC LIMIT 1',
  );
  if (!row) return null;
  try {
    return JSON.parse(row.goal_json) as import('@circuit/domain').PerformanceGoal;
  } catch {
    return null;
  }
}

export async function saveWeeklyPlan(
  plan: import('@circuit/domain').WeeklyTrainingPlan,
): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT INTO weekly_training_plans (id, goal_id, week_start_date, plan_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       plan_json = excluded.plan_json,
       updated_at = excluded.updated_at`,
    plan.id,
    plan.goal.id,
    plan.weekStartDate,
    JSON.stringify(plan),
    plan.createdAt,
    new Date().toISOString(),
  );
}

export async function getLatestWeeklyPlan(): Promise<SavedWeeklyPlanRecord | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    plan_json: string;
    created_at: string;
  }>(
    'SELECT id, plan_json, created_at FROM weekly_training_plans ORDER BY updated_at DESC LIMIT 1',
  );
  if (!row) return null;
  try {
    return {
      id: row.id,
      plan: JSON.parse(row.plan_json) as import('@circuit/domain').WeeklyTrainingPlan,
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}


export interface SavedTrainingBlockRecord {
  id: string;
  block: import('@circuit/domain').TrainingBlockPlan;
  createdAt: string;
}

export async function saveTrainingBlock(
  block: import('@circuit/domain').TrainingBlockPlan,
): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT INTO training_blocks (id, goal_id, block_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       block_json = excluded.block_json,
       updated_at = excluded.updated_at`,
    block.id,
    block.goal.id,
    JSON.stringify(block),
    block.createdAt,
    new Date().toISOString(),
  );

  for (const week of block.weeks) {
    await saveWeeklyPlan(week);
  }
}

export async function getLatestTrainingBlock(): Promise<SavedTrainingBlockRecord | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    block_json: string;
    created_at: string;
  }>(
    'SELECT id, block_json, created_at FROM training_blocks ORDER BY updated_at DESC LIMIT 1',
  );
  if (!row) return null;
  try {
    return {
      id: row.id,
      block: JSON.parse(row.block_json) as import('@circuit/domain').TrainingBlockPlan,
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}


export async function savePTProfile(
  profile: import('@circuit/domain').PTProfile,
): Promise<void> {
  await initializeDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO pt_profiles (id, profile_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       profile_json = excluded.profile_json,
       updated_at = excluded.updated_at`,
    profile.id,
    JSON.stringify(profile),
    profile.createdAt,
    now,
  );
}

export async function getLatestPTProfile(): Promise<import('@circuit/domain').PTProfile | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ profile_json: string }>(
    'SELECT profile_json FROM pt_profiles ORDER BY updated_at DESC LIMIT 1',
  );
  if (!row) return null;
  try {
    return JSON.parse(row.profile_json) as import('@circuit/domain').PTProfile;
  } catch {
    return null;
  }
}


export async function saveTrainingCheckIn(
  checkIn: import('@circuit/domain').TrainingCheckIn,
): Promise<void> {
  await initializeDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE training_check_ins SET active = 0, updated_at = ? WHERE active = 1', now);
    await db.runAsync(
      `INSERT INTO training_check_ins (id, check_in_json, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         check_in_json = excluded.check_in_json,
         active = excluded.active,
         updated_at = excluded.updated_at`,
      checkIn.id,
      JSON.stringify(checkIn),
      checkIn.active ? 1 : 0,
      checkIn.createdAt,
      now,
    );
  });
}

export async function getActiveTrainingCheckIn(): Promise<import('@circuit/domain').TrainingCheckIn | null> {
  await initializeDatabase();
  const now = new Date().toISOString();
  const row = await db.getFirstAsync<{ check_in_json: string }>(
    `SELECT check_in_json
     FROM training_check_ins
     WHERE active = 1
     ORDER BY updated_at DESC
     LIMIT 1`,
  );
  if (!row) return null;
  try {
    const checkIn = JSON.parse(row.check_in_json) as import('@circuit/domain').TrainingCheckIn;
    if (checkIn.activeUntil < now) {
      await db.runAsync('UPDATE training_check_ins SET active = 0, updated_at = ? WHERE id = ?', now, checkIn.id);
      return null;
    }
    return checkIn;
  } catch {
    return null;
  }
}

export async function clearActiveTrainingCheckIn(): Promise<void> {
  await initializeDatabase();
  const now = new Date().toISOString();
  await db.runAsync('UPDATE training_check_ins SET active = 0, updated_at = ? WHERE active = 1', now);
}

export async function getTrainingBlockById(
  id: string,
): Promise<import('@circuit/domain').TrainingBlockPlan | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ block_json: string }>(
    'SELECT block_json FROM training_blocks WHERE id = ? LIMIT 1',
    id,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.block_json) as import('@circuit/domain').TrainingBlockPlan;
  } catch {
    return null;
  }
}


export async function saveExercisePreference(
  preference: ExercisePreference,
): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT INTO exercise_preferences (exercise_id, preference, familiarity, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET
       preference = excluded.preference,
       familiarity = excluded.familiarity,
       updated_at = excluded.updated_at`,
    preference.exerciseId,
    preference.preference,
    preference.familiarity,
    new Date().toISOString(),
  );
}

export async function listExercisePreferences(): Promise<ExercisePreference[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{
    exercise_id: string;
    preference: ExercisePreference['preference'];
    familiarity: ExercisePreference['familiarity'];
  }>('SELECT exercise_id, preference, familiarity FROM exercise_preferences');
  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    preference: row.preference,
    familiarity: row.familiarity,
  }));
}

export async function saveWorkoutFeedback({
  workoutInstanceId,
  workoutId,
  difficulty,
  notes,
}: {
  workoutInstanceId: string;
  workoutId: string;
  difficulty: WorkoutDifficultyFeedback;
  notes?: string;
}): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO workout_feedback
     (workout_instance_id, workout_id, difficulty, notes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    workoutInstanceId,
    workoutId,
    difficulty,
    notes ?? null,
    new Date().toISOString(),
  );
}

export async function getLatestExerciseLoads(): Promise<Record<string, ExerciseLoadHistoryEntry>> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{
    exercise_id: string;
    exercise_name: string;
    load_value: number;
    load_unit: 'lb' | 'kg';
    completed_at: string;
  }>(`
    SELECT history.exercise_id, history.exercise_name, history.load_value,
           history.load_unit, history.completed_at
    FROM exercise_load_history history
    INNER JOIN (
      SELECT exercise_id, MAX(completed_at) AS latest
      FROM exercise_load_history
      GROUP BY exercise_id
    ) latest
      ON latest.exercise_id = history.exercise_id
     AND latest.latest = history.completed_at
  `);
  return Object.fromEntries(rows.map((row) => [row.exercise_id, {
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    loadValue: row.load_value,
    loadUnit: row.load_unit,
    completedAt: row.completed_at,
  }]));
}

export async function getTrainingBalance(
  lookbackDays = 14,
): Promise<Array<{ region: BodyRegion; exposure: number }>> {
  await initializeDatabase();
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  const rows = await db.getAllAsync<{ region: BodyRegion; exposure: number }>(
    `SELECT region, SUM(raw_exposure) AS exposure
     FROM body_region_exposures
     WHERE completed_at >= ?
     GROUP BY region
     ORDER BY exposure DESC`,
    cutoff,
  );
  return rows;
}

export async function saveTrainingCalendarSource(
  source: TrainingCalendarSource,
): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT INTO training_calendar_sources (id, source_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source_json = excluded.source_json,
       updated_at = excluded.updated_at`,
    source.id,
    JSON.stringify(source),
    new Date().toISOString(),
  );
}

export async function getLatestTrainingCalendarSource(): Promise<TrainingCalendarSource | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ source_json: string }>(
    'SELECT source_json FROM training_calendar_sources ORDER BY updated_at DESC LIMIT 1',
  );
  if (!row) return null;
  try {
    return JSON.parse(row.source_json) as TrainingCalendarSource;
  } catch {
    return null;
  }
}

export async function listTrainingCalendarSources(): Promise<TrainingCalendarSource[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ source_json: string }>(
    'SELECT source_json FROM training_calendar_sources ORDER BY updated_at DESC',
  );
  return rows.flatMap((row) => {
    try { return [JSON.parse(row.source_json) as TrainingCalendarSource]; } catch { return []; }
  });
}

export async function getTrainingCalendarSource(id: string): Promise<TrainingCalendarSource | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ source_json: string }>(
    'SELECT source_json FROM training_calendar_sources WHERE id = ?', id,
  );
  if (!row) return null;
  try { return JSON.parse(row.source_json) as TrainingCalendarSource; } catch { return null; }
}

export async function replaceTrainingCalendarEvents(
  sourceId: string,
  events: TrainingCalendarEvent[],
): Promise<void> {
  await initializeDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM training_calendar_events WHERE source_id = ?', sourceId);
    const now = new Date().toISOString();
    for (const event of events) {
      await db.runAsync(
        `INSERT INTO training_calendar_events
         (id, source_id, event_json, start_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        event.id,
        sourceId,
        JSON.stringify(event),
        event.startAt,
        now,
      );
    }
  });
}

export async function getTrainingCalendarEvents({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<TrainingCalendarEvent[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ event_json: string }>(
    `SELECT event_json FROM training_calendar_events
     WHERE start_at >= ? AND start_at <= ?
     ORDER BY start_at`,
    from,
    to,
  );
  return rows.flatMap((row) => {
    try {
      return [JSON.parse(row.event_json) as TrainingCalendarEvent];
    } catch {
      return [];
    }
  });
}

export async function getTrainingCalendarEventsForSource(sourceId: string): Promise<TrainingCalendarEvent[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ event_json: string }>(
    `SELECT event_json FROM training_calendar_events
     WHERE source_id = ? ORDER BY start_at`, sourceId,
  );
  return rows.flatMap((row) => {
    try { return [JSON.parse(row.event_json) as TrainingCalendarEvent]; } catch { return []; }
  });
}


export async function saveCustomExercise(exercise: Exercise): Promise<void> {
  await initializeDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO custom_exercises (id, exercise_json, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       exercise_json = excluded.exercise_json,
       active = excluded.active,
       updated_at = excluded.updated_at`,
    exercise.id,
    JSON.stringify(exercise),
    exercise.status === 'active' && exercise.defaultEnabled ? 1 : 0,
    exercise.createdAt,
    now,
  );
}

export async function listCustomExercises({
  includeArchived = false,
}: { includeArchived?: boolean } = {}): Promise<Exercise[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ exercise_json: string }>(
    includeArchived
      ? 'SELECT exercise_json FROM custom_exercises ORDER BY updated_at DESC'
      : 'SELECT exercise_json FROM custom_exercises WHERE active = 1 ORDER BY updated_at DESC',
  );
  return rows.flatMap((row) => {
    try {
      return [JSON.parse(row.exercise_json) as Exercise];
    } catch {
      return [];
    }
  });
}

export async function getCustomExercise(id: string): Promise<Exercise | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ exercise_json: string }>(
    'SELECT exercise_json FROM custom_exercises WHERE id = ? LIMIT 1',
    id,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.exercise_json) as Exercise;
  } catch {
    return null;
  }
}

export async function archiveCustomExercise(id: string): Promise<void> {
  await initializeDatabase();
  const existing = await getCustomExercise(id);
  if (!existing) return;
  const archived: Exercise = {
    ...existing,
    status: 'archived',
    defaultEnabled: false,
    updatedAt: new Date().toISOString(),
  };
  await db.runAsync(
    `UPDATE custom_exercises
     SET exercise_json = ?, active = 0, updated_at = ?
     WHERE id = ?`,
    JSON.stringify(archived),
    archived.updatedAt,
    id,
  );
}

export async function upsertManualCalendarEvent(event: TrainingCalendarEvent): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT INTO training_calendar_events
     (id, source_id, event_json, start_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       event_json = excluded.event_json,
       start_at = excluded.start_at,
       updated_at = excluded.updated_at`,
    event.id,
    event.sourceId,
    JSON.stringify(event),
    event.startAt,
    new Date().toISOString(),
  );
}

export async function deleteManualCalendarEvent(id: string): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `DELETE FROM training_calendar_events WHERE id = ? AND source_id = 'manual'`,
    id,
  );
}


export interface CompletedWorkoutSummary {
  id: string;
  workoutId: string;
  workoutName: string;
  startedAt: string;
  completedAt: string;
  completionFraction: number;
  variantLevel?: import('@circuit/domain').WorkoutVariantLevel;
}

export interface WorkoutFeedbackSummary {
  workoutInstanceId: string;
  workoutId: string;
  difficulty: WorkoutDifficultyFeedback;
  notes?: string;
  createdAt: string;
}

export interface WorkoutReflection {
  workoutInstanceId: string;
  workoutId: string;
  workoutName: string;
  rpe?: number;
  energyAfter?: number;
  notes?: string;
  completedAt: string;
  createdAt: string;
}

export async function saveReadinessCheckIn(checkIn: DailyReadinessCheckIn): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT INTO readiness_check_ins (date, check_in_json, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       check_in_json = excluded.check_in_json,
       updated_at = excluded.updated_at`,
    checkIn.date,
    JSON.stringify(checkIn),
    checkIn.createdAt,
    checkIn.updatedAt,
  );
}

export async function getReadinessCheckInForDate(date: string): Promise<DailyReadinessCheckIn | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ check_in_json: string }>(
    'SELECT check_in_json FROM readiness_check_ins WHERE date = ? LIMIT 1',
    date,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.check_in_json) as DailyReadinessCheckIn;
  } catch {
    return null;
  }
}

export async function getTodayReadinessCheckIn(): Promise<DailyReadinessCheckIn | null> {
  return getReadinessCheckInForDate(localIsoDate(new Date()));
}

export async function listReadinessCheckIns({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<DailyReadinessCheckIn[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ check_in_json: string }>(
    `SELECT check_in_json FROM readiness_check_ins
     WHERE date >= ? AND date <= ?
     ORDER BY date DESC`,
    from,
    to,
  );
  return rows.flatMap((row) => {
    try {
      return [JSON.parse(row.check_in_json) as DailyReadinessCheckIn];
    } catch {
      return [];
    }
  });
}

export async function listCompletedWorkoutSummaries({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<CompletedWorkoutSummary[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    workout_json: string | null;
    started_at: string;
    completed_at: string;
    completion_fraction: number;
  }>(
    `SELECT id, name, workout_json, started_at, completed_at, completion_fraction
     FROM workout_ledger
     WHERE completed_at >= ? AND completed_at <= ?
     ORDER BY completed_at DESC`,
    from,
    to,
  );
  return rows.map((row) => {
    if (row.workout_json) {
      try {
        const workout = JSON.parse(row.workout_json) as GeneratedWorkout;
        return {
          id: row.id,
          workoutId: workout.id,
          workoutName: workout.name,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          completionFraction: row.completion_fraction,
          variantLevel: workout.variantLevel,
        };
      } catch {}
    }
    return {
      id: row.id,
      workoutId: row.id,
      workoutName: row.name,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      completionFraction: row.completion_fraction,
    };
  });
}

export async function listWorkoutFeedbackSince(from: string): Promise<WorkoutFeedbackSummary[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{
    workout_instance_id: string;
    workout_id: string;
    difficulty: WorkoutDifficultyFeedback;
    notes: string | null;
    created_at: string;
  }>(
    `SELECT workout_instance_id, workout_id, difficulty, notes, created_at
     FROM workout_feedback
     WHERE created_at >= ?
     ORDER BY created_at DESC`,
    from,
  );
  return rows.map((row) => ({
    workoutInstanceId: row.workout_instance_id,
    workoutId: row.workout_id,
    difficulty: row.difficulty,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function saveWorkoutReflection(reflection: WorkoutReflection): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT INTO workout_reflections
     (workout_instance_id, workout_id, workout_name, rpe, energy_after, notes, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workout_instance_id) DO UPDATE SET
       rpe = excluded.rpe,
       energy_after = excluded.energy_after,
       notes = excluded.notes`,
    reflection.workoutInstanceId,
    reflection.workoutId,
    reflection.workoutName,
    reflection.rpe ?? null,
    reflection.energyAfter ?? null,
    reflection.notes ?? null,
    reflection.completedAt,
    reflection.createdAt,
  );
}

export async function listWorkoutReflectionsSince(from: string): Promise<WorkoutReflection[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{
    workout_instance_id: string;
    workout_id: string;
    workout_name: string;
    rpe: number | null;
    energy_after: number | null;
    notes: string | null;
    completed_at: string;
    created_at: string;
  }>(
    `SELECT workout_instance_id, workout_id, workout_name, rpe, energy_after, notes, completed_at, created_at
     FROM workout_reflections
     WHERE completed_at >= ?
     ORDER BY completed_at DESC`,
    from,
  );
  return rows.map((row) => ({
    workoutInstanceId: row.workout_instance_id,
    workoutId: row.workout_id,
    workoutName: row.workout_name,
    rpe: row.rpe ?? undefined,
    energyAfter: row.energy_after ?? undefined,
    notes: row.notes ?? undefined,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  }));
}


export interface PlanSnapshotRecord {
  id: string;
  blockId: string;
  block: import('@circuit/domain').TrainingBlockPlan;
  reason: string;
  createdAt: string;
  restoredAt?: string;
}

export async function savePlanSnapshot(
  block: import('@circuit/domain').TrainingBlockPlan,
  reason: string,
): Promise<PlanSnapshotRecord> {
  await initializeDatabase();
  const createdAt = new Date().toISOString();
  const id = `snapshot_${block.id}_${createdAt.replace(/[^0-9]/g, '')}`;
  await db.runAsync(
    `INSERT INTO plan_change_snapshots
     (id, block_id, block_json, reason, created_at, restored_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    id,
    block.id,
    JSON.stringify(block),
    reason,
    createdAt,
  );
  return { id, blockId: block.id, block, reason, createdAt };
}

export async function getLatestPlanSnapshot({
  includeRestored = false,
}: { includeRestored?: boolean } = {}): Promise<PlanSnapshotRecord | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    block_id: string;
    block_json: string;
    reason: string;
    created_at: string;
    restored_at: string | null;
  }>(includeRestored
    ? `SELECT id, block_id, block_json, reason, created_at, restored_at
       FROM plan_change_snapshots ORDER BY created_at DESC LIMIT 1`
    : `SELECT id, block_id, block_json, reason, created_at, restored_at
       FROM plan_change_snapshots WHERE restored_at IS NULL ORDER BY created_at DESC LIMIT 1`);
  if (!row) return null;
  try {
    return {
      id: row.id,
      blockId: row.block_id,
      block: JSON.parse(row.block_json) as import('@circuit/domain').TrainingBlockPlan,
      reason: row.reason,
      createdAt: row.created_at,
      restoredAt: row.restored_at ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function markPlanSnapshotRestored(snapshotId: string): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    'UPDATE plan_change_snapshots SET restored_at = ? WHERE id = ?',
    new Date().toISOString(),
    snapshotId,
  );
}

export interface ProgressionTarget {
  exerciseId: string;
  exerciseName: string;
  strategy: 'reps_up' | 'load_up' | 'hold' | 'dose_down' | 'reentry';
  targetLoad?: number;
  loadUnit?: 'lb' | 'kg';
  targetValue?: number;
  targetUnit?: 'total' | 'per_side' | 'seconds';
  equipmentId?: EquipmentId;
  source: 'recommended' | 'manual';
  rationale?: string;
  updatedAt: string;
}

export async function saveProgressionTarget(target: ProgressionTarget): Promise<void> {
  await initializeDatabase();
  const updatedAt = new Date().toISOString();
  const value: ProgressionTarget = { ...target, updatedAt };
  await db.runAsync(
    `INSERT INTO progression_targets (exercise_id, target_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET
       target_json = excluded.target_json,
       updated_at = excluded.updated_at`,
    target.exerciseId,
    JSON.stringify(value),
    updatedAt,
  );
}

export async function listProgressionTargets(): Promise<Record<string, ProgressionTarget>> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ target_json: string }>(
    'SELECT target_json FROM progression_targets ORDER BY updated_at DESC',
  );
  const values = rows.flatMap((row) => {
    try {
      const value = JSON.parse(row.target_json) as Partial<ProgressionTarget>;
      // V10 stored percentage-derived load targets without equipment-aware increments.
      // Ignore those legacy targets so V11 can rebuild a realistic rep-first recommendation.
      if (!value.strategy || !value.exerciseId || !value.exerciseName) return [];
      return [value as ProgressionTarget];
    } catch {
      return [];
    }
  });
  return Object.fromEntries(values.map((value) => [value.exerciseId, value]));
}

export async function clearProgressionTarget(exerciseId: string): Promise<void> {
  await initializeDatabase();
  await db.runAsync('DELETE FROM progression_targets WHERE exercise_id = ?', exerciseId);
}

export async function listExerciseLoadHistory({
  from,
  limit = 250,
}: {
  from?: string;
  limit?: number;
} = {}): Promise<ExerciseLoadHistoryEntry[]> {
  await initializeDatabase();
  const boundedLimit = Math.max(1, Math.min(1000, Math.round(limit)));
  const rows = from
    ? await db.getAllAsync<{
        exercise_id: string;
        exercise_name: string;
        load_value: number;
        load_unit: 'lb' | 'kg';
        completed_at: string;
      }>(
        `SELECT exercise_id, exercise_name, load_value, load_unit, completed_at
         FROM exercise_load_history
         WHERE completed_at >= ?
         ORDER BY completed_at DESC
         LIMIT ?`,
        from,
        boundedLimit,
      )
    : await db.getAllAsync<{
        exercise_id: string;
        exercise_name: string;
        load_value: number;
        load_unit: 'lb' | 'kg';
        completed_at: string;
      }>(
        `SELECT exercise_id, exercise_name, load_value, load_unit, completed_at
         FROM exercise_load_history
         ORDER BY completed_at DESC
         LIMIT ?`,
        boundedLimit,
      );
  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    loadValue: row.load_value,
    loadUnit: row.load_unit,
    completedAt: row.completed_at,
  }));
}

export async function listExercisePerformanceHistory({
  from,
  limit = 500,
}: {
  from?: string;
  limit?: number;
} = {}): Promise<ExercisePerformanceHistoryEntry[]> {
  await initializeDatabase();
  const boundedLimit = Math.max(1, Math.min(1500, Math.round(limit)));
  const query = from
    ? `SELECT exercise_id, exercise_name, equipment_id, target_value, target_unit,
              load_value, load_unit, completion_fraction, completed_at
       FROM exercise_performance_history
       WHERE completed_at >= ?
       ORDER BY completed_at DESC
       LIMIT ?`
    : `SELECT exercise_id, exercise_name, equipment_id, target_value, target_unit,
              load_value, load_unit, completion_fraction, completed_at
       FROM exercise_performance_history
       ORDER BY completed_at DESC
       LIMIT ?`;
  type Row = {
    exercise_id: string;
    exercise_name: string;
    equipment_id: EquipmentId | null;
    target_value: number;
    target_unit: 'total' | 'per_side' | 'seconds';
    load_value: number | null;
    load_unit: 'lb' | 'kg' | null;
    completion_fraction: number;
    completed_at: string;
  };
  const rows = from
    ? await db.getAllAsync<Row>(query, from, boundedLimit)
    : await db.getAllAsync<Row>(query, boundedLimit);
  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    equipmentId: row.equipment_id ?? undefined,
    targetValue: row.target_value,
    targetUnit: row.target_unit,
    loadValue: row.load_value ?? undefined,
    loadUnit: row.load_unit ?? undefined,
    completionFraction: row.completion_fraction,
    completedAt: row.completed_at,
  }));
}

export interface TrainingContinuitySummary {
  lastCompletedStrengthAt?: string;
  daysSinceLastStrength?: number;
  completedLast28Days: number;
}

export async function getTrainingContinuitySummary(now = new Date()): Promise<TrainingContinuitySummary> {
  await initializeDatabase();
  const cutoff = new Date(now.getTime() - 28 * 86_400_000).toISOString();
  const latest = await db.getFirstAsync<{ completed_at: string }>(
    'SELECT completed_at FROM workout_ledger ORDER BY completed_at DESC LIMIT 1',
  );
  const count = await db.getFirstAsync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM workout_ledger WHERE completed_at >= ?',
    cutoff,
  );
  const lastCompletedStrengthAt = latest?.completed_at;
  return {
    lastCompletedStrengthAt,
    daysSinceLastStrength: lastCompletedStrengthAt
      ? Math.max(0, Math.floor((now.getTime() - new Date(lastCompletedStrengthAt).getTime()) / 86_400_000))
      : undefined,
    completedLast28Days: count?.total ?? 0,
  };
}

export async function saveRaceChecklistItem({
  goalId,
  itemId,
  completed,
}: {
  goalId: string;
  itemId: string;
  completed: boolean;
}): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT INTO race_checklist_state (goal_id, item_id, completed, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(goal_id, item_id) DO UPDATE SET
       completed = excluded.completed,
       updated_at = excluded.updated_at`,
    goalId,
    itemId,
    completed ? 1 : 0,
    new Date().toISOString(),
  );
}

export async function getRaceChecklistState(goalId: string): Promise<Record<string, boolean>> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ item_id: string; completed: number }>(
    'SELECT item_id, completed FROM race_checklist_state WHERE goal_id = ?',
    goalId,
  );
  return Object.fromEntries(rows.map((row) => [row.item_id, row.completed === 1]));
}


export type LoadBasis = 'each_hand' | 'single_implement' | 'total' | 'bodyweight' | 'assisted' | 'band_level' | 'not_recorded';
export type WorkoutLedgerSource = 'side_quest' | 'external' | 'class' | 'custom' | 'workout_together';
export type WorkoutPlanRelation = 'replaced_planned' | 'additional' | 'unrelated';

export interface LoggedSet {
  id: string;
  reps?: number;
  seconds?: number;
  loadValue?: number;
  loadUnit?: 'lb' | 'kg';
  loadBasis: LoadBasis;
  effort?: number;
  completed: boolean;
}

export interface LoggedExercise {
  id: string;
  exerciseId?: string;
  name: string;
  equipmentId?: EquipmentId;
  sets: LoggedSet[];
  bodyRegions: BodyRegionLoad[];
  movementPatterns: MovementPattern[];
  notes?: string;
  matchConfidence?: 'exact' | 'likely' | 'manual' | 'unmatched';
}

export interface WorkoutLedgerEntry {
  id: string;
  source: WorkoutLedgerSource;
  name: string;
  workout?: GeneratedWorkout;
  exercises: LoggedExercise[];
  startedAt: string;
  completedAt: string;
  completionFraction: number;
  stationRounds: Record<string, number>;
  notes?: string;
  plannedSessionId?: string;
  relationToPlan: WorkoutPlanRelation;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentProfile {
  id: string;
  name: string;
  kind: 'home' | 'work' | 'full_gym' | 'travel' | 'custom';
  equipment: EquipmentId[];
  dumbbellLoads?: number[];
  kettlebellLoads?: number[];
  medicineBallLoads?: number[];
  barbellPlateLoads?: number[];
  loadUnit?: 'lb' | 'kg';
  bandDetails?: string;
  notes?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPreferences {
  discoverable: boolean;
  shareWorkoutType: boolean;
  shareDuration: boolean;
  shareWeeklyCount: boolean;
  shareExactExercises: boolean;
  shareLoads: boolean;
}

function inferLoadBasis(equipmentId?: EquipmentId): LoadBasis {
  if (!equipmentId || equipmentId === 'bodyweight') return 'bodyweight';
  if (equipmentId === 'dumbbell') return 'each_hand';
  if (equipmentId === 'long_band' || equipmentId === 'mini_band') return 'band_level';
  if (equipmentId === 'barbell' || equipmentId === 'trap_bar') return 'total';
  return 'single_implement';
}

async function migrateCompletedWorkoutsIntoLedger(): Promise<void> {
  const rows = await db.getAllAsync<{
    id: string;
    workout_json: string;
    started_at: string;
    completed_at: string;
    completion_fraction: number;
    station_rounds_json: string;
  }>(`SELECT completed.id, completed.workout_json, completed.started_at,
            completed.completed_at, completed.completion_fraction,
            completed.station_rounds_json
       FROM completed_workouts completed
       LEFT JOIN workout_ledger ledger ON ledger.id = completed.id
       WHERE ledger.id IS NULL`);
  for (const row of rows) {
    try {
      const workout = JSON.parse(row.workout_json) as GeneratedWorkout;
      const exercises: LoggedExercise[] = workout.stations.flatMap((station) =>
        station.exercises.map((item) => {
          const option = item.exerciseSnapshot.equipmentOptions.find((candidate) => candidate.id === item.equipmentOptionId);
          const equipmentId = option?.items.find((entry) => entry.equipmentId !== 'bodyweight')?.equipmentId
            ?? option?.items[0]?.equipmentId;
          return {
            id: `${row.id}_${item.exerciseId}`,
            exerciseId: item.exerciseId,
            name: item.exerciseSnapshot.name,
            equipmentId,
            sets: [{
              id: `${row.id}_${item.exerciseId}_set_1`,
              reps: item.unit === 'seconds' ? undefined : item.target,
              seconds: item.unit === 'seconds' ? item.target : undefined,
              loadBasis: inferLoadBasis(equipmentId),
              completed: true,
            }],
            bodyRegions: item.exerciseSnapshot.bodyRegions,
            movementPatterns: item.exerciseSnapshot.movementPatterns,
            matchConfidence: 'exact',
          };
        }),
      );
      await db.runAsync(
        `INSERT OR IGNORE INTO workout_ledger
         (id, source, name, workout_json, exercises_json, started_at, completed_at,
          completion_fraction, station_rounds_json, relation_to_plan, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        workout.source === 'manual' ? 'custom' : 'side_quest',
        workout.name,
        row.workout_json,
        JSON.stringify(exercises),
        row.started_at,
        row.completed_at,
        row.completion_fraction,
        row.station_rounds_json,
        'unrelated',
        row.completed_at,
        row.completed_at,
      );
    } catch {
      // Keep the legacy row even when an old snapshot is no longer parseable.
    }
  }
}

export async function deleteCurrentGoalPlan(): Promise<void> {
  await initializeDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM race_checklist_state');
    await db.runAsync('DELETE FROM plan_change_snapshots');
    await db.runAsync('DELETE FROM weekly_training_plans');
    await db.runAsync('DELETE FROM training_blocks');
    await db.runAsync('DELETE FROM performance_goals');
  });
}

export async function saveEquipmentProfile(profile: EquipmentProfile): Promise<void> {
  await initializeDatabase();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    const existing = await db.getAllAsync<{ id: string; profile_json: string }>('SELECT id, profile_json FROM equipment_profiles');
    const normalizedName = profile.name.trim().toLowerCase();
    for (const row of existing) {
      if (row.id === profile.id) continue;
      try {
        const other = JSON.parse(row.profile_json) as EquipmentProfile;
        const sameBuiltInKind = profile.kind !== 'custom' && other.kind === profile.kind;
        const sameName = other.name.trim().toLowerCase() === normalizedName;
        if (sameBuiltInKind || sameName) await db.runAsync('DELETE FROM equipment_profiles WHERE id = ?', row.id);
      } catch { /* Ignore malformed legacy rows. */ }
    }
    if (profile.isDefault) await db.runAsync('UPDATE equipment_profiles SET is_default = 0');
    await db.runAsync(
      `INSERT INTO equipment_profiles (id, profile_json, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         profile_json = excluded.profile_json,
         is_default = excluded.is_default,
         updated_at = excluded.updated_at`,
      profile.id,
      JSON.stringify({ ...profile, updatedAt: now }),
      profile.isDefault ? 1 : 0,
      profile.createdAt,
      now,
    );
  });
}

export async function listEquipmentProfiles(): Promise<EquipmentProfile[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ profile_json: string; is_default: number }>(
    'SELECT profile_json, is_default FROM equipment_profiles ORDER BY is_default DESC, updated_at DESC',
  );
  return rows.flatMap((row) => {
    try {
      const profile = JSON.parse(row.profile_json) as EquipmentProfile;
      return [{ ...profile, isDefault: row.is_default === 1 }];
    } catch { return []; }
  });
}

export async function getDefaultEquipmentProfile(): Promise<EquipmentProfile | null> {
  const profiles = await listEquipmentProfiles();
  return profiles.find((profile) => profile.isDefault) ?? profiles[0] ?? null;
}

export async function deleteEquipmentProfile(id: string): Promise<void> {
  await initializeDatabase();
  await db.runAsync('DELETE FROM equipment_profiles WHERE id = ?', id);
}

export async function ensureDefaultEquipmentProfiles(): Promise<EquipmentProfile[]> {
  const current = await listEquipmentProfiles();
  if (current.length) return current;
  const now = new Date().toISOString();
  const defaults: EquipmentProfile[] = [
    {
      id: 'equipment_home', name: 'Home Gym', kind: 'home',
      equipment: ['bodyweight', 'long_band', 'mini_band', 'slider', 'wall', 'stairs'],
      bandDetails: 'Long resistance bands and short loop bands', loadUnit: 'lb',
      isDefault: true, createdAt: now, updatedAt: now,
    },
    {
      id: 'equipment_full', name: 'Full Gym', kind: 'full_gym',
      equipment: ['bodyweight', 'dumbbell', 'kettlebell', 'barbell', 'weight_plate', 'trap_bar', 'medicine_ball', 'long_band', 'mini_band', 'bosu', 'trx', 'bench', 'box', 'stability_ball', 'slider', 'pullup_bar', 'cable_machine', 'leg_press', 'wall', 'stairs'], loadUnit: 'lb',
      isDefault: false, createdAt: now, updatedAt: now,
    },
    {
      id: 'equipment_travel', name: 'Hotel / Travel', kind: 'travel',
      equipment: ['bodyweight', 'long_band', 'mini_band', 'slider', 'wall', 'stairs'], loadUnit: 'lb',
      isDefault: false, createdAt: now, updatedAt: now,
    },
  ];
  for (const profile of defaults) await saveEquipmentProfile(profile);
  return listEquipmentProfiles();
}

export async function saveExternalWorkout(entry: WorkoutLedgerEntry): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO workout_ledger
     (id, source, name, workout_json, exercises_json, started_at, completed_at,
      completion_fraction, station_rounds_json, notes, planned_session_id,
      relation_to_plan, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.source,
    entry.name,
    entry.workout ? JSON.stringify(entry.workout) : null,
    JSON.stringify(entry.exercises),
    entry.startedAt,
    entry.completedAt,
    entry.completionFraction,
    JSON.stringify(entry.stationRounds),
    entry.notes ?? null,
    entry.plannedSessionId ?? null,
    entry.relationToPlan,
    entry.createdAt,
    new Date().toISOString(),
  );
  if (entry.relationToPlan === 'replaced_planned') {
    await markPlannedSessionReplaced(entry.plannedSessionId, entry.completedAt);
  }
  await rebuildDerivedTrainingMemory();
}

export async function listWorkoutLedgerEntries({
  from,
  to,
  limit = 100,
}: { from?: string; to?: string; limit?: number } = {}): Promise<WorkoutLedgerEntry[]> {
  await initializeDatabase();
  const clauses: string[] = [];
  const args: Array<string | number> = [];
  if (from) { clauses.push('completed_at >= ?'); args.push(from); }
  if (to) { clauses.push('completed_at <= ?'); args.push(to); }
  args.push(limit);
  const rows = await db.getAllAsync<{
    id: string; source: WorkoutLedgerSource; name: string; workout_json: string | null;
    exercises_json: string; started_at: string; completed_at: string; completion_fraction: number;
    station_rounds_json: string; notes: string | null; planned_session_id: string | null;
    relation_to_plan: WorkoutPlanRelation; created_at: string; updated_at: string;
  }>(`SELECT * FROM workout_ledger ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY completed_at DESC LIMIT ?`, ...args);
  return rows.flatMap((row) => {
    try {
      return [{
        id: row.id,
        source: row.source,
        name: row.name,
        workout: row.workout_json ? JSON.parse(row.workout_json) as GeneratedWorkout : undefined,
        exercises: JSON.parse(row.exercises_json) as LoggedExercise[],
        startedAt: row.started_at,
        completedAt: row.completed_at,
        completionFraction: row.completion_fraction,
        stationRounds: JSON.parse(row.station_rounds_json) as Record<string, number>,
        notes: row.notes ?? undefined,
        plannedSessionId: row.planned_session_id ?? undefined,
        relationToPlan: row.relation_to_plan,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }];
    } catch { return []; }
  });
}

export async function getWorkoutLedgerEntry(id: string): Promise<WorkoutLedgerEntry | null> {
  const entries = await listWorkoutLedgerEntries({ limit: 500 });
  return entries.find((entry) => entry.id === id) ?? null;
}

export async function updateWorkoutLedgerEntry(entry: WorkoutLedgerEntry): Promise<void> {
  await initializeDatabase();
  const updatedAt = new Date().toISOString();
  await db.runAsync(
    `UPDATE workout_ledger SET
       source = ?, name = ?, workout_json = ?, exercises_json = ?, started_at = ?, completed_at = ?,
       completion_fraction = ?, station_rounds_json = ?, notes = ?, planned_session_id = ?,
       relation_to_plan = ?, updated_at = ?
     WHERE id = ?`,
    entry.source,
    entry.name,
    entry.workout ? JSON.stringify(entry.workout) : null,
    JSON.stringify(entry.exercises),
    entry.startedAt,
    entry.completedAt,
    entry.completionFraction,
    JSON.stringify(entry.stationRounds),
    entry.notes ?? null,
    entry.plannedSessionId ?? null,
    entry.relationToPlan,
    updatedAt,
    entry.id,
  );
  await rebuildDerivedTrainingMemory();
}

export async function deleteWorkoutLedgerEntry(id: string): Promise<void> {
  await initializeDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM workout_ledger WHERE id = ?', id);
    await db.runAsync('DELETE FROM completed_workouts WHERE id = ?', id);
    await db.runAsync('DELETE FROM workout_reflections WHERE workout_instance_id = ?', id);
    await db.runAsync('DELETE FROM workout_feedback WHERE workout_instance_id = ?', id);
  });
  await rebuildDerivedTrainingMemory();
}

async function markPlannedSessionReplaced(sessionId: string | undefined, completedAt: string): Promise<void> {
  const saved = await getLatestTrainingBlock();
  if (!saved) return;
  const completedDate = completedAt.slice(0, 10);
  const candidates = saved.block.weeks.flatMap((week) => week.sessions)
    .filter((session) => !['completed', 'skipped'].includes(session.completionStatus));
  const target = sessionId
    ? candidates.find((session) => session.id === sessionId)
    : candidates.sort((left, right) => Math.abs(dateDistance(left.date, completedDate)) - Math.abs(dateDistance(right.date, completedDate)))[0];
  if (!target) return;
  await updatePlannedSessionStatus(target.id, 'completed');
}

function dateDistance(left: string, right: string): number {
  return new Date(`${left}T12:00:00`).getTime() - new Date(`${right}T12:00:00`).getTime();
}

export async function rebuildDerivedTrainingMemory(): Promise<void> {
  await initializeDatabase();
  const entries = await listWorkoutLedgerEntries({ limit: 10_000 });
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM body_region_exposures');
    await db.runAsync('DELETE FROM exercise_load_history');
    await db.runAsync('DELETE FROM exercise_performance_history');
    for (const entry of entries) {
      const exposureTotals = new Map<BodyRegion, number>();
      for (const exercise of entry.exercises) {
        const completedSets = exercise.sets.filter((set) => set.completed);
        if (!completedSets.length) continue;
        const volumeMinutes = completedSets.reduce((sum, set) => {
          if (set.seconds) return sum + Math.max(0.25, set.seconds / 60);
          return sum + Math.max(0.35, (set.reps ?? 8) * 3 / 60);
        }, 0) * Math.max(0, Math.min(1, entry.completionFraction));
        for (const load of exercise.bodyRegions) {
          const role = load.role === 'primary' ? 1 : load.role === 'secondary' ? 0.65 : 0.4;
          exposureTotals.set(load.region, (exposureTotals.get(load.region) ?? 0) + load.load * role * volumeMinutes);
        }
        const loadedSet = [...completedSets].reverse().find((set) => Number.isFinite(set.loadValue) && (set.loadValue ?? 0) > 0);
        if (loadedSet?.loadValue && loadedSet.loadUnit && exercise.exerciseId) {
          await db.runAsync(
            `INSERT INTO exercise_load_history
             (exercise_id, exercise_name, load_value, load_unit, completed_at)
             VALUES (?, ?, ?, ?, ?)`,
            exercise.exerciseId, exercise.name, loadedSet.loadValue, loadedSet.loadUnit, entry.completedAt,
          );
        }
        const representative = completedSets[completedSets.length - 1]!;
        await db.runAsync(
          `INSERT OR REPLACE INTO exercise_performance_history
           (id, workout_instance_id, exercise_id, exercise_name, equipment_id,
            target_value, target_unit, load_value, load_unit, completion_fraction, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          `${entry.id}_${exercise.exerciseId ?? exercise.id}`,
          entry.id,
          exercise.exerciseId ?? exercise.id,
          exercise.name,
          exercise.equipmentId ?? null,
          representative.seconds ?? representative.reps ?? 0,
          representative.seconds ? 'seconds' : 'total',
          representative.loadValue ?? null,
          representative.loadUnit ?? null,
          entry.completionFraction,
          entry.completedAt,
        );
      }
      for (const [region, rawExposure] of exposureTotals) {
        await db.runAsync(
          `INSERT INTO body_region_exposures (workout_id, region, raw_exposure, completed_at)
           VALUES (?, ?, ?, ?)`,
          entry.id, region, rawExposure, entry.completedAt,
        );
      }
    }
  });
}

export async function getRegionRecency(): Promise<Partial<Record<BodyRegion, string>>> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ region: BodyRegion; completed_at: string }>(
    `SELECT region, MAX(completed_at) AS completed_at
     FROM body_region_exposures GROUP BY region`,
  );
  return Object.fromEntries(rows.map((row) => [row.region, row.completed_at]));
}

export interface RegionWorkoutEvidence {
  workoutId: string;
  workoutName: string;
  completedAt: string;
  exerciseName: string;
  exerciseId?: string;
  role: 'primary' | 'secondary' | 'stabilizer';
  load: number;
  completedSets: number;
  reps?: number;
  seconds?: number;
  loadValue?: number;
  loadUnit?: 'lb' | 'kg';
  loadBasis?: LoadBasis;
}

export async function listRegionWorkoutEvidence(region: BodyRegion, limit = 40): Promise<RegionWorkoutEvidence[]> {
  const entries = await listWorkoutLedgerEntries({ limit: 2_000 });
  const evidence: RegionWorkoutEvidence[] = [];
  for (const entry of entries) {
    for (const exercise of entry.exercises) {
      const regionLoad = exercise.bodyRegions.find((item) => item.region === region);
      if (!regionLoad) continue;
      const completedSets = exercise.sets.filter((set) => set.completed);
      if (!completedSets.length) continue;
      const representative = completedSets[completedSets.length - 1]!;
      evidence.push({
        workoutId: entry.id,
        workoutName: entry.name,
        completedAt: entry.completedAt,
        exerciseName: exercise.name,
        exerciseId: exercise.exerciseId,
        role: regionLoad.role,
        load: regionLoad.load,
        completedSets: completedSets.length,
        reps: representative.reps,
        seconds: representative.seconds,
        loadValue: representative.loadValue,
        loadUnit: representative.loadUnit,
        loadBasis: representative.loadBasis,
      });
    }
  }
  return evidence.sort((left, right) => right.completedAt.localeCompare(left.completedAt)).slice(0, limit);
}

export async function saveSocialPreferences(preferences: SocialPreferences): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO social_preferences (id, preferences_json, updated_at)
     VALUES ('primary', ?, ?)`,
    JSON.stringify(preferences), new Date().toISOString(),
  );
}

export async function getSocialPreferences(): Promise<SocialPreferences> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ preferences_json: string }>(
    `SELECT preferences_json FROM social_preferences WHERE id = 'primary'`,
  );
  if (row) {
    try { return JSON.parse(row.preferences_json) as SocialPreferences; } catch {}
  }
  return {
    discoverable: false,
    shareWorkoutType: true,
    shareDuration: true,
    shareWeeklyCount: true,
    shareExactExercises: false,
    shareLoads: false,
  };
}

export interface EnduranceActivityUpsertResult {
  insertedIds: string[];
  updatedIds: string[];
  deletedIds: string[];
}

export async function upsertEnduranceActivities(
  activities: EnduranceActivity[],
): Promise<EnduranceActivityUpsertResult> {
  await initializeDatabase();
  const result: EnduranceActivityUpsertResult = { insertedIds: [], updatedIds: [], deletedIds: [] };
  await db.withTransactionAsync(async () => {
    for (const activity of activities) {
      const existing = await db.getFirstAsync<{ updated_at: string; deleted_at: string | null; activity_json: string }>(
        'SELECT updated_at, deleted_at, activity_json FROM endurance_activities WHERE id = ?', activity.id,
      );
      let mergedActivity = activity;
      if (existing) {
        try {
          const saved = JSON.parse(existing.activity_json) as EnduranceActivity;
          if (saved.classification && (!activity.classification || activity.classification === 'unclassified')) {
            mergedActivity = { ...activity, classification: saved.classification };
          }
        } catch {}
      }
      await db.runAsync(
        `INSERT INTO endurance_activities
         (id, source, external_id, activity_json, start_at, deleted_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source,
           external_id = excluded.external_id,
           activity_json = excluded.activity_json,
           start_at = excluded.start_at,
           deleted_at = excluded.deleted_at,
           updated_at = excluded.updated_at`,
        mergedActivity.id, mergedActivity.source, mergedActivity.externalId, JSON.stringify(mergedActivity), mergedActivity.startAt,
        mergedActivity.deletedAt ?? null, mergedActivity.updatedAt,
      );
      if (!existing) result.insertedIds.push(activity.id);
      else if (existing.updated_at !== activity.updatedAt || existing.deleted_at !== (activity.deletedAt ?? null)) result.updatedIds.push(activity.id);
      if (mergedActivity.deletedAt) result.deletedIds.push(mergedActivity.id);
    }
  });
  return result;
}

export async function listEnduranceActivities({
  from,
  to,
  includeDeleted = false,
  limit = 500,
}: { from?: string; to?: string; includeDeleted?: boolean; limit?: number } = {}): Promise<EnduranceActivity[]> {
  await initializeDatabase();
  const clauses: string[] = [];
  const args: Array<string | number> = [];
  if (from) { clauses.push('start_at >= ?'); args.push(from); }
  if (to) { clauses.push('start_at <= ?'); args.push(to); }
  if (!includeDeleted) clauses.push('deleted_at IS NULL');
  args.push(limit);
  const rows = await db.getAllAsync<{ activity_json: string }>(
    `SELECT activity_json FROM endurance_activities ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY start_at DESC LIMIT ?`, ...args,
  );
  return rows.flatMap((row) => {
    try { return [JSON.parse(row.activity_json) as EnduranceActivity]; } catch { return []; }
  });
}

export async function getEnduranceActivity(id: string): Promise<EnduranceActivity | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ activity_json: string }>(
    'SELECT activity_json FROM endurance_activities WHERE id = ?', id,
  );
  if (!row) return null;
  try { return JSON.parse(row.activity_json) as EnduranceActivity; } catch { return null; }
}

export async function updateEnduranceActivityClassification(
  id: string,
  classification: ExternalTrainingClassification,
): Promise<EnduranceActivity | null> {
  await initializeDatabase();
  const activity = await getEnduranceActivity(id);
  if (!activity) return null;
  const updated: EnduranceActivity = { ...activity, classification };
  await db.runAsync(
    'UPDATE endurance_activities SET activity_json = ? WHERE id = ?',
    JSON.stringify(updated), id,
  );
  return updated;
}

export async function softDeleteEnduranceActivity({
  source,
  externalId,
  deletedAt = new Date().toISOString(),
}: { source: EnduranceActivity['source']; externalId: string; deletedAt?: string }): Promise<string | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ id: string; activity_json: string }>(
    'SELECT id, activity_json FROM endurance_activities WHERE source = ? AND external_id = ?', source, externalId,
  );
  if (!row) return null;
  try {
    const activity = JSON.parse(row.activity_json) as EnduranceActivity;
    const updated = { ...activity, deletedAt, updatedAt: deletedAt };
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'UPDATE endurance_activities SET activity_json = ?, deleted_at = ?, updated_at = ? WHERE id = ?',
        JSON.stringify(updated), deletedAt, deletedAt, row.id,
      );
      await db.runAsync('DELETE FROM planned_completed_matches WHERE activity_id = ?', row.id);
      await db.runAsync('DELETE FROM endurance_region_contributions WHERE activity_id = ?', row.id);
      await db.runAsync('DELETE FROM workout_sensor_links WHERE activity_id = ?', row.id);
    });
    return row.id;
  } catch { return null; }
}


export async function softDeleteEnduranceActivitiesBySource(
  source: EnduranceActivity['source'],
  deletedAt = new Date().toISOString(),
): Promise<number> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ id: string; activity_json: string }>(
    'SELECT id, activity_json FROM endurance_activities WHERE source = ? AND deleted_at IS NULL', source,
  );
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      try {
        const activity = JSON.parse(row.activity_json) as EnduranceActivity;
        const updated = { ...activity, deletedAt, updatedAt: deletedAt };
        await db.runAsync(
          'UPDATE endurance_activities SET activity_json = ?, deleted_at = ?, updated_at = ? WHERE id = ?',
          JSON.stringify(updated), deletedAt, deletedAt, row.id,
        );
        await db.runAsync('DELETE FROM planned_completed_matches WHERE activity_id = ?', row.id);
        await db.runAsync('DELETE FROM endurance_region_contributions WHERE activity_id = ?', row.id);
        await db.runAsync('DELETE FROM workout_sensor_links WHERE activity_id = ?', row.id);
      } catch {}
    }
  });
  return rows.length;
}

export async function replaceAutomaticWorkoutSensorLinks(
  activityIds: string[],
  links: WorkoutSensorLink[],
): Promise<void> {
  await initializeDatabase();
  await db.withTransactionAsync(async () => {
    for (const activityId of activityIds) {
      await db.runAsync(
        `DELETE FROM workout_sensor_links WHERE activity_id = ? AND method = 'automatic'`,
        activityId,
      );
    }
    for (const link of links) {
      const existing = await db.getFirstAsync<{ method: string }>(
        'SELECT method FROM workout_sensor_links WHERE activity_id = ?', link.activityId,
      );
      if (existing?.method === 'manual') continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO workout_sensor_links
         (id, activity_id, workout_id, status, confidence, method, link_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        link.id, link.activityId, link.workoutId ?? null, link.status, link.confidence, link.method,
        JSON.stringify(link), link.updatedAt,
      );
    }
  });
}

export async function saveWorkoutSensorLink(link: WorkoutSensorLink): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO workout_sensor_links
     (id, activity_id, workout_id, status, confidence, method, link_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    link.id, link.activityId, link.workoutId ?? null, link.status, link.confidence, link.method,
    JSON.stringify(link), link.updatedAt,
  );
}

export async function deleteWorkoutSensorLink(activityId: string): Promise<void> {
  await initializeDatabase();
  await db.runAsync('DELETE FROM workout_sensor_links WHERE activity_id = ?', activityId);
}

export async function listWorkoutSensorLinks(): Promise<WorkoutSensorLink[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ link_json: string }>(
    'SELECT link_json FROM workout_sensor_links ORDER BY updated_at DESC',
  );
  return rows.flatMap((row) => {
    try { return [JSON.parse(row.link_json) as WorkoutSensorLink]; } catch { return []; }
  });
}

export async function getWorkoutSensorContext(workoutId: string): Promise<{ link: WorkoutSensorLink; activity: EnduranceActivity } | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ link_json: string; activity_json: string }>(
    `SELECT link.link_json, activity.activity_json
     FROM workout_sensor_links link
     JOIN endurance_activities activity ON activity.id = link.activity_id
     WHERE link.workout_id = ? AND link.status = 'linked' AND activity.deleted_at IS NULL
     ORDER BY link.updated_at DESC LIMIT 1`,
    workoutId,
  );
  if (!row) return null;
  try {
    return {
      link: JSON.parse(row.link_json) as WorkoutSensorLink,
      activity: JSON.parse(row.activity_json) as EnduranceActivity,
    };
  } catch { return null; }
}

export async function replacePlannedCompletedMatches(
  activityIds: string[],
  matches: PlannedCompletedMatch[],
): Promise<void> {
  await initializeDatabase();
  await db.withTransactionAsync(async () => {
    if (activityIds.length === 0 && matches.length === 0) {
      await db.runAsync(`DELETE FROM planned_completed_matches WHERE id NOT LIKE 'match_manual_%'`);
    } else {
      for (const id of activityIds) {
        await db.runAsync(
          `DELETE FROM planned_completed_matches WHERE activity_id = ? AND id NOT LIKE 'match_manual_%'`,
          id,
        );
      }
    }
    for (const match of matches) {
      const manual = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM planned_completed_matches WHERE activity_id = ? AND id LIKE 'match_manual_%' LIMIT 1`,
        match.activityId,
      );
      if (manual) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO planned_completed_matches
         (id, activity_id, calendar_event_id, status, confidence, match_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        match.id, match.activityId, match.calendarEventId ?? null, match.status, match.confidence,
        JSON.stringify(match), match.updatedAt,
      );
    }
  });
}

export async function saveManualPlannedCompletedMatch(match: PlannedCompletedMatch): Promise<void> {
  await initializeDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM planned_completed_matches WHERE activity_id = ?', match.activityId);
    await db.runAsync(
      `INSERT INTO planned_completed_matches
       (id, activity_id, calendar_event_id, status, confidence, match_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      match.id, match.activityId, match.calendarEventId ?? null, match.status, match.confidence,
      JSON.stringify(match), match.updatedAt,
    );
  });
}

export async function deleteManualPlannedCompletedMatch(activityId: string): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `DELETE FROM planned_completed_matches WHERE activity_id = ? AND id LIKE 'match_manual_%'`,
    activityId,
  );
}

export async function listPlannedCompletedMatches(): Promise<PlannedCompletedMatch[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ match_json: string }>(
    'SELECT match_json FROM planned_completed_matches ORDER BY updated_at DESC',
  );
  return rows.flatMap((row) => {
    try { return [JSON.parse(row.match_json) as PlannedCompletedMatch]; } catch { return []; }
  });
}

export async function replaceEnduranceContributions(
  activityId: string,
  contributions: EnduranceRegionContribution[],
): Promise<void> {
  await initializeDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM endurance_region_contributions WHERE activity_id = ?', activityId);
    for (const item of contributions) {
      await db.runAsync(
        `INSERT OR REPLACE INTO endurance_region_contributions
         (id, activity_id, region, contribution, completed_at, contribution_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        item.id, item.activityId, item.region, item.contribution, item.completedAt, JSON.stringify(item),
      );
    }
  });
}

export async function getEnduranceTrainingBalance(
  lookbackDays = 14,
): Promise<Array<{ region: BodyRegion; contribution: number }>> {
  await initializeDatabase();
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  return db.getAllAsync<{ region: BodyRegion; contribution: number }>(
    `SELECT region, SUM(contribution) AS contribution
     FROM endurance_region_contributions
     WHERE completed_at >= ?
     GROUP BY region
     ORDER BY contribution DESC`, cutoff,
  );
}

export interface TrainingMemoryRegionBreakdown {
  region: BodyRegion;
  strengthExposure: number;
  enduranceContribution: number;
  combinedExposure: number;
}

export async function getTrainingMemoryBreakdown(lookbackDays = 14): Promise<TrainingMemoryRegionBreakdown[]> {
  const [strength, endurance] = await Promise.all([
    getTrainingBalance(lookbackDays),
    getEnduranceTrainingBalance(lookbackDays),
  ]);
  const regions = new Set<BodyRegion>([
    ...strength.map((item) => item.region),
    ...endurance.map((item) => item.region),
  ]);
  const strengthMap = new Map(strength.map((item) => [item.region, item.exposure]));
  const enduranceMap = new Map(endurance.map((item) => [item.region, item.contribution]));
  return [...regions].map((region) => {
    const strengthExposure = strengthMap.get(region) ?? 0;
    const enduranceContribution = enduranceMap.get(region) ?? 0;
    return {
      region,
      strengthExposure,
      enduranceContribution,
      combinedExposure: strengthExposure + enduranceContribution,
    };
  }).sort((left, right) => right.combinedExposure - left.combinedExposure);
}

export async function getEnduranceRegionRecency(): Promise<Partial<Record<BodyRegion, string>>> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ region: BodyRegion; completed_at: string }>(
    `SELECT region, MAX(completed_at) AS completed_at
     FROM endurance_region_contributions GROUP BY region`,
  );
  return Object.fromEntries(rows.map((row) => [row.region, row.completed_at]));
}

export interface EnduranceRegionEvidence {
  activityId: string;
  activityName: string;
  discipline: EnduranceActivity['discipline'];
  completedAt: string;
  contribution: number;
  confidence: EnduranceRegionContribution['confidence'];
  rationale: string;
}

export async function listEnduranceRegionEvidence(region: BodyRegion, limit = 40): Promise<EnduranceRegionEvidence[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ contribution_json: string; activity_json: string }>(
    `SELECT c.contribution_json, a.activity_json
     FROM endurance_region_contributions c
     JOIN endurance_activities a ON a.id = c.activity_id
     WHERE c.region = ? AND a.deleted_at IS NULL
     ORDER BY c.completed_at DESC LIMIT ?`, region, limit,
  );
  return rows.flatMap((row) => {
    try {
      const contribution = JSON.parse(row.contribution_json) as EnduranceRegionContribution;
      const activity = JSON.parse(row.activity_json) as EnduranceActivity;
      return [{
        activityId: activity.id,
        activityName: activity.name,
        discipline: activity.discipline,
        completedAt: contribution.completedAt,
        contribution: contribution.contribution,
        confidence: contribution.confidence,
        rationale: contribution.rationale,
      }];
    } catch { return []; }
  });
}

export async function saveAutomaticReplanRecord(record: AutomaticReplanRecord): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO automatic_replan_records
     (id, trigger_activity_id, snapshot_id, record_json, created_at, undone_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    record.id, record.triggerActivityId, record.snapshotId, JSON.stringify(record), record.createdAt, record.undoneAt ?? null,
  );
}

export async function listAutomaticReplanRecords(limit = 20): Promise<AutomaticReplanRecord[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ record_json: string }>(
    'SELECT record_json FROM automatic_replan_records ORDER BY created_at DESC LIMIT ?', limit,
  );
  return rows.flatMap((row) => {
    try { return [JSON.parse(row.record_json) as AutomaticReplanRecord]; } catch { return []; }
  });
}

export async function markAutomaticReplanUndone(snapshotId: string): Promise<void> {
  await initializeDatabase();
  const undoneAt = new Date().toISOString();
  const rows = await db.getAllAsync<{ id: string; record_json: string }>(
    'SELECT id, record_json FROM automatic_replan_records WHERE snapshot_id = ?', snapshotId,
  );
  for (const row of rows) {
    try {
      const record = JSON.parse(row.record_json) as AutomaticReplanRecord;
      const updated = { ...record, undoneAt };
      await db.runAsync(
        'UPDATE automatic_replan_records SET record_json = ?, undone_at = ? WHERE id = ?',
        JSON.stringify(updated), undoneAt, row.id,
      );
    } catch {}
  }
}

export interface IntegrationSyncState {
  integrationId: string;
  status: 'idle' | 'syncing' | 'success' | 'error' | 'disconnected';
  connected?: boolean;
  lastAttemptedAt?: string;
  lastSuccessfulAt?: string;
  lastError?: string;
  importedCount?: number;
  updatedAt: string;
}

export async function saveIntegrationSyncState(state: IntegrationSyncState): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO integration_sync_state (integration_id, state_json, updated_at)
     VALUES (?, ?, ?)`, state.integrationId, JSON.stringify(state), state.updatedAt,
  );
}

export async function getIntegrationSyncState(integrationId: string): Promise<IntegrationSyncState | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ state_json: string }>(
    'SELECT state_json FROM integration_sync_state WHERE integration_id = ?', integrationId,
  );
  if (!row) return null;
  try { return JSON.parse(row.state_json) as IntegrationSyncState; } catch { return null; }
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type BetaFeedbackCategory = 'bug' | 'recommendation' | 'exercise' | 'demo' | 'navigation' | 'idea';
export interface BetaFeedbackRecord { id:string; category:BetaFeedbackCategory; message:string; route?:string; includeContext:boolean; context?:Record<string,unknown>; createdAt:string; }
export async function saveBetaFeedback(record:BetaFeedbackRecord):Promise<void>{await initializeDatabase();await db.runAsync(`CREATE TABLE IF NOT EXISTS beta_feedback (id TEXT PRIMARY KEY NOT NULL, feedback_json TEXT NOT NULL, created_at TEXT NOT NULL)`);await db.runAsync('INSERT OR REPLACE INTO beta_feedback (id, feedback_json, created_at) VALUES (?, ?, ?)',record.id,JSON.stringify(record),record.createdAt);}
export async function listBetaFeedback():Promise<BetaFeedbackRecord[]>{await initializeDatabase();await db.runAsync(`CREATE TABLE IF NOT EXISTS beta_feedback (id TEXT PRIMARY KEY NOT NULL, feedback_json TEXT NOT NULL, created_at TEXT NOT NULL)`);const rows=await db.getAllAsync<{feedback_json:string}>('SELECT feedback_json FROM beta_feedback ORDER BY created_at DESC');return rows.flatMap(r=>{try{return [JSON.parse(r.feedback_json) as BetaFeedbackRecord]}catch{return []}})}


export async function saveTrainingIntelligencePreferences(preferences: TrainingIntelligencePreferences): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO training_intelligence_state (id, state_json, updated_at) VALUES ('preferences', ?, ?)`,
    JSON.stringify(preferences), preferences.updatedAt,
  );
}

export async function getTrainingIntelligencePreferences(): Promise<TrainingIntelligencePreferences | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ state_json: string }>(
    `SELECT state_json FROM training_intelligence_state WHERE id = 'preferences'`,
  );
  if (!row) return null;
  try { return JSON.parse(row.state_json) as TrainingIntelligencePreferences; } catch { return null; }
}

export async function saveTrainingIntelligenceSnapshot(snapshot: TrainingIntelligenceSnapshot): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO training_intelligence_state (id, state_json, updated_at) VALUES ('latest_snapshot', ?, ?)`,
    JSON.stringify(snapshot), snapshot.generatedAt,
  );
}

export async function getLatestTrainingIntelligenceSnapshot(): Promise<TrainingIntelligenceSnapshot | null> {
  await initializeDatabase();
  const row = await db.getFirstAsync<{ state_json: string }>(
    `SELECT state_json FROM training_intelligence_state WHERE id = 'latest_snapshot'`,
  );
  if (!row) return null;
  try { return JSON.parse(row.state_json) as TrainingIntelligenceSnapshot; } catch { return null; }
}

export async function saveTrainingAdjustmentDecision(proposal: StrengthAdjustmentProposal): Promise<void> {
  await initializeDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO training_adjustment_history (id, proposal_json, status, updated_at) VALUES (?, ?, ?, ?)`,
    proposal.id, JSON.stringify(proposal), proposal.status, proposal.updatedAt,
  );
}

export async function listTrainingAdjustmentHistory(limit = 100): Promise<StrengthAdjustmentProposal[]> {
  await initializeDatabase();
  const rows = await db.getAllAsync<{ proposal_json: string }>(
    `SELECT proposal_json FROM training_adjustment_history ORDER BY updated_at DESC LIMIT ?`, limit,
  );
  return rows.flatMap((row) => {
    try { return [JSON.parse(row.proposal_json) as StrengthAdjustmentProposal]; } catch { return []; }
  });
}


export type CloudOperationKind = 'calendar_sync' | 'strava_sync' | 'coach_plan_sync' | 'beta_feedback_upload' | 'profile_sync';
export type CloudOperationStatus = 'pending' | 'retrying';
export interface CloudOperationRecord {
  id: string;
  kind: CloudOperationKind;
  dedupeKey: string;
  payload: Record<string, unknown>;
  status: CloudOperationStatus;
  attempts: number;
  lastErrorCode?: string;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
}
export interface CloudOperationQueueStats {
  pending: number;
  retrying: number;
  dueNow: number;
  oldestCreatedAt?: string;
}

export async function enqueueCloudOperation(input: {
  kind: CloudOperationKind;
  dedupeKey: string;
  payload?: Record<string, unknown>;
  nextAttemptAt?: string;
}): Promise<CloudOperationRecord> {
  await initializeDatabase();
  const now = new Date().toISOString();
  const id = `cloud_${input.kind}_${hashLocal(input.dedupeKey)}`;
  const nextAttemptAt = input.nextAttemptAt ?? now;
  await db.runAsync(
    `INSERT INTO cloud_operation_queue
      (id,kind,dedupe_key,payload_json,status,attempts,last_error_code,next_attempt_at,created_at,updated_at)
     VALUES (?,?,?,?, 'pending',0,NULL,?,?,?)
     ON CONFLICT(dedupe_key) DO UPDATE SET
       kind=excluded.kind,
       payload_json=excluded.payload_json,
       status='pending',
       next_attempt_at=MIN(cloud_operation_queue.next_attempt_at, excluded.next_attempt_at),
       updated_at=excluded.updated_at`,
    id,input.kind,input.dedupeKey,JSON.stringify(input.payload ?? {}),nextAttemptAt,now,now,
  );
  const row = await db.getFirstAsync<CloudOperationRow>('SELECT * FROM cloud_operation_queue WHERE dedupe_key=?',input.dedupeKey);
  if(!row) throw new Error('The reliability operation could not be queued.');
  return cloudOperationFromRow(row);
}

type CloudOperationRow={id:string;kind:CloudOperationKind;dedupe_key:string;payload_json:string;status:CloudOperationStatus;attempts:number;last_error_code:string|null;next_attempt_at:string;created_at:string;updated_at:string};
function cloudOperationFromRow(row:CloudOperationRow):CloudOperationRecord{
  let payload:Record<string,unknown>={};
  try{payload=JSON.parse(row.payload_json) as Record<string,unknown>}catch{}
  return{id:row.id,kind:row.kind,dedupeKey:row.dedupe_key,payload,status:row.status,attempts:row.attempts,lastErrorCode:row.last_error_code??undefined,nextAttemptAt:row.next_attempt_at,createdAt:row.created_at,updatedAt:row.updated_at};
}
function hashLocal(value:string):string{let hash=2166136261;for(let index=0;index<value.length;index+=1){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619)}return (hash>>>0).toString(16)}

export async function listDueCloudOperations(limit=10,now=new Date()):Promise<CloudOperationRecord[]>{
  await initializeDatabase();
  const rows=await db.getAllAsync<CloudOperationRow>(
    `SELECT * FROM cloud_operation_queue WHERE status IN ('pending','retrying') AND next_attempt_at<=? ORDER BY created_at ASC LIMIT ?`,
    now.toISOString(),limit,
  );
  return rows.map(cloudOperationFromRow);
}
export async function markCloudOperationSucceeded(id:string):Promise<void>{await initializeDatabase();await db.runAsync('DELETE FROM cloud_operation_queue WHERE id=?',id)}
export async function markCloudOperationFailed(id:string,errorCode:string,attempts:number):Promise<void>{
  await initializeDatabase();
  const bounded=Math.max(1,Math.min(8,attempts));
  const delayMinutes=Math.min(12*60,5*(2**(bounded-1)));
  const nextAttemptAt=new Date(Date.now()+delayMinutes*60_000).toISOString();
  await db.runAsync(`UPDATE cloud_operation_queue SET status='retrying',attempts=?,last_error_code=?,next_attempt_at=?,updated_at=? WHERE id=?`,bounded,errorCode.slice(0,80),nextAttemptAt,new Date().toISOString(),id);
}
export async function retryAllCloudOperationsNow():Promise<void>{await initializeDatabase();const now=new Date().toISOString();await db.runAsync(`UPDATE cloud_operation_queue SET status='pending',next_attempt_at=?,updated_at=? WHERE status IN ('pending','retrying')`,now,now)}
export async function getCloudOperationQueueStats(now=new Date()):Promise<CloudOperationQueueStats>{
  await initializeDatabase();
  const rows=await db.getAllAsync<{status:CloudOperationStatus;next_attempt_at:string;created_at:string}>('SELECT status,next_attempt_at,created_at FROM cloud_operation_queue');
  return{pending:rows.filter(r=>r.status==='pending').length,retrying:rows.filter(r=>r.status==='retrying').length,dueNow:rows.filter(r=>new Date(r.next_attempt_at).getTime()<=now.getTime()).length,oldestCreatedAt:rows.map(r=>r.created_at).sort()[0]};
}

const EXPORT_TABLES=['favorite_workouts','completed_workouts','body_region_exposures','performance_goals','weekly_training_plans','training_blocks','pt_profiles','training_check_ins','exercise_preferences','workout_feedback','exercise_load_history','exercise_performance_history','training_calendar_sources','training_calendar_events','custom_exercises','readiness_check_ins','workout_reflections','plan_change_snapshots','progression_targets','race_checklist_state','beta_feedback','equipment_profiles','workout_ledger','social_preferences','endurance_activities','planned_completed_matches','endurance_region_contributions','automatic_replan_records','integration_sync_state','training_intelligence_state','training_adjustment_history','cloud_operation_queue'] as const;
export async function exportLocalData():Promise<Record<string,unknown[]>>{await initializeDatabase();const output:Record<string,unknown[]>={};for(const table of EXPORT_TABLES){try{output[table]=await db.getAllAsync<Record<string,unknown>>(`SELECT * FROM ${table}`)}catch{output[table]=[]}}return output;}
export async function deleteAllLocalData():Promise<void>{await initializeDatabase();await db.withTransactionAsync(async()=>{for(const table of EXPORT_TABLES){try{await db.runAsync(`DELETE FROM ${table}`)}catch{}}});}
export async function countCompletedWorkouts():Promise<number>{await initializeDatabase();const row=await db.getFirstAsync<{total:number}>('SELECT COUNT(*) AS total FROM workout_ledger');return row?.total??0;}
export async function getEnduranceTrainingBalanceBetween({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<Array<{ region: BodyRegion; contribution: number }>> {
  await initializeDatabase();
  return db.getAllAsync<{ region: BodyRegion; contribution: number }>(
    `SELECT region, SUM(contribution) AS contribution
     FROM endurance_region_contributions
     WHERE completed_at >= ? AND completed_at < ?
     GROUP BY region
     ORDER BY contribution DESC`,
    from,
    to,
  );
}
