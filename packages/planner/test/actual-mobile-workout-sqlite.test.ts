import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createManualEnduranceActivity } from '../src/manual-endurance';

/**
 * This test loads the ACTUAL mobile database service. The only replacement
 * is the Expo SQLite transport: Node's real disk-backed sqlite executes the
 * app's unchanged initialization, transaction and query SQL.
 * It is not a native Expo / physical-device test.
 */
const state = vi.hoisted(() => ({
  directory: '',
  handles: [] as Array<{ close: () => void }>,
  failNextContaining: null as string | null,
  exclusiveSnapshotReads: 0,
  failExclusiveReview: false,
  holdExclusiveReview: null as Promise<void> | null,
  signalExclusiveStarted: null as (() => void) | null,
}));
// Mock only the planner SQL surfaces required by the mobile database service.
// Use their real implementations without loading unrelated React Native UI exports.
vi.mock('@circuit/planner', async () => {
  const sql = await import('../src/training-adjustment-sqlite');
  const dates = await import('../src/first-week-dates');
  const strength = await import('../src/daily-strength-decision-sqlite');
  const preview = await import('../src/strength-revision-preview-sqlite');
  const review = await import('../src/strength-preview-review-events-sqlite');
  const inbox = await import('../src/strength-revision-review-inbox');
  const detail = await import('../src/strength-revision-review-detail');
  const dryRun = await import('../src/strength-authorization-dry-run');
  const evidence = await import('../src/strength-evidence-provenance-sqlite');
  const safetyContext = await import('../src/training-safety-context-sqlite');
  const auth = await import('../src/strength-workout-authorization-sqlite');
  const start = await import('../src/strength-workout-start-safety-sqlite');
  return {
    localCalendarDate: dates.localCalendarDate,
    STRENGTH_CHOICE_AUDIT_SQL: strength.STRENGTH_CHOICE_AUDIT_SQL,
    STRENGTH_REVISION_PREVIEW_SQL: preview.STRENGTH_REVISION_PREVIEW_SQL,
    STRENGTH_PREVIEW_REVIEW_EVENTS_SQL: review.STRENGTH_PREVIEW_REVIEW_EVENTS_SQL,
    readStrengthPreviewReviewState: review.readStrengthPreviewReviewState,
    appendStrengthPreviewReviewEvent: review.appendStrengthPreviewReviewEvent,
    listUnapprovedStrengthReviewInbox: inbox.listUnapprovedStrengthReviewInbox,
    readUnapprovedStrengthReviewDetail: detail.readUnapprovedStrengthReviewDetail,
    inspectStrengthAuthorizationDryRun: dryRun.inspectStrengthAuthorizationDryRun,
    STRENGTH_EVIDENCE_PROVENANCE_SQL: evidence.STRENGTH_EVIDENCE_PROVENANCE_SQL,
    appendStrengthEvidenceProvenance: evidence.appendStrengthEvidenceProvenance,
    TRAINING_SAFETY_CONTEXT_SQL: safetyContext.TRAINING_SAFETY_CONTEXT_SQL,
    STRENGTH_WORKOUT_AUTHORIZATION_SQL: auth.STRENGTH_WORKOUT_AUTHORIZATION_SQL,
    STRENGTH_AUTHORIZATION_WITHDRAWAL_SQL: start.STRENGTH_AUTHORIZATION_WITHDRAWAL_SQL,
    STRENGTH_START_INTENT_SQL: start.STRENGTH_START_INTENT_SQL,
    STRENGTH_NATIVE_START_CHECKPOINT_SQL: start.STRENGTH_NATIVE_START_CHECKPOINT_SQL,
    STRENGTH_NATIVE_START_TERMINAL_SQL: (await import('../src/strength-workout-recovery-sqlite')).STRENGTH_NATIVE_START_TERMINAL_SQL,
    assessRoutineNativeActiveSafety: (await import('../src/strength-workout-recovery-sqlite')).assessRoutineNativeActiveSafety,
    finishRoutineNativeStart: (await import('../src/strength-workout-recovery-sqlite')).finishRoutineNativeStart,
    commitRoutineNativeStartCheckpoint: start.commitRoutineNativeStartCheckpoint,
    readRoutineNativeStartCheckpoint: start.readRoutineNativeStartCheckpoint,
    recordRoutineStrengthStartIntent: start.recordRoutineStrengthStartIntent,
    readRoutineStrengthStartIntent: start.readRoutineStrengthStartIntent,
    withdrawRoutineStrengthAuthorization: start.withdrawRoutineStrengthAuthorization,
    readRoutineAuthorizationWithdrawal: start.readRoutineAuthorizationWithdrawal,
    inspectRoutineWorkoutStart: start.inspectRoutineWorkoutStart,
    authorizeRoutineStrengthWorkout: auth.authorizeRoutineStrengthWorkout,
    readAuthorizedRoutineWorkout: auth.readAuthorizedRoutineWorkout,
    readAthleteTrainingSafetyContext: safetyContext.readAthleteTrainingSafetyContext,
    evaluateTrainingSafetyPolicy: safetyContext.evaluateTrainingSafetyPolicy,
    appendTrainingSafetyContextEvent: safetyContext.appendTrainingSafetyContextEvent,
    readStrengthRevisionPreview: preview.readStrengthRevisionPreview,
    readStrengthChoiceAudit: strength.readStrengthChoiceAudit,
    PLAN_ADJUSTMENT_TABLE_SQL: sql.PLAN_ADJUSTMENT_TABLE_SQL,
    appendTrainingAdjustmentDecision: sql.appendTrainingAdjustmentDecision,
    readTrainingAdjustmentDecisions: sql.readTrainingAdjustmentDecisions,
    effectiveTrainingCalendarEvents: sql.effectiveTrainingCalendarEvents,
  };
});
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (choices: Record<string, unknown>) => choices.ios },
  NativeModules: {},
}));
vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('../../../apps/mobile/src/services/strava', () => ({
  getStravaConnection: vi.fn(async () => null),
}));
vi.mock('expo-sqlite', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  return {
    openDatabaseSync(name: string) {
      const database = new DatabaseSync(join(state.directory, name));
      state.handles.push(database);
      const run = (sql: string, args: unknown[]) => {
        if (state.failNextContaining && sql.includes(state.failNextContaining)) {
          state.failNextContaining = null;
          throw new Error('synthetic SQLite write interruption');
        }
        return database.prepare(sql).run(...(args as Array<string | number | null>));
      };
      return {
        execAsync: async (sql: string) => { database.exec(sql); },
        runAsync: async (sql: string, ...args: unknown[]) => run(sql, args),
        getFirstAsync: async (sql: string, ...args: unknown[]) =>
          database.prepare(sql).get(...(args as Array<string | number | null>)) ?? null,
        getAllAsync: async (sql: string, ...args: unknown[]) =>
          database.prepare(sql).all(...(args as Array<string | number | null>)),
        withTransactionAsync: async (fn: () => Promise<void>) => {
          database.exec('BEGIN IMMEDIATE');
          try {
            await fn();
            database.exec('COMMIT');
          } catch (error) {
            database.exec('ROLLBACK');
            throw error;
          }
        },
        withExclusiveTransactionAsync: async (fn: (txn: {
          getFirstAsync: <Row>(sql: string, ...args: unknown[]) => Promise<Row | null>;
          getAllAsync: <Row>(sql: string, ...args: unknown[]) => Promise<Row[]>;
          runAsync: (sql: string, ...args: unknown[]) => Promise<void>;
        }) => Promise<void>) => {
          state.exclusiveSnapshotReads += 1;
          if (state.failExclusiveReview) {
            throw new Error('Synthetic exclusive SQLite snapshot unavailable.');
          }
          database.exec('BEGIN IMMEDIATE');
          try {
            state.signalExclusiveStarted?.();
            if (state.holdExclusiveReview) await state.holdExclusiveReview;
            await fn({
              getFirstAsync: async <Row>(query: string, ...args: unknown[]) =>
                database.prepare(query).get(...(args as Array<string | number | null>)) as Row | null,
              getAllAsync: async <Row>(query: string, ...args: unknown[]) =>
                database.prepare(query).all(...(args as Array<string | number | null>)) as Row[],
              runAsync: async (query: string, ...args: unknown[]) => {
                if (state.failNextContaining && query.includes(state.failNextContaining)) {
                  state.failNextContaining = null;
                  throw new Error('synthetic SQLite write interruption');
                }
                database.prepare(query).run(...(args as Array<string | number | null>));
              },
            });
            database.exec('COMMIT');
          } catch (error) {
            database.exec('ROLLBACK');
            throw error;
          }
        },
      };
    },
  };
});

type MobileDb = typeof import('../../../apps/mobile/src/services/database');
let service: MobileDb;
let scratch = '';
const startedAt = '2026-10-20T10:00:00.000Z';
const completedAt = '2026-10-20T11:00:00.000Z';
const stableId = 'synth-strength-1_' + startedAt;
const workout = {
  id: 'synth-strength-1',
  name: 'Synthetic bodyweight recovery session',
  source: 'manual',
  estimatedElapsedSeconds: 3600,
  stations: [],
} as unknown as Parameters<MobileDb['saveCompletedWorkout']>[0]['workout'];
const weeklyBlock = () => {
  const goal = { id: 'synthetic-goal' };
  return {
    id: 'synthetic-block', goal, createdAt: startedAt,
    weeks: [{
      id: 'synthetic-week', goal, weekStartDate: '2026-10-19',
      createdAt: startedAt,
      sessions: [{
        id: 'synthetic-planned-session', date: '2026-10-20',
        completionStatus: 'planned', workout,
      }],
    }],
  } as unknown as Parameters<MobileDb['saveTrainingBlock']>[0];
};
const save = (fraction = 0.6) => service.saveCompletedWorkout({
  workout, startedAt, completedAt, completionFraction: fraction,
  stationRounds: {},
  plannedSessionId: 'synthetic-planned-session',
  relationToPlan: 'completed_planned', idempotencyKey: stableId,
});
const sessionStatus = async () => {
  const block = await service.getLatestTrainingBlock();
  return block?.block.weeks[0]?.sessions[0]?.completionStatus;
};
const ledger = async () => service.listWorkoutLedgerEntries({ limit: 10 });

beforeEach(async () => {
  vi.resetModules();
  scratch = mkdtempSync(join(tmpdir(), 'side-quest-real-mobile-sql-'));
  state.directory = scratch;
  state.handles = [];
  state.failNextContaining = null;
  state.exclusiveSnapshotReads = 0;
  state.failExclusiveReview = false;
  state.holdExclusiveReview = null;
  state.signalExclusiveStarted = null;
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); },
      clear: () => stored.clear(),
      key: (index: number) => [...stored.keys()][index] ?? null,
      get length() { return stored.size; },
    },
  });
  service = await import('../../../apps/mobile/src/services/database');
  await service.activateUserDatabase('synthetic-athlete-one');
});

afterEach(() => {
  state.failNextContaining = null;
  for (const handle of state.handles.splice(0)) {
    try { handle.close(); } catch { /* already closed */ }
  }
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe('unapproved strength draft end-to-end through mobile SQLite service', () => {
  it('reads one real saved draft and audit without writing an accepted workout', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { appendStrengthRevisionPreview } = await import(
      '../src/strength-revision-preview-sqlite'
    );
    const { strengthSessionSignature } = await import(
      '../src/daily-strength-decision-sqlite'
    );
    const { summarizeUnapprovedStrengthRevision } = await import(
      '../src/strength-revision-review-summary'
    );
    const originalWorkout = {
      id: 'qa-strength-workout', name: 'QA bounded strength', createdAt: startedAt,
      randomSeed: 'qa-seed', request: {},
      stations: [{
        id: 'station-qa', order: 0, durationSeconds: 1800,
        format: 'amrap', purpose: 'synthetic controlled movement',
        exercises: [{
          exerciseId: 'qa-calf-raise',
          exerciseSnapshot: { id: 'qa-calf-raise', name: 'Synthetic calf raise' },
          equipmentOptionId: 'bodyweight', prescriptionId: 'qa-rx',
          target: 10, unit: 'total', order: 0,
        }],
      }],
      totalWorkSeconds: 1800, totalRestSeconds: 600,
      estimatedElapsedSeconds: 2400,
      requiredEquipment: [], targetRegions: [], recentLoadAdjustments: [],
      source: 'generated',
    };
    const source = {
      id: 'qa-strength-session', date: '2026-11-17', order: 0,
      title: 'Synthetic strength plan', purpose: 'maintenance',
      intendedLoad: 'light', focusTargets: [],
      workout: originalWorkout, rationale: 'synthetic QA', completionStatus: 'planned',
    };
    const goal = { id: 'qa-goal' };
    const newBlock = {
      id: 'qa-review-block', goal, createdAt: startedAt,
      weeks: [{
        id: 'qa-review-week', goal,
        weekStartDate: '2026-11-16', createdAt: startedAt,
        sessions: [source],
      }],
    };
    await service.saveTrainingBlock(newBlock as unknown as
      Parameters<MobileDb['saveTrainingBlock']>[0]);

    const database = new DatabaseSync(join(state.directory, service.getActiveDatabaseName()));
    try {
      const time = '2026-11-15T10:00:00Z';
      database.prepare(`INSERT INTO training_check_ins
        (id, check_in_json, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`).run(
        'qa-normal', JSON.stringify({
          status: 'normal', active: true,
          activeUntil: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        }), 1, time, time,
      );
      database.prepare(`INSERT INTO readiness_check_ins
        (date, check_in_json, created_at, updated_at)
        VALUES (?, ?, ?, ?)`).run(
        '2026-11-15',
        JSON.stringify({
          sleep: 4, energy: 4, muscleFreshness: 4, stress: 2, motivation: 4,
        }), time, time,
      );
      database.prepare(`INSERT INTO pt_profiles
        (id, profile_json, created_at, updated_at)
        VALUES (?, ?, ?, ?)`).run(
        'qa-pt', '{"active":false}', time, time,
      );
      const driver = {
        getFirst: async <T>(sql: string, args: Array<string | number | null>) =>
          database.prepare(sql).get(...args) as T | null,
        getAll: async <T>(sql: string, args: Array<string | number | null>) =>
          database.prepare(sql).all(...args) as T[],
        run: async (sql: string, args: Array<string | number | null>) => {
          database.prepare(sql).run(...args);
        },
        transaction: async (fn: () => Promise<void>) => {
          database.exec('BEGIN IMMEDIATE');
          try { await fn(); database.exec('COMMIT'); }
          catch (error) { database.exec('ROLLBACK'); throw error; }
        },
      };
      const candidate = {
        ...originalWorkout, estimatedElapsedSeconds: 1920,
        totalWorkSeconds: 1500, totalRestSeconds: 420,
        stations: [{
          ...originalWorkout.stations[0]!, durationSeconds: 1500,
          exercises: [{ ...originalWorkout.stations[0]!.exercises[0]!, target: 8 }],
        }],
      };
      const decision = {
        id: 'qa-pending-decision', athleteId: 'synthetic-athlete-one',
        blockId: 'qa-review-block', sessionId: 'qa-strength-session',
        sourceSignature: strengthSessionSignature(source as unknown as
          Parameters<typeof strengthSessionSignature>[0]),
        action: 'reduce' as const, decision: 'accepted' as const,
        proposedMinutes: 32, createdAt: time,
      };
      await appendStrengthRevisionPreview(driver, {
        id: 'qa-preview', createdAt: time,
        source: source as unknown as Parameters<typeof appendStrengthRevisionPreview>[1]['source'],
        candidate: candidate as unknown as Parameters<typeof appendStrengthRevisionPreview>[1]['candidate'],
        decision,
        evidence: {
          athleteId: 'synthetic-athlete-one', todayLocalDate: '2026-11-15',
          symptoms: 'clear', readiness: 'reviewed_adequate',
          providerRestrictions: 'verified_none', sourceCoverage: 'complete',
          exerciseRestrictionsReviewed: true,
        },
      });
    } finally {
      database.close();
    }
    const preview = await service.getUnapprovedStrengthRevisionPreview(
      'synthetic-athlete-one', 'qa-preview',
    );
    expect(preview).not.toBeNull();
    expect(preview?.executableWorkoutApproved).toBe(false);
    const summary = summarizeUnapprovedStrengthRevision(preview!);
    expect(summary.secondsReduced).toBe(480);
    expect(summary.changes.map(item => item.kind)).toEqual([
      'station_duration', 'exercise_target',
    ]);
    const reviewState = await service.getUnapprovedStrengthRevisionReviewState(
      'synthetic-athlete-one', 'qa-preview',
    );
    expect(reviewState).toMatchObject({
      status: 'pending_review', executableWorkoutApproved: false,
    });
    const inbox = await service.listUnapprovedStrengthReviewItems(
      'synthetic-athlete-one', {
        athleteId: 'synthetic-athlete-one',
        todayLocalDate: '2026-11-16', symptoms: 'unknown',
        readiness: 'unknown', providerRestrictions: 'unknown',
        sourceCoverage: 'unknown', exerciseRestrictionsReviewed: false,
      },
    );
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      previewId: 'qa-preview', status: 'stale',
      executableWorkoutApproved: false,
    });
    const detail = await service.getUnapprovedStrengthReviewDetail(
      'synthetic-athlete-one', 'qa-preview', {
        athleteId: 'synthetic-athlete-one',
        todayLocalDate: '2026-11-16', symptoms: 'unknown',
        readiness: 'unknown', providerRestrictions: 'unknown',
        sourceCoverage: 'unknown', exerciseRestrictionsReviewed: false,
      },
    );
    expect(detail.status).toBe('stale');
    expect(detail.summary.secondsReduced).toBe(480);
    expect(detail.review.status).toBe('pending_review');
    expect(detail.executableWorkoutApproved).toBe(false);
    expect(detail.preflight.executableWorkoutApproved).toBe(false);
    expect(detail.preflight.canConfirmExecutableWorkout).toBe(false);
    const dryRunInput = {
      athleteId: 'synthetic-athlete-one', previewId: 'qa-preview',
      evidence: {
        athleteId: 'synthetic-athlete-one',
        todayLocalDate: '2026-11-16', symptoms: 'unknown' as const,
        readiness: 'unknown' as const, providerRestrictions: 'unknown' as const,
        sourceCoverage: 'unknown' as const, exerciseRestrictionsReviewed: false,
      },
      expectedObservationToken: detail.observationToken,
    };
    const dry = await service.recheckUnapprovedStrengthAuthorization(dryRunInput);
    expect(dry.kind).toBe('non_executable_authorization_dry_run');
    expect(dry.changedSinceViewed).toBe(false);
    expect(dry.current.preflight.canConfirmExecutableWorkout).toBe(false);
    expect(dry.workoutPersisted).toBe(false);
    expect(dry.athleteExecutionConsentCollected).toBe(false);
    expect(dry.blockingGateIds).toContain('executable_write_authorization');
    await expect(service.recheckUnapprovedStrengthAuthorization({
      ...dryRunInput, athleteId: 'synthetic-athlete-two',
    })).rejects.toThrow(/Athlete profile changed|Invalid unapproved strength authorization dry-run request/);
    expect(detail.preflight.gates).toHaveLength(13);
    expect(detail.preflight.gates.find(g => g.id === 'movement_compatibility')?.status)
      .toBe('unverified');
    expect(detail.movementRestrictions.canApplyWorkout).toBe(false);
    expect(detail.movementRestrictions.matchingIsClinicalClearance).toBe(false);
    expect(detail.movementRestrictions.findings).toHaveLength(1);
    expect(detail.movementRestrictions.findings[0]?.status)
      .toBe('needs_individual_review');
    expect(detail.reconciliation.canConfirmExecutableWorkout).toBe(false);
    expect(detail.reconciliation.executableWorkoutApproved).toBe(false);
    expect(detail.reconciliation.tasks).toHaveLength(
      detail.preflight.blockingGateCount,
    );
    expect(detail.preflight.gates.find(
      gate => gate.id === 'external_provider_restrictions',
    )?.status).toBe('unverified');
    expect(detail.preflight.gates.find(
      gate => gate.id === 'executable_write_authorization',
    )?.status).toBe('not_implemented');
    expect(detail.provenance.events).toEqual([]);
    await service.flagUnverifiedStrengthReviewConcern({
      athleteId: 'synthetic-athlete-one', previewId: 'qa-preview',
      kind: 'provider_restriction', expectedLastEventId: null,
    });
    const withRestriction = await service.getUnapprovedStrengthReviewDetail(
      'synthetic-athlete-one', 'qa-preview', {
        athleteId: 'synthetic-athlete-one',
        todayLocalDate: '2026-11-16', symptoms: 'unknown',
        readiness: 'unknown', providerRestrictions: 'unknown',
        sourceCoverage: 'unknown', exerciseRestrictionsReviewed: false,
      },
    );
    expect(withRestriction.provenance.restriction.status).toBe('reported_restriction');
    expect(withRestriction.preflight.gates.find(
      gate => gate.id === 'external_provider_restrictions',
    )?.status).toBe('blocked');
    expect(withRestriction.preflight.canConfirmExecutableWorkout).toBe(false);
    await expect(service.flagUnverifiedStrengthReviewConcern({
      athleteId: 'synthetic-athlete-one', previewId: 'qa-preview',
      kind: 'provider_restriction', expectedLastEventId: null,
    })).rejects.toThrow(/history changed/);
    await service.flagUnverifiedStrengthReviewConcern({
      athleteId: 'synthetic-athlete-one', previewId: 'qa-preview',
      kind: 'training_coverage', expectedLastEventId: null,
    });
    const withBoth = await service.getUnapprovedStrengthReviewDetail(
      'synthetic-athlete-one', 'qa-preview', {
        athleteId: 'synthetic-athlete-one',
        todayLocalDate: '2026-11-16', symptoms: 'unknown',
        readiness: 'unknown', providerRestrictions: 'unknown',
        sourceCoverage: 'unknown', exerciseRestrictionsReviewed: false,
      },
    );
    expect(withBoth.provenance.coverage.status).toBe('partial');
    expect(withBoth.preflight.gates.find(
      gate => gate.id === 'source_provenance',
    )?.status).toBe('blocked');
    expect(withBoth.preflight.executableWorkoutApproved).toBe(false);
    const recheckedAfterNewReport = await service.recheckUnapprovedStrengthAuthorization(
      dryRunInput,
    );
    expect(recheckedAfterNewReport.changedSinceViewed).toBe(true);
    expect(recheckedAfterNewReport.current.stale).toBe(true);
    expect(recheckedAfterNewReport.executableWorkoutApproved).toBe(false);
    expect(withBoth.reconciliation.tasks[0]?.kind).toBe('safety_hold');
    expect(withBoth.reconciliation.tasks.find(task =>
      task.id === 'external_provider_restrictions')?.nextStep)
      .toMatch(/possible active restriction|current clinician guidance/);
    expect(withBoth.reconciliation.tasks.find(task =>
      task.id === 'source_provenance')?.nextStep).toMatch(/missing workouts/);
    expect(withBoth.reconciliation.tasks.every(task =>
      task.canResolveAutomatically === false,
    )).toBe(true);
    expect((await service.exportLocalData()).strength_evidence_provenance_events)
      .toHaveLength(2);
    expect(state.exclusiveSnapshotReads).toBeGreaterThanOrEqual(2);
    state.failExclusiveReview = true;
    await expect(service.getUnapprovedStrengthReviewDetail(
      'synthetic-athlete-one', 'qa-preview', {
        athleteId: 'synthetic-athlete-one',
        todayLocalDate: '2026-11-16', symptoms: 'unknown',
        readiness: 'unknown', providerRestrictions: 'unknown',
        sourceCoverage: 'unknown', exerciseRestrictionsReviewed: false,
      },
    )).rejects.toThrow(/exclusive SQLite snapshot unavailable/);
    state.failExclusiveReview = false;
    await expect(service.getUnapprovedStrengthReviewDetail(
      'different-athlete', 'qa-preview', {
        athleteId: 'different-athlete',
        todayLocalDate: '2026-11-16', symptoms: 'unknown',
        readiness: 'unknown', providerRestrictions: 'unknown',
        sourceCoverage: 'unknown', exerciseRestrictionsReviewed: false,
      },
    )).rejects.toThrow();
    // Athlete-organizational actions are journaled but NEVER exercise approval.
    const dismissed = await service.setUnapprovedStrengthReviewDisposition({
      athleteId: 'synthetic-athlete-one', previewId: 'qa-preview',
      action: 'dismiss', expectedLastEventId: null,
    });
    expect(dismissed).toMatchObject({
      status: 'dismissed', executableWorkoutApproved: false,
    });
    expect(dismissed.events).toHaveLength(1);
    const afterDismissal = await service.getUnapprovedStrengthReviewDetail(
      'synthetic-athlete-one', 'qa-preview', {
        athleteId: 'synthetic-athlete-one',
        todayLocalDate: '2026-11-16', symptoms: 'unknown',
        readiness: 'unknown', providerRestrictions: 'unknown',
        sourceCoverage: 'unknown', exerciseRestrictionsReviewed: false,
      },
    );
    expect(afterDismissal.stale).toBe(true);
    expect(afterDismissal.review.status).toBe('dismissed');
    expect(afterDismissal.preflight.gates.find(
      gate => gate.id === 'review_disposition',
    )?.status).toBe('blocked');
    await expect(service.setUnapprovedStrengthReviewDisposition({
      athleteId: 'synthetic-athlete-one', previewId: 'qa-preview',
      action: 'restore', expectedLastEventId: null,
    })).rejects.toThrow(/history changed/);
    const returned = await service.setUnapprovedStrengthReviewDisposition({
      athleteId: 'synthetic-athlete-one', previewId: 'qa-preview',
      action: 'restore', expectedLastEventId: dismissed.latestEventId,
    });
    expect(returned.status).toBe('pending_review');
    expect(returned.executableWorkoutApproved).toBe(false);
    expect(returned.events.map(item => item.action)).toEqual(['dismiss', 'restore']);
    const afterReopen = await service.getUnapprovedStrengthReviewDetail(
      'synthetic-athlete-one', 'qa-preview', {
        athleteId: 'synthetic-athlete-one',
        todayLocalDate: '2026-11-16', symptoms: 'unknown',
        readiness: 'unknown', providerRestrictions: 'unknown',
        sourceCoverage: 'unknown', exerciseRestrictionsReviewed: false,
      },
    );
    expect(afterReopen.stale).toBe(true);
    expect(afterReopen.review.status).toBe('pending_review');
    expect(afterReopen.preflight.executableWorkoutApproved).toBe(false);
    expect(afterReopen.preflight.canConfirmExecutableWorkout).toBe(false);
    state.failNextContaining = 'INSERT INTO strength_revision_preview_review_events';
    await expect(service.setUnapprovedStrengthReviewDisposition({
      athleteId: 'synthetic-athlete-one', previewId: 'qa-preview',
      action: 'dismiss', expectedLastEventId: returned.latestEventId,
    })).rejects.toThrow(/synthetic SQLite write interruption/);
    const unchanged = await service.getUnapprovedStrengthRevisionReviewState(
      'synthetic-athlete-one', 'qa-preview',
    );
    expect(unchanged.status).toBe('pending_review');
    expect(unchanged.events).toHaveLength(2);
    const exported = await service.exportLocalData();
    expect(exported.strength_revision_preview_review_events).toHaveLength(2);
    expect(exported.strength_revision_previews).toHaveLength(1);
    expect(exported.strength_evidence_provenance_events).toHaveLength(2);
    expect(exported.daily_strength_choice_events).toEqual([]);
    expect(exported.workout_ledger).toEqual([]);
    const savedBlock = await service.getLatestTrainingBlock();
    expect(savedBlock?.block.weeks[0]?.sessions[0]?.workout)
      .toEqual(originalWorkout);

    // A simulated cold restart must preserve the complete disposition trail.
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    const recovered = await service.getUnapprovedStrengthRevisionReviewState(
      'synthetic-athlete-one', 'qa-preview',
    );
    expect(recovered.status).toBe('pending_review');
    expect(recovered.events.map(item => item.action)).toEqual(['dismiss', 'restore']);
    expect(recovered.executableWorkoutApproved).toBe(false);
    const savedAfterRestart = await service.exportLocalData();
    expect(savedAfterRestart.strength_evidence_provenance_events).toHaveLength(2);
    const reviewedAfterRestart = await service.getUnapprovedStrengthReviewDetail(
      'synthetic-athlete-one', 'qa-preview', {
        athleteId: 'synthetic-athlete-one',
        todayLocalDate: '2026-11-16', symptoms: 'unknown',
        readiness: 'unknown', providerRestrictions: 'unknown',
        sourceCoverage: 'unknown', exerciseRestrictionsReviewed: false,
      },
    );
    expect(reviewedAfterRestart.provenance.restriction.status)
      .toBe('reported_restriction');
    expect(reviewedAfterRestart.provenance.coverage.status).toBe('partial');
    expect(reviewedAfterRestart.preflight.executableWorkoutApproved).toBe(false);
    expect(savedAfterRestart.workout_ledger).toEqual([]);
    expect((await service.getLatestTrainingBlock())?.block.weeks[0]?.sessions[0]?.workout)
      .toEqual(originalWorkout);
  });
});

describe('actual mobile athlete-confirmed routine workout authorization', () => {
  it('saves one exact version through native-style exclusive SQL, exports and restores it without starting', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { appendStrengthRevisionPreview } = await import('../src/strength-revision-preview-sqlite');
    const { strengthSessionSignature } = await import('../src/daily-strength-decision-sqlite');
    const { localCalendarDate } = await import('../src/first-week-dates');
    const today = localCalendarDate(new Date());
    const sourceWorkout = {
      id: 'routine-workout', name: 'QA routine revision', createdAt: startedAt,
      randomSeed: 'routine-seed', request: {},
      stations: [{
        id: 'routine-station', order: 0, durationSeconds: 1800,
        format: 'amrap', purpose: 'routine exercise',
        exercises: [{
          exerciseId: 'routine-squat',
          exerciseSnapshot: {
            id: 'routine-squat', name: 'Routine bodyweight squat',
            movementPatterns: ['squat'], avoidanceTags: [], impactLevel: 0,
            jointLoads: [{ region: 'hip', load: 1 }],
            bodyRegions: [{ region: 'quadriceps', load: 1, role: 'primary' }],
          },
          equipmentOptionId: 'bodyweight', prescriptionId: 'routine-rx',
          target: 10, unit: 'total', order: 0,
        }],
      }],
      totalWorkSeconds: 1800, totalRestSeconds: 600,
      estimatedElapsedSeconds: 2400, requiredEquipment: [],
      targetRegions: [], recentLoadAdjustments: [], source: 'generated',
    };
    const session = {
      id: 'routine-session', date: today,
      order: 0, title: 'Routine session', purpose: 'maintenance',
      intendedLoad: 'light', focusTargets: [], workout: sourceWorkout,
      rationale: 'routine QA', completionStatus: 'planned',
    };
    const newBlock = {
      id: 'routine-block', goal: { id: 'routine-goal' },
      createdAt: startedAt,
      weeks: [{ id: 'routine-week', goal: { id: 'routine-goal' },
        weekStartDate: today, createdAt: startedAt, sessions: [session] }],
    };
    await service.saveTrainingBlock(newBlock as unknown as
      Parameters<MobileDb['saveTrainingBlock']>[0]);
    await service.recordAthleteTrainingSafetyContext({
      athleteId: 'synthetic-athlete-one', intent: 'general_training',
      expectedLastEventId: null,
    });
    const database = new DatabaseSync(
      join(state.directory, service.getActiveDatabaseName()),
    );
    try {
      const time = new Date().toISOString();
      database.prepare(`INSERT INTO training_check_ins
        (id, check_in_json, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`).run(
        'routine-checkin',
        JSON.stringify({ status: 'normal', active: true,
          activeUntil: new Date(Date.now() + 86400_000).toISOString() }),
        1, time, time,
      );
      database.prepare(`INSERT INTO readiness_check_ins
        (date, check_in_json, created_at, updated_at)
        VALUES (?, ?, ?, ?)`).run(today,
        JSON.stringify({
          sleep: 4, energy: 4, muscleFreshness: 4, stress: 2, motivation: 4,
        }), time, time,
      );
      database.prepare(`INSERT INTO pt_profiles
        (id, profile_json, created_at, updated_at)
        VALUES (?, ?, ?, ?)`).run('routine-pt', '{"active":false}', time, time);
      const driver = {
        getFirst: async <T>(query: string, args: Array<string | number | null>) =>
          database.prepare(query).get(...args) as T | null,
        getAll: async <T>(query: string, args: Array<string | number | null>) =>
          database.prepare(query).all(...args) as T[],
        run: async (query: string, args: Array<string | number | null>) => {
          database.prepare(query).run(...args);
        },
        transaction: async (fn: () => Promise<void>) => {
          database.exec('BEGIN IMMEDIATE');
          try { await fn(); database.exec('COMMIT'); }
          catch (error) { database.exec('ROLLBACK'); throw error; }
        },
      };
      const candidate = {
        ...sourceWorkout, estimatedElapsedSeconds: 1920,
        totalWorkSeconds: 1500, totalRestSeconds: 420,
        stations: [{
          ...sourceWorkout.stations[0]!, durationSeconds: 1500,
          exercises: [{ ...sourceWorkout.stations[0]!.exercises[0]!, target: 8 }],
        }],
      };
      await appendStrengthRevisionPreview(driver, {
        id: 'routine-preview', createdAt: time,
        source: session as unknown as Parameters<typeof appendStrengthRevisionPreview>[1]['source'],
        candidate: candidate as unknown as Parameters<typeof appendStrengthRevisionPreview>[1]['candidate'],
        decision: {
          id: 'routine-proposal', athleteId: 'synthetic-athlete-one',
          blockId: 'routine-block', sessionId: 'routine-session',
          sourceSignature: strengthSessionSignature(session as unknown as
            Parameters<typeof strengthSessionSignature>[0]),
          action: 'reduce', decision: 'accepted',
          proposedMinutes: 32, createdAt: time,
        },
        evidence: {
          athleteId: 'synthetic-athlete-one', todayLocalDate: today,
          symptoms: 'clear', readiness: 'reviewed_adequate',
          providerRestrictions: 'verified_none', sourceCoverage: 'complete',
          exerciseRestrictionsReviewed: true,
        },
      });
    } finally {
      database.close();
    }
    const detail = await service.getCurrentStrengthReviewForConfirmation(
      'synthetic-athlete-one', 'routine-preview',
    );
    expect(detail.status).toBe('pending_review');
    expect(detail.trainingPolicy.track).toBe('routine_training_review');
    const confirmations = {
      exactExercisesAndDoseReviewed: true as const,
      recentTrainingHistoryReviewed: true as const,
      noKnownUnreportedRestrictions: true as const,
    };
    const input = {
      athleteId: 'synthetic-athlete-one', previewId: 'routine-preview',
      authorizationId: 'routine-mobile-auth',
      expectedObservationToken: detail.observationToken, confirmations,
    };
    state.failNextContaining = 'INSERT INTO strength_workout_authorizations';
    await expect(service.confirmRoutineStrengthWorkout(input))
      .rejects.toThrow(/synthetic SQLite write interruption/);
    expect((await service.exportLocalData()).strength_workout_authorizations)
      .toHaveLength(0);
    const saved = await service.confirmRoutineStrengthWorkout(input);
    expect(saved.status).toBe('authorized_routine_workout');
    expect(saved.workoutStarted).toBe(false);
    expect(saved.authorization.executableWorkoutApproved).toBe(true);
    expect(saved.authorization.requiresFreshStartRevalidation).toBe(true);
    await expect(service.confirmRoutineStrengthWorkout(input))
      .rejects.toThrow(/already been authorized/);
    expect((await service.exportLocalData()).strength_workout_authorizations)
      .toHaveLength(1);
    expect((await service.exportLocalData()).workout_ledger).toEqual([]);
    expect((await service.getLatestTrainingBlock())?.block.weeks[0]
      ?.sessions[0]?.workout).toEqual(sourceWorkout);
    const preStart = await service.getRoutineStrengthPreStartScreen({
      athleteId: 'synthetic-athlete-one',
      sessionId: 'routine-session',
      expectedAuthorizationId: 'routine-mobile-auth',
    });
    expect(preStart.status).toBe('eligible_for_atomic_start_gate');
    expect(preStart.blockers).toEqual([]);
    expect(preStart.workoutStarted).toBe(false);
    expect(preStart.playerStartAuthorized).toBe(false);
    const checkpointRequest = {
      athleteId: 'synthetic-athlete-one',
      sessionId: 'routine-session',
      expectedAuthorizationId: 'routine-mobile-auth',
      intentId: 'routine-mobile-start-intent',
      checkpointId: 'routine-mobile-checkpoint',
      expectedObservationToken: preStart.observationToken!,
      athleteExplicitlyRequestedStart: true as const,
    };
    state.failNextContaining = 'INSERT INTO strength_workout_native_start_checkpoints';
    await expect(service.prepareRoutineNativeWorkoutCheckpoint(checkpointRequest))
      .rejects.toThrow(/synthetic SQLite write interruption/);
    expect((await service.exportLocalData()).strength_workout_start_intents).toHaveLength(0);
    expect((await service.exportLocalData()).strength_workout_native_start_checkpoints)
      .toHaveLength(0);
    const nativeCheckpoint = await service.commitAndHydrateRoutineNativeWorkout(
      checkpointRequest,
    );
    expect(nativeCheckpoint.playerPlaybackStarted).toBe(false);
    expect(nativeCheckpoint.requiresPlayerHydration).toBe(true);
    expect(nativeCheckpoint.initialLiveSession.running).toBe(false);
    expect(nativeCheckpoint.initialLiveSession.workout.stations[0]!.durationSeconds)
      .toBe(1500);
    expect(nativeCheckpoint.initialLiveSession.planLink?.sessionId).toBe('routine-session');
    expect(nativeCheckpoint.initialLiveSession.planLink?.modifiedFromPlan).toBe(true);
    const persistedPlayer = await import('../../../apps/mobile/src/services/active-workout-persistence');
    expect(await persistedPlayer.loadLiveWorkoutSession('synthetic-athlete-one'))
      .toEqual(nativeCheckpoint.initialLiveSession);
    expect((await persistedPlayer.loadLiveWorkoutSession('synthetic-athlete-one'))?.running)
      .toBe(false);
    expect((await service.getRoutineNativeRecoveryState(
      'synthetic-athlete-one', 'routine-session',
    )).kind).toBe('already_saved');
    expect(await service.recheckRoutineNativeActiveWorkout({
      athleteId: 'synthetic-athlete-one', sessionId: 'routine-session',
      startedAt: nativeCheckpoint.initialLiveSession.startedAt,
      workout: nativeCheckpoint.initialLiveSession.workout,
    })).toMatchObject({ kind: 'clear', blockers: [] });
    const intent = await service.getRecordedRoutineStrengthStartIntent(
      'synthetic-athlete-one', 'routine-session',
    );
    expect(intent?.id).toBe('routine-mobile-start-intent');
    expect(intent?.workoutStarted).toBe(false);
    expect(intent?.playerStartAuthorized).toBe(false);
    expect((await service.exportLocalData()).strength_workout_start_intents).toHaveLength(1);
    expect((await service.exportLocalData()).strength_workout_native_start_checkpoints)
      .toHaveLength(1);
    expect((await service.exportLocalData()).workout_ledger).toEqual([]);
    await expect(service.prepareRoutineNativeWorkoutCheckpoint({
      ...checkpointRequest, checkpointId: 'duplicate-native-checkpoint',
    })).rejects.toThrow(/already exists/);
    await expect(service.commitAndHydrateRoutineNativeWorkout({
      ...checkpointRequest, checkpointId: 'different-double-tap',
    })).rejects.toThrow(/already saved/);
    await expect(service.requestRoutineStrengthPreStartIntent({
      athleteId: 'synthetic-athlete-one',
      sessionId: 'routine-session',
      expectedAuthorizationId: 'routine-mobile-auth',
      intentId: 'routine-mobile-start-again',
      expectedObservationToken: preStart.observationToken!,
      athleteExplicitlyRequestedStart: true,
    })).rejects.toThrow(/already exists/);
    const withdrawalInput = {
      athleteId: 'synthetic-athlete-one',
      sessionId: 'routine-session',
      expectedAuthorizationId: 'routine-mobile-auth',
      withdrawalId: 'routine-mobile-withdrawal',
      athleteConfirmedWithdrawal: true as const,
    };
    state.failNextContaining = 'INSERT INTO strength_workout_authorization_withdrawals';
    await expect(service.withdrawRecordedRoutineStrengthWorkout(withdrawalInput))
      .rejects.toThrow(/synthetic SQLite write interruption/);
    expect((await service.exportLocalData()).strength_workout_authorization_withdrawals)
      .toHaveLength(0);
    const withdrawn = await service.withdrawRecordedRoutineStrengthWorkout(withdrawalInput);
    expect(withdrawn.authorizationId).toBe('routine-mobile-auth');
    expect((await service.exportLocalData()).strength_workout_authorization_withdrawals)
      .toHaveLength(1);
    expect((await service.getRoutineStrengthPreStartScreen({
      athleteId: 'synthetic-athlete-one',
      sessionId: 'routine-session',
      expectedAuthorizationId: 'routine-mobile-auth',
    })).blockers).toContain('The athlete withdrew this workout authorization.');
    expect((await service.recheckRoutineNativeActiveWorkout({
      athleteId: 'synthetic-athlete-one', sessionId: 'routine-session',
      startedAt: nativeCheckpoint.initialLiveSession.startedAt,
      workout: nativeCheckpoint.initialLiveSession.workout,
    })).kind).toBe('hold');
    expect((await service.getRoutineNativeRecoveryState(
      'synthetic-athlete-one', 'routine-session',
    )).kind).toBe('held');
    const closed = await service.finalizeAndClearNativeWorkout({
      athleteId: 'synthetic-athlete-one', sessionId: 'routine-session',
      startedAt: nativeCheckpoint.initialLiveSession.startedAt,
      disposition: 'discarded',
    });
    expect(closed?.disposition).toBe('discarded');
    expect((await service.getRoutineNativeRecoveryState(
      'synthetic-athlete-one', 'routine-session',
    )).kind).toBe('terminal');
    expect((await service.exportLocalData()).strength_workout_native_start_terminal_events)
      .toHaveLength(1);
    expect(await persistedPlayer.loadLiveWorkoutSession('synthetic-athlete-one'))
      .toBeNull();
    await expect(persistedPlayer.saveLiveWorkoutSession(
      nativeCheckpoint.initialLiveSession, 'synthetic-athlete-one',
    )).rejects.toThrow(/cannot be resurrected/);
    await expect(service.withdrawRecordedRoutineStrengthWorkout(withdrawalInput))
      .rejects.toThrow(/already withdrawn/);
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    const recovered = await service.getRecordedAuthorizationForStrengthPreview(
      'synthetic-athlete-one', 'routine-preview',
    );
    expect(recovered).toEqual(saved.authorization);
    expect(recovered?.automaticallyStarted).toBe(false);
    expect(await service.getRoutineStrengthWithdrawal(
      'synthetic-athlete-one', 'routine-session',
    )).toEqual(withdrawn);
    expect(await service.getRecordedRoutineStrengthStartIntent(
      'synthetic-athlete-one', 'routine-session',
    )).toEqual(intent);
    expect(await service.getRecordedRoutineNativeWorkoutCheckpoint(
      'synthetic-athlete-one', 'routine-session',
    )).toEqual(nativeCheckpoint);
    const coldPlayer = await import('../../../apps/mobile/src/services/active-workout-persistence');
    expect(await coldPlayer.loadLiveWorkoutSession('synthetic-athlete-one'))
      .toBeNull();
    expect((await service.getRoutineNativeRecoveryState(
      'synthetic-athlete-one', 'routine-session',
    )).kind).toBe('terminal');
    expect((await service.exportLocalData()).strength_workout_native_start_terminal_events)
      .toHaveLength(1);
    expect((await service.exportLocalData()).strength_workout_authorization_withdrawals)
      .toHaveLength(1);
    await service.recordAthleteTrainingSafetyContext({
      athleteId: 'synthetic-athlete-one',
      protectedMovement: 'deep_hip_flexion',
      expectedLastEventId: (await service.getAthleteTrainingSafetyPolicy(
        'synthetic-athlete-one',
      )).context.latestEventId,
    });
    const afterRisk = await service.getCurrentStrengthReviewForConfirmation(
      'synthetic-athlete-one', 'routine-preview',
    );
    expect(afterRisk.stale).toBe(true);
    expect(afterRisk.trainingPolicy.track).toBe('restriction_aware_review');
    expect((await service.exportLocalData()).workout_ledger).toEqual([]);
  });
});

describe('native athlete training safety context and sticky restrictions', () => {
  it('starts unknown, then accepts ordinary training without clinician paperwork or workout authorization', async () => {
    const unknown = await service.getAthleteTrainingSafetyPolicy('synthetic-athlete-one');
    expect(unknown.context.intent).toBe('unknown');
    expect(unknown.policy.track).toBe('training_context_needed');
    expect(unknown.policy.executableWorkoutApproved).toBe(false);
    const routine = await service.recordAthleteTrainingSafetyContext({
      athleteId: 'synthetic-athlete-one',
      intent: 'general_training',
      expectedLastEventId: null,
    });
    expect(routine.context.intent).toBe('general_training');
    expect(routine.policy.track).toBe('routine_training_review');
    expect(routine.policy.clinicianDocumentRequiredForRoutineTraining).toBe(false);
    expect(routine.policy.canApproveExerciseRevision).toBe(false);
    expect(routine.policy.restrictionMatchingImplemented).toBe(false);
    expect((await service.exportLocalData()).training_safety_context_events).toHaveLength(1);
    expect(await ledger()).toEqual([]);
  });

  it('never lets a routine-training change erase a protected movement', async () => {
    const initial = await service.recordAthleteTrainingSafetyContext({
      athleteId: 'synthetic-athlete-one', intent: 'injury_rehabilitation',
      expectedLastEventId: null,
    });
    const restricted = await service.recordAthleteTrainingSafetyContext({
      athleteId: 'synthetic-athlete-one',
      protectedMovement: 'loaded_spinal_rotation',
      expectedLastEventId: initial.context.latestEventId,
    });
    const returned = await service.recordAthleteTrainingSafetyContext({
      athleteId: 'synthetic-athlete-one', intent: 'general_training',
      expectedLastEventId: restricted.context.latestEventId,
    });
    expect(returned.context.intent).toBe('general_training');
    expect(returned.context.activeProtectedMovements).toContain('loaded_spinal_rotation');
    expect(returned.policy.track).toBe('restriction_aware_review');
    expect(returned.policy.requiresRestrictionAwareExerciseReview).toBe(true);
    expect(returned.policy.executableWorkoutApproved).toBe(false);
    await expect(service.recordAthleteTrainingSafetyContext({
      athleteId: 'synthetic-athlete-one', protectedMovement: 'impact_running',
      expectedLastEventId: initial.context.latestEventId,
    })).rejects.toThrow(/history changed/);
    expect((await service.exportLocalData()).training_safety_context_events).toHaveLength(3);
    expect(await ledger()).toEqual([]);
  });

  it('preserves safety context through a simulated cold restart and refuses wrong-athlete reads', async () => {
    await service.recordAthleteTrainingSafetyContext({
      athleteId: 'synthetic-athlete-one', protectedMovement: 'impact_running',
      expectedLastEventId: null,
    });
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    const recovered = await service.getAthleteTrainingSafetyPolicy('synthetic-athlete-one');
    expect(recovered.context.activeProtectedMovements).toEqual(['impact_running']);
    expect(recovered.policy.track).toBe('restriction_aware_review');
    expect((await service.exportLocalData()).training_safety_context_events).toHaveLength(1);
    await expect(service.getAthleteTrainingSafetyPolicy('different-athlete'))
      .rejects.toThrow(/Athlete profile changed/);
  });

  it('rolls back failed writes and critical history export/deletion without damaging workouts', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    state.failNextContaining = 'INSERT INTO training_safety_context_events';
    await expect(service.recordAthleteTrainingSafetyContext({
      athleteId: 'synthetic-athlete-one', intent: 'general_training',
      expectedLastEventId: null,
    })).rejects.toThrow(/synthetic SQLite write interruption/);
    expect((await service.getAthleteTrainingSafetyPolicy('synthetic-athlete-one')
    ).context.events).toHaveLength(0);
    const { DatabaseSync } = await import('node:sqlite');
    const isolated = new DatabaseSync(join(state.directory, service.getActiveDatabaseName()));
    isolated.exec('DROP TABLE training_safety_context_events');
    isolated.close();
    await expect(service.exportLocalData()).rejects.toThrow(
      /Cannot export critical audit history: training_safety_context_events/,
    );
    await expect(service.deleteAllLocalData()).rejects.toThrow(
      /Cannot safely delete critical audit history/,
    );
    expect(await service.getLatestTrainingBlock()).not.toBeNull();
  });
});

describe('actual mobile workout persistence with real disk SQLite', () => {
  it('fails closed for missing draft, wrong owner and unavailable native exclusive write', async () => {
    await expect(service.setUnapprovedStrengthReviewDisposition({
      athleteId: 'synthetic-athlete-one',
      previewId: 'unknown-draft',
      action: 'dismiss', expectedLastEventId: null,
    })).rejects.toThrow(/missing/);
    await expect(service.setUnapprovedStrengthReviewDisposition({
      athleteId: 'synthetic-athlete-two',
      previewId: 'unknown-draft',
      action: 'dismiss', expectedLastEventId: null,
    })).rejects.toThrow(/Athlete profile changed/);
    await expect(service.setUnapprovedStrengthReviewDisposition({
      athleteId: 'synthetic-athlete-one',
      previewId: '', action: 'dismiss', expectedLastEventId: null,
    })).rejects.toThrow(/Invalid athlete-owned/);
    const exportBefore = await service.exportLocalData();
    expect(exportBefore.strength_revision_preview_review_events).toEqual([]);
  });

  it('initializes unapproved revision storage and exposes no execution approval', async () => {
    const snapshot = await service.exportLocalData();
    expect(snapshot).toHaveProperty('strength_revision_previews', []);
    expect(snapshot).toHaveProperty('strength_revision_preview_review_events', []);
    expect(await service.listUnapprovedStrengthReviewItems(
      'synthetic-athlete-one', {
        athleteId: 'synthetic-athlete-one',
        todayLocalDate: '2026-11-16',
        symptoms: 'unknown', readiness: 'unknown',
        providerRestrictions: 'unknown',
        sourceCoverage: 'unknown', exerciseRestrictionsReviewed: false,
      },
    )).toEqual([]);

    expect(snapshot).toHaveProperty('daily_strength_choice_events', []);
    expect(snapshot).toHaveProperty('training_plan_adjustment_events', []);
    expect(snapshot).toHaveProperty('training_baseline_review_events', []);
    expect(await service.getUnapprovedStrengthRevisionPreview(
      'synthetic-athlete-one', 'missing-preview',
    )).toBeNull();
    expect(await service.listDailyStrengthChoiceDecisions(
      'synthetic-athlete-one', 'unknown-block', 'unknown-session',
    )).toEqual([]);
  });

  it('serializes athlete profile activation behind an in-flight exclusive review snapshot', async () => {
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    state.holdExclusiveReview = new Promise<void>(resolve => { release = resolve; });
    state.signalExclusiveStarted = started;
    const evidence = {
      athleteId: 'synthetic-athlete-one',
      todayLocalDate: '2026-11-16', symptoms: 'unknown' as const,
      readiness: 'unknown' as const, providerRestrictions: 'unknown' as const,
      sourceCoverage: 'unknown' as const, exerciseRestrictionsReviewed: false,
    };
    const pendingRead = service.listUnapprovedStrengthReviewItems(
      'synthetic-athlete-one', evidence,
    );
    await entered;
    let switched = false;
    const switchProfile = service.activateUserDatabase('synthetic-athlete-two')
      .then(() => { switched = true; });
    try {
      await Promise.resolve();
      expect(switched).toBe(false);
    } finally {
      state.holdExclusiveReview = null;
      state.signalExclusiveStarted = null;
      release();
    }
    await expect(pendingRead).resolves.toEqual([]);
    await switchProfile;
    expect(switched).toBe(true);
    expect(await service.listUnapprovedStrengthReviewItems(
      'synthetic-athlete-two', { ...evidence, athleteId: 'synthetic-athlete-two' },
    )).toEqual([]);
    await expect(service.listUnapprovedStrengthReviewItems(
      'synthetic-athlete-one', evidence,
    )).rejects.toThrow(/Athlete profile changed/);
  });

  it('refuses export and rolls back destructive operations on lost provenance history', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    const { DatabaseSync } = await import('node:sqlite');
    const isolated = new DatabaseSync(join(state.directory, service.getActiveDatabaseName()));
    isolated.exec('DROP TABLE strength_evidence_provenance_events');
    isolated.close();
    await expect(service.exportLocalData())
      .rejects.toThrow(/Cannot export critical audit history: strength_evidence_provenance_events/);
    await expect(service.deleteAllLocalData())
      .rejects.toThrow(/Cannot safely delete critical audit history/);
    expect(await service.getLatestTrainingBlock()).not.toBeNull();
  });

  it('fails export and rolls back deletion if a critical revision journal is unreadable', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    const { DatabaseSync } = await import('node:sqlite');
    const isolated = new DatabaseSync(join(state.directory, service.getActiveDatabaseName()));
    isolated.exec('DROP TABLE strength_revision_previews');
    isolated.close();
    await expect(service.exportLocalData()).rejects.toThrow(/Cannot export critical audit history/);
    await expect(service.deleteAllLocalData())
      .rejects.toThrow(/Cannot safely delete critical audit history/);
    expect(await service.getLatestTrainingBlock()).not.toBeNull();
  });

  it('finishes a planned workout and writes one canonical linked ledger record', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    expect(await sessionStatus()).toBe('planned');
    await save(0.6);
    const records = await ledger();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: stableId, plannedSessionId: 'synthetic-planned-session',
      relationToPlan: 'completed_planned', completionFraction: 0.6,
    });
    expect(await sessionStatus()).toBe('completed');
  });

  it('never invents completed exercise sets for an unlogged partial workout', async () => {
    const exerciseWorkout = {
      ...workout, id: 'synthetic-partial-with-exercise',
      stations: [{
        id: 'synthetic-station-1', durationSeconds: 900,
        exercises: [{
          exerciseId: 'synthetic-squat', target: 10, unit: 'reps',
          equipmentOptionId: 'bodyweight',
          exerciseSnapshot: {
            name: 'Synthetic bodyweight squat', bodyRegions: [],
            movementPatterns: ['squat'], equipmentOptions: [],
          },
        }],
      }],
    } as unknown as Parameters<MobileDb['saveCompletedWorkout']>[0]['workout'];
    await service.saveCompletedWorkout({
      workout: exerciseWorkout,
      startedAt, completedAt,
      completionFraction: 0.25, stationRounds: {},
      idempotencyKey: 'unlogged-partial',
    });
    const partial = (await ledger()).find((entry) => entry.id === 'unlogged-partial');
    expect(partial?.completionFraction).toBe(0.25);
    expect(partial?.exercises).toHaveLength(1);
    expect(partial?.exercises[0]?.sets).toEqual([]);

    await service.saveCompletedWorkout({
      workout: exerciseWorkout,
      startedAt, completedAt,
      completionFraction: 1, stationRounds: {},
      idempotencyKey: 'full-no-set-logging',
    });
    const full = (await ledger()).find((entry) => entry.id === 'full-no-set-logging');
    expect(full?.exercises[0]?.sets).toHaveLength(1);
  });

  it('migrates legacy partial completions without inventing per-exercise sets', async () => {
    const exerciseWorkout = {
      ...workout, id: 'synthetic-legacy-partial',
      stations: [{
        id: 'legacy-station-1', durationSeconds: 900,
        exercises: [{
          exerciseId: 'legacy-squat', target: 10, unit: 'reps',
          equipmentOptionId: 'bodyweight',
          exerciseSnapshot: {
            name: 'Legacy prescribed squat', bodyRegions: [],
            movementPatterns: ['squat'], equipmentOptions: [],
          },
        }],
      }],
    } as unknown as Parameters<MobileDb['saveCompletedWorkout']>[0]['workout'];
    const legacyId = 'legacy-partial-before-ledger';
    await service.saveCompletedWorkout({
      workout: exerciseWorkout,
      startedAt, completedAt,
      completionFraction: 0.25, stationRounds: {},
      idempotencyKey: legacyId,
    });
    // Simulate a pre-ledger app version: the original completed_workouts row
    // survives, but the newer workout_ledger row does not yet exist.
    const { DatabaseSync } = await import('node:sqlite');
    const probe = new DatabaseSync(join(scratch, 'circuit-generator.db'));
    try {
      probe.prepare('DELETE FROM workout_ledger WHERE id = ?').run(legacyId);
    } finally {
      probe.close();
    }
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    const migrated = (await ledger()).find((entry) => entry.id === legacyId);
    expect(migrated?.completionFraction).toBe(0.25);
    expect(migrated?.workout?.id).toBe('synthetic-legacy-partial');
    expect(migrated?.exercises).toHaveLength(1);
    expect(migrated?.exercises[0]?.name).toBe('Legacy prescribed squat');
    expect(migrated?.exercises[0]?.sets).toEqual([]);

    // Reopening a database after migration cannot duplicate or upgrade a
    // partial record to a completed full prescription.
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    expect((await ledger()).filter((entry) => entry.id === legacyId)).toHaveLength(1);
    expect((await ledger()).find((entry) => entry.id === legacyId)
      ?.exercises[0]?.sets).toEqual([]);
  });

  it('repeating the same completion is idempotent and preserves partial dose', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    await save(0.4);
    await save(1);
    expect(await ledger()).toHaveLength(1);
    expect((await ledger())[0]?.completionFraction).toBe(0.4);
    expect(await sessionStatus()).toBe('completed');
  });

  it('fences in-flight canonical completion from athlete B database activation', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    let entered!: () => void;
    let release!: () => void;
    const inside = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });

    const aSave = service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
      entered();
      await held; // A owns the activation lock while the write is delayed.
      await save(0.42);
    });
    await inside;
    const switchToB = service.activateUserDatabase('synthetic-athlete-two');
    release();
    await Promise.all([aSave, switchToB]);
    // The entire multi-step canonical write stayed in A's SQLite database.
    expect(await ledger()).toHaveLength(0);
    await expect(service.withVerifiedAthleteDatabase('synthetic-athlete-one', () => save(1)))
      .rejects.toThrow(/Athlete profile changed/);
    expect(await ledger()).toHaveLength(0);
    await service.activateUserDatabase('synthetic-athlete-one');
    expect((await ledger()).map((entry) => entry.completionFraction)).toEqual([0.42]);
    expect(await sessionStatus()).toBe('completed');
    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await ledger()).toHaveLength(0);
  });

  it('survives a real SIGKILL while SQLite has an uncommitted completion write', async () => {
    // This terminates a separate Node process during a real SQLite
    // transaction on the same on-disk file used by the mobile service.
    // It validates SQLite crash rollback + app retry, but it is NOT
    // native iOS process termination within the actual Expo callback.
    const live = await import('../../../apps/mobile/src/services/active-workout-persistence');
    await service.saveTrainingBlock(weeklyBlock());
    const originalFraction = 0.43;
    await live.saveLiveWorkoutSession({
      ...live.createInitialLiveWorkoutSession(workout, startedAt, {
        sessionId: 'synthetic-planned-session', sessionDate: '2026-10-20',
        sessionTitle: 'Planned strength', modifiedFromPlan: false,
      }),
      phase: 'rest', running: false,
      pendingCompletion: { completionFraction: originalFraction, completedAt },
    }, 'synthetic-athlete-one');

    const childScript = [
      "import { DatabaseSync } from 'node:sqlite';",
      'const db = new DatabaseSync(process.argv[1]);',
      "db.exec('BEGIN IMMEDIATE');",
      "db.prepare('INSERT INTO completed_workouts (id, workout_json, started_at, completed_at, completion_fraction, station_rounds_json) VALUES (?, ?, ?, ?, ?, ?)').run(process.argv[2], process.argv[3], process.argv[4], process.argv[5], Number(process.argv[6]), '{}');",
      "process.stdout.write('UNCOMMITTED_WRITE_REACHED\\n');",
      'process.stdin.resume();',
    ].join('\n');
    const dbPath = join(scratch, 'circuit-generator.db');
    const child = spawn(process.execPath, ['--input-type=module', '-e', childScript,
      dbPath, stableId, JSON.stringify(workout), startedAt, completedAt,
      String(originalFraction)], { stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      await new Promise<void>((resolve, reject) => {
        let output = '';
        let finished = false;
        const timeout = setTimeout(() => {
          if (!finished) { finished = true; reject(new Error('SQLite SIGKILL fixture did not reach transaction hold')); }
        }, 15000);
        child.once('error', (error) => {
          if (!finished) { finished = true; clearTimeout(timeout); reject(error); }
        });
        child.once('exit', (code, signal) => {
          if (!finished) {
            finished = true; clearTimeout(timeout);
            reject(new Error('SQLite fixture exited before hold: ' + code + '/' + signal));
          }
        });
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
          if (!finished && output.includes('UNCOMMITTED_WRITE_REACHED')) {
            finished = true; clearTimeout(timeout); resolve();
          }
        });
      });
      const killed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => child.once('exit', (code, signal) => resolve({ code, signal })),
      );
      child.kill('SIGKILL');
      expect((await killed).signal).toBe('SIGKILL');

      // The uncommitted row cannot become a claimed completed workout.
      const { DatabaseSync } = await import('node:sqlite');
      const probe = new DatabaseSync(dbPath);
      try {
        expect(probe.prepare('SELECT id FROM completed_workouts WHERE id = ?')
          .get(stableId)).toBeUndefined();
      } finally {
        probe.close();
      }
      expect(await ledger()).toHaveLength(0);
      expect((await live.loadLiveWorkoutSession('synthetic-athlete-one'))
        ?.pendingCompletion?.completionFraction).toBe(originalFraction);

      // A cold app-module restart must keep the original partial fraction.
      for (const handle of state.handles.splice(0)) handle.close();
      vi.resetModules();
      service = await import('../../../apps/mobile/src/services/database');
      await service.activateUserDatabase('synthetic-athlete-one');
      const restored = await import('../../../apps/mobile/src/services/active-workout-persistence');
      expect((await restored.loadLiveWorkoutSession('synthetic-athlete-one'))
        ?.pendingCompletion).toEqual({ completionFraction: originalFraction, completedAt });
      await save(originalFraction);
      await save(1); // duplicate replay cannot promote an original partial dose.
      expect((await ledger()).map((entry) => entry.completionFraction))
        .toEqual([originalFraction]);
      expect(await sessionStatus()).toBe('completed');
      await restored.clearLiveWorkoutSession('synthetic-athlete-one');
      expect(await restored.loadLiveWorkoutSession('synthetic-athlete-one')).toBeNull();
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  });

  it('rolls back both ledger and completed-workout row after an injected SQL failure', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    state.failNextContaining = 'INSERT OR REPLACE INTO workout_ledger';
    await expect(save()).rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await ledger()).toHaveLength(0);
    expect(await sessionStatus()).toBe('planned');
    await save();
    expect(await ledger()).toHaveLength(1);
    expect(await sessionStatus()).toBe('completed');
  });

  it('cold-restarts safely after an injected mid-transaction partial-save failure', async () => {
    // This is a disk-backed SQL failure and full JS module restart, NOT a
    // simulator process termination at an exact native commit instruction.
    const persistence = await import('../../../apps/mobile/src/services/active-workout-persistence');
    await service.saveTrainingBlock(weeklyBlock());
    const originalFraction = 0.41;
    const initial = persistence.createInitialLiveWorkoutSession(workout, startedAt, {
      sessionId: 'synthetic-planned-session', sessionDate: '2026-10-20',
      sessionTitle: 'Planned strength', modifiedFromPlan: false,
    });
    await persistence.saveLiveWorkoutSession({
      ...initial, phase: 'rest', running: false,
      pendingCompletion: { completionFraction: originalFraction, completedAt },
    }, 'synthetic-athlete-one');

    // The completed-workout row was inserted, then the ledger insert failed.
    // The SQLite transaction must roll back ALL canonical rows before restart.
    state.failNextContaining = 'INSERT OR REPLACE INTO workout_ledger';
    await expect(save(originalFraction)).rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await ledger()).toHaveLength(0);
    expect(await sessionStatus()).toBe('planned');
    for (const handle of state.handles.splice(0)) handle.close();

    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    const reloaded = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const pending = await reloaded.loadLiveWorkoutSession('synthetic-athlete-one');
    expect(pending?.pendingCompletion).toEqual({
      completionFraction: originalFraction, completedAt,
    });
    expect(pending?.startedAt).toBe(startedAt);
    expect(await ledger()).toHaveLength(0);

    await save(pending!.pendingCompletion!.completionFraction);
    await save(1); // stale retry cannot silently promote 41% to 100%
    expect((await ledger()).map((entry) => entry.completionFraction))
      .toEqual([originalFraction]);
    expect(await sessionStatus()).toBe('completed');
    await reloaded.clearLiveWorkoutSession('synthetic-athlete-one');
    expect(await reloaded.loadLiveWorkoutSession('synthetic-athlete-one')).toBeNull();
  });

  it('repairs plan status after a post-commit failure without duplicate workout', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    state.failNextContaining = 'INSERT INTO training_blocks';
    await expect(save()).rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await ledger()).toHaveLength(1);
    expect(await sessionStatus()).toBe('planned');
    await save();
    expect(await ledger()).toHaveLength(1);
    expect(await sessionStatus()).toBe('completed');
  });

  it('persists the canonical ledger and completed plan across service module restart', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    await save(0.5);
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    expect((await ledger())).toHaveLength(1);
    expect((await ledger())[0]?.completionFraction).toBe(0.5);
    expect(await sessionStatus()).toBe('completed');
    await save();
    expect(await ledger()).toHaveLength(1);
  });

  it('reopens an interrupted partial completion journal and repairs a committed ledger', async () => {
    const checkpoint = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const originalStart = startedAt;
    const originalCompleted = completedAt;
    const snapshot = checkpoint.createInitialLiveWorkoutSession(
      workout, originalStart,
      { sessionId: 'synthetic-planned-session', sessionDate: '2026-10-20',
        sessionTitle: 'Planned session', modifiedFromPlan: false },
    );
    await service.saveTrainingBlock(weeklyBlock());
    await checkpoint.saveLiveWorkoutSession({
      ...snapshot, phase: 'rest', running: false,
      pendingCompletion: { completionFraction: 0.37, completedAt: originalCompleted },
    });
    state.failNextContaining = 'INSERT INTO training_blocks';
    await expect(save(0.37)).rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await ledger()).toHaveLength(1);
    expect(await sessionStatus()).toBe('planned');
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    const recovered = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const pending = await recovered.loadLiveWorkoutSession();
    expect(pending?.startedAt).toBe(originalStart);
    expect(pending?.pendingCompletion).toEqual({
      completionFraction: 0.37, completedAt: originalCompleted,
    });
    await save(pending!.pendingCompletion!.completionFraction);
    expect((await ledger()).map(x => x.completionFraction)).toEqual([0.37]);
    expect(await sessionStatus()).toBe('completed');
    await recovered.clearLiveWorkoutSession();
    expect(await recovered.loadLiveWorkoutSession()).toBeNull();
  });

  it('never opens an approved player with a missing or overwritten first recovery checkpoint', async () => {
    const store = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const approved = {
      ...store.createInitialLiveWorkoutSession(workout, startedAt, {
        sessionId: 'approved-routine-session',
        sessionDate: '2026-10-20',
        sessionTitle: 'Authorized exact workout',
        modifiedFromPlan: true,
      }),
      running: false,
    };
    await store.persistFirstRoutineNativeCheckpoint(
      approved, 'synthetic-athlete-one',
    );
    expect(await store.loadLiveWorkoutSession('synthetic-athlete-one')).toEqual(approved);
    const raw = globalThis.localStorage.getItem(
      'sidequest.live-workout.session.v1:synthetic-athlete-one',
    );
    await expect(store.persistFirstRoutineNativeCheckpoint(
      approved, 'synthetic-athlete-one',
    )).rejects.toThrow(/earlier workout checkpoint already exists/);
    await expect(store.persistFirstRoutineNativeCheckpoint(
      { ...approved, running: true }, 'synthetic-athlete-two',
    )).rejects.toThrow(/cannot be verified/);
    expect(globalThis.localStorage.getItem(
      'sidequest.live-workout.session.v1:synthetic-athlete-one',
    )).toBe(raw);
    await store.clearLiveWorkoutSession('synthetic-athlete-one');

    const originalSetter = globalThis.localStorage.setItem;
    try {
      globalThis.localStorage.setItem = () => {
        throw new Error('Injected first-checkpoint storage failure.');
      };
      await expect(store.persistFirstRoutineNativeCheckpoint(
        approved, 'synthetic-athlete-one',
      )).rejects.toThrow(/Injected first-checkpoint storage failure/);
      expect(globalThis.localStorage.getItem(
        'sidequest.live-workout.session.v1:synthetic-athlete-one',
      )).toBeNull();
    } finally {
      globalThis.localStorage.setItem = originalSetter;
    }
    await store.persistFirstRoutineNativeCheckpoint(approved, 'synthetic-athlete-one');
    expect((await store.loadLiveWorkoutSession('synthetic-athlete-one'))?.running).toBe(false);
  });

  it('a failed checkpoint removal retains the original workout until a verified retry', async () => {
    const store = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const original = store.createInitialLiveWorkoutSession(workout, startedAt);
    await store.saveLiveWorkoutSession(original, 'synthetic-athlete-one');
    const originalRemover = globalThis.localStorage.removeItem;
    try {
      globalThis.localStorage.removeItem = () => {
        throw new Error('Injected checkpoint cleanup failure.');
      };
      await expect(store.clearLiveWorkoutSession('synthetic-athlete-one'))
        .rejects.toThrow(/Injected checkpoint cleanup failure/);
      expect(await store.loadLiveWorkoutSession('synthetic-athlete-one')).toEqual(original);
    } finally {
      globalThis.localStorage.removeItem = originalRemover;
    }
    await store.clearLiveWorkoutSession('synthetic-athlete-one');
    expect(await store.loadLiveWorkoutSession('synthetic-athlete-one')).toBeNull();
    // An explicit signed-out identity is a safe no-op, never a previous-owner delete.
    await store.clearLiveWorkoutSession(null);
    expect(await store.loadLiveWorkoutSession('synthetic-athlete-one')).toBeNull();
  });

  it('a live safety hold survives timer writes and cold restart without losing partial work', async () => {
    const store = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const initial = store.createInitialLiveWorkoutSession(workout, startedAt);
    await store.saveLiveWorkoutSession(initial, 'synthetic-athlete-one');
    await store.holdLiveWorkoutForSafety(
      'synthetic-athlete-one', 'New persistent movement restriction.',
    );
    const held = await store.loadLiveWorkoutSession('synthetic-athlete-one');
    expect(held?.safetyHold?.kind).toBe('routine_native_safety_hold');
    expect(held?.safetyHold?.reason).toMatch(/movement restriction/);
    expect(held?.running).toBe(false);
    await store.saveLiveWorkoutSession({
      ...initial, running: true, phase: 'rest', stationIndex: 1,
    }, 'synthetic-athlete-one');
    const late = await store.loadLiveWorkoutSession('synthetic-athlete-one');
    expect(late?.running).toBe(false);
    expect(late?.safetyHold).toEqual(held?.safetyHold);
    await store.saveLiveWorkoutSession({
      ...initial, running: false,
      pendingCompletion: { completedAt, completionFraction: 0.29 },
    }, 'synthetic-athlete-one');
    const partial = await store.loadLiveWorkoutSession('synthetic-athlete-one');
    expect(partial?.pendingCompletion?.completionFraction).toBe(0.29);
    expect(partial?.safetyHold).toEqual(held?.safetyHold);
    vi.resetModules();
    const restarted = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const recovered = await restarted.loadLiveWorkoutSession('synthetic-athlete-one');
    expect(recovered?.safetyHold).toEqual(held?.safetyHold);
    expect(recovered?.running).toBe(false);
    expect(recovered?.pendingCompletion?.completionFraction).toBe(0.29);
  });

  it('ended-workout tombstone blocks a delayed timer write from resurrecting the discarded session', async () => {
    const store = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const initial = store.createInitialLiveWorkoutSession(workout, startedAt);
    await store.saveLiveWorkoutSession(initial, 'synthetic-athlete-one');
    await store.clearLiveWorkoutSession('synthetic-athlete-one');
    expect(await store.loadLiveWorkoutSession('synthetic-athlete-one')).toBeNull();
    await expect(store.saveLiveWorkoutSession({
      ...initial, savedAt: new Date().toISOString(),
    }, 'synthetic-athlete-one')).rejects.toThrow(/cannot be resurrected/);
    expect(await store.loadLiveWorkoutSession('synthetic-athlete-one')).toBeNull();
    const distinct = store.createInitialLiveWorkoutSession(
      workout, '2026-10-21T08:00:00.000Z',
    );
    await store.saveLiveWorkoutSession(distinct, 'synthetic-athlete-one');
    expect((await store.loadLiveWorkoutSession('synthetic-athlete-one'))?.startedAt)
      .toBe(distinct.startedAt);
    await store.clearLiveWorkoutSession('synthetic-athlete-one');
    const rawKey = 'sidequest.live-workout.session.v1:synthetic-athlete-one';
    globalThis.localStorage.setItem(rawKey, '{broken json');
    expect(await store.inspectLiveWorkoutSlot('synthetic-athlete-one'))
      .toBe('unreadable');
    await expect(store.persistFirstRoutineNativeCheckpoint({
      ...distinct, running: false,
    }, 'synthetic-athlete-one')).rejects.toThrow(/already exists/);
    expect(globalThis.localStorage.getItem(rawKey)).toBe('{broken json');
  });

  it('does not overwrite an unresolved completion with a new workout or corrupt stored checkpoint', async () => {
    const checkpoint = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const sessionA = checkpoint.createInitialLiveWorkoutSession(workout, startedAt);
    const pending = {
      ...sessionA, phase: 'rest' as const, running: false,
      pendingCompletion: { completionFraction: 0.31, completedAt },
    };
    await checkpoint.saveLiveWorkoutSession(pending, 'synthetic-athlete-one');
    const storedBefore = globalThis.localStorage.getItem(
      'sidequest.live-workout.session.v1:synthetic-athlete-one',
    );
    expect(() => checkpoint.assertCanStartLiveWorkout('synthetic-athlete-one'))
      .toThrow(/Finish saving the previous workout/);

    const otherWorkout = { ...workout, id: 'other-workout' };
    const replacement = checkpoint.createInitialLiveWorkoutSession(
      otherWorkout, '2026-10-21T11:00:00.000Z',
    );
    await expect(checkpoint.saveLiveWorkoutSession(replacement, 'synthetic-athlete-one'))
      .rejects.toThrow(/Conflicting pending workout completion/);
    expect(globalThis.localStorage.getItem(
      'sidequest.live-workout.session.v1:synthetic-athlete-one',
    )).toBe(storedBefore);
    // Background writes for the original session may arrive after its
    // journal is committed; they are ignored rather than wiping the dose.
    await checkpoint.saveLiveWorkoutSession(sessionA, 'synthetic-athlete-one');
    expect((await checkpoint.loadLiveWorkoutSession('synthetic-athlete-one'))
      ?.pendingCompletion?.completionFraction).toBe(0.31);

    await service.activateUserDatabase('synthetic-athlete-two');
    expect(() => checkpoint.assertCanStartLiveWorkout('synthetic-athlete-two'))
      .not.toThrow();
    await checkpoint.saveLiveWorkoutSession(replacement, 'synthetic-athlete-two');
    expect((await checkpoint.loadLiveWorkoutSession('synthetic-athlete-two'))
      ?.workout.id).toBe('other-workout');

    await service.activateUserDatabase('synthetic-athlete-one');
    await checkpoint.clearLiveWorkoutSession('synthetic-athlete-one');
    expect(() => checkpoint.assertCanStartLiveWorkout('synthetic-athlete-one'))
      .not.toThrow();
    const corruptKey = 'sidequest.live-workout.session.v1:synthetic-athlete-one';
    globalThis.localStorage.setItem(corruptKey, '{unparseable-checkpoint');
    expect(() => checkpoint.assertCanStartLiveWorkout('synthetic-athlete-one'))
      .toThrow(/data was preserved/);
    expect(globalThis.localStorage.getItem(corruptKey))
      .toBe('{unparseable-checkpoint');
    await expect(checkpoint.saveLiveWorkoutSession(replacement, 'synthetic-athlete-one'))
      .rejects.toThrow(/Existing workout checkpoint is unreadable/);
    expect(globalThis.localStorage.getItem(corruptKey))
      .toBe('{unparseable-checkpoint');
  });

  it('keeps A pending partial dose and B live workout separate across athlete switches and cold reload', async () => {
    const mobileCheckpoint = await import('../../../apps/mobile/src/services/active-workout-persistence');
    await service.saveTrainingBlock(weeklyBlock());
    const sessionA = mobileCheckpoint.createInitialLiveWorkoutSession(workout, startedAt, {
      sessionId: 'synthetic-planned-session', sessionDate: '2026-10-20',
      sessionTitle: 'Athlete A planned session', modifiedFromPlan: false,
    });
    await mobileCheckpoint.saveLiveWorkoutSession({
      ...sessionA, phase: 'rest', running: false,
      pendingCompletion: { completionFraction: 0.29, completedAt },
    }, 'synthetic-athlete-one');

    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await mobileCheckpoint.loadLiveWorkoutSession()).toBeNull();
    const bWorkout = { ...workout, id: 'synthetic-strength-b', name: 'Athlete B session' };
    const bStart = '2026-10-22T10:00:00.000Z';
    const sessionB = mobileCheckpoint.createInitialLiveWorkoutSession(bWorkout, bStart);
    await mobileCheckpoint.saveLiveWorkoutSession({
      ...sessionB, phase: 'rest', running: false, remainingSeconds: 22,
    }, 'synthetic-athlete-two');
    expect((await mobileCheckpoint.loadLiveWorkoutSession())?.workout.id).toBe(bWorkout.id);
    expect((await mobileCheckpoint.loadLiveWorkoutSession())?.pendingCompletion).toBeUndefined();
    expect(await ledger()).toHaveLength(0);

    // Simulate actual app-process module reinitialization, retaining device
    // localStorage and the on-disk SQLite files for both athletes.
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-two');
    const recovered = await import('../../../apps/mobile/src/services/active-workout-persistence');
    const bRestored = await recovered.loadLiveWorkoutSession();
    expect(bRestored?.workout.id).toBe(bWorkout.id);
    expect(bRestored?.remainingSeconds).toBe(22);

    await service.activateUserDatabase('synthetic-athlete-one');
    const aRestored = await recovered.loadLiveWorkoutSession();
    expect(aRestored?.workout.id).toBe(workout.id);
    expect(aRestored?.startedAt).toBe(startedAt);
    expect(aRestored?.planLink?.sessionId).toBe('synthetic-planned-session');
    expect(aRestored?.pendingCompletion).toEqual({
      completionFraction: 0.29, completedAt,
    });
    expect(await ledger()).toHaveLength(0);
    await save(aRestored!.pendingCompletion!.completionFraction);
    await save(1); // A second attempt must not turn the original 29% into 100%.
    expect((await ledger()).map((entry) => entry.completionFraction)).toEqual([0.29]);
    await recovered.clearLiveWorkoutSession('synthetic-athlete-one');
    expect(await recovered.loadLiveWorkoutSession()).toBeNull();

    // B retains only B's original live work/rest checkpoint, even after A
    // finished. A sign-out removes only the active-owner pointer, not B data.
    await service.activateUserDatabase('synthetic-athlete-two');
    expect((await recovered.loadLiveWorkoutSession())?.workout.id).toBe(bWorkout.id);
    expect(await ledger()).toHaveLength(0);
    globalThis.localStorage.removeItem('sidequest.active-workout.profile-id');
    expect(await recovered.loadLiveWorkoutSession()).toBeNull();
    expect(await recovered.loadLiveWorkoutSession(null)).toBeNull();
    await expect(recovered.saveLiveWorkoutSession(sessionB, null))
      .rejects.toThrow('Cannot save an unowned live workout');
    expect((await recovered.loadLiveWorkoutSession('synthetic-athlete-two'))?.workout.id)
      .toBe(bWorkout.id);
  });

  it('resumes first-run after goal succeeded but training block failed on real SQLite', async () => {
    const onboarding = await import('../../../apps/mobile/src/services/onboarding');
    const userId = 'synthetic-athlete-one';
    onboarding.saveOnboardingState(userId, {
      ...onboarding.defaultOnboardingState(),
      strengthModelAcknowledged: true,
      privacyModelAcknowledged: true,
      firstWeekSetupStartedAt: startedAt,
    });
    const partialGoal = {
      ...weeklyBlock().goal,
      id: 'incomplete-first-week-goal',
      createdAt: startedAt,
    } as Parameters<MobileDb['savePerformanceGoal']>[0];
    await service.savePerformanceGoal(partialGoal);
    state.failNextContaining = 'INSERT INTO training_blocks';
    await expect(service.saveTrainingBlock(weeklyBlock()))
      .rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await service.getLatestTrainingBlock()).toBeNull();
    for (const handle of state.handles.splice(0)) handle.close();

    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase(userId);
    const resumed = await import('../../../apps/mobile/src/services/onboarding');
    const result = await resumed.evaluateFirstRun(userId);
    expect(result.needsOnboarding).toBe(true);
    expect(result.state.firstWeekSetupStartedAt).toBe(startedAt);
    expect(result.state.firstRunBypassedAt).toBeUndefined();
    expect((await service.getLatestPerformanceGoal())?.id).toBe(partialGoal.id);
    expect(await service.getLatestTrainingBlock()).toBeNull();
  });

  it('repairs a partially saved first-week block from its original identity', async () => {
    const original = weeklyBlock();
    expect(await service.getTrainingBlockById(original.id)).toBeNull();
    state.failNextContaining = 'INSERT INTO weekly_training_plans';
    await expect(service.saveTrainingBlock(original))
      .rejects.toThrow(/synthetic SQLite write interruption/);
    // The header committed before its weekly rows. Recover it exactly rather
    // than inserting a new seeded block with different workout IDs.
    const partiallySaved = await service.getTrainingBlockById(original.id);
    expect(partiallySaved).toEqual(original);
    expect(await service.getLatestWeeklyPlan()).toBeNull();
    await service.saveTrainingBlock(partiallySaved!);
    const restored = await service.getTrainingBlockById(original.id);
    expect(restored?.id).toBe(original.id);
    expect((await service.getLatestWeeklyPlan())?.plan.id).toBe(original.weeks[0]?.id);
    expect(await service.getTrainingBlockById('unrelated-block')).toBeNull();

    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    expect((await service.getTrainingBlockById(original.id))?.id).toBe(original.id);
    expect((await service.getLatestWeeklyPlan())?.plan.id).toBe(original.weeks[0]?.id);
  });

  it('records its verified athlete owner inside each SQLite file', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const firstName = service.getActiveDatabaseName();
    const first = new DatabaseSync(join(state.directory, firstName));
    expect(first.prepare(
      'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1',
    ).get()).toMatchObject({ user_id: 'synthetic-athlete-one' });
    first.close();
    await service.activateUserDatabase('synthetic-athlete-two');
    const second = new DatabaseSync(join(state.directory, service.getActiveDatabaseName()));
    expect(second.prepare(
      'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1',
    ).get()).toMatchObject({ user_id: 'synthetic-athlete-two' });
    second.close();
  });

  it('refuses a forged local filename claim when the SQLite file belongs to another athlete', async () => {
    const first = 'collision_a.b';
    const other = 'collision_a_b';
    await service.activateUserDatabase(first);
    const protectedName = service.getActiveDatabaseName();
    await service.saveTrainingBlock(weeklyBlock());
    await save();
    globalThis.localStorage.setItem('circuit.database-file-owner.v1:' + protectedName, other);
    await expect(service.activateUserDatabase(other)).rejects.toThrow(/ownership mismatch/);
    expect(service.getActiveDatabaseName()).toBe(protectedName);
    expect((await ledger())).toHaveLength(1);
  });

  it('does not reassign a populated original file when localStorage ownership is lost', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    await save();
    globalThis.localStorage.removeItem('circuit.original-database-owner');
    await expect(service.activateUserDatabase('synthetic-different-owner'))
      .rejects.toThrow(/ownership mismatch/);
    expect((await ledger())).toHaveLength(1);
    expect(service.getActiveDatabaseName()).toBe('circuit-generator.db');
  });

  it('does not adopt a populated legacy side-profile database without independent provenance', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const athlete = 'historical-side-profile';
    await service.activateUserDatabase(athlete);
    const protectedName = service.getActiveDatabaseName();
    await service.saveTrainingBlock(weeklyBlock());
    await save();
    const raw = new DatabaseSync(join(state.directory, protectedName));
    raw.prepare('DELETE FROM sidequest_athlete_database_owner').run();
    raw.close();
    globalThis.localStorage.removeItem('circuit.database-file-owner.v1:' + protectedName);
    await expect(service.activateUserDatabase(athlete))
      .rejects.toThrow(/no verifiable owner/);
    expect(service.getActiveDatabaseName()).toBe(protectedName);
    // The database remains intact for a manual owner-provenance migration.
    expect((await ledger())).toHaveLength(1);
  });

  it('does not modify even one byte of a populated unowned historical SQLite file when refusing adoption', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const athlete = 'legacy_no_owner';
    const candidate = join(state.directory, 'circuit-generator-legacy_no_owner.db');
    const original = new DatabaseSync(candidate);
    original.exec(`
      CREATE TABLE historical_training (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO historical_training VALUES ('old-record', 'unknown-owner-preserve-me');
    `);
    original.close();
    const bytesBefore = readFileSync(candidate);
    const activeBefore = service.getActiveDatabaseName();

    await expect(service.activateUserDatabase(athlete))
      .rejects.toThrow(/no verifiable owner/);
    expect(service.getActiveDatabaseName()).toBe(activeBefore);
    expect(readFileSync(candidate).equals(bytesBefore)).toBe(true);

    const untouched = new DatabaseSync(candidate);
    expect(untouched.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sidequest_athlete_database_owner'",
    ).get()).toBeUndefined();
    expect(untouched.prepare(
      "SELECT value FROM historical_training WHERE id = 'old-record'",
    ).get()).toEqual({ value: 'unknown-owner-preserve-me' });
    untouched.close();
  });

  it('keeps the previous active profile selected when new owner verification fails', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    const priorName = service.getActiveDatabaseName();
    state.failNextContaining = 'INSERT INTO sidequest_athlete_database_owner';
    await expect(service.activateUserDatabase('fresh-athlete')).rejects
      .toThrow(/synthetic SQLite write interruption/);
    expect(service.getActiveDatabaseName()).toBe(priorName);
    expect(await sessionStatus()).toBe('planned');
    expect(globalThis.localStorage.getItem('sidequest.active-workout.profile-id'))
      .toBe('synthetic-athlete-one');
  });

  it('prevents two different athlete IDs that normalize to the same filename sharing data', async () => {
    // A dot and underscore both map to underscore under the original filename
    // sanitizer. Without ownership tracking, their SQLite databases collide.
    const firstId = 'local_a.b@example.invalid';
    const secondId = 'local_a_b@example.invalid';
    await service.activateUserDatabase(firstId);
    const firstName = service.getActiveDatabaseName();
    await service.saveTrainingBlock(weeklyBlock());
    await save(0.6);
    await service.activateUserDatabase(secondId);
    const secondName = service.getActiveDatabaseName();
    expect(secondName).not.toBe(firstName);
    expect(await service.getLatestTrainingBlock()).toBeNull();
    expect(await ledger()).toHaveLength(0);
    await service.activateUserDatabase(firstId);
    expect(service.getActiveDatabaseName()).toBe(firstName);
    expect((await ledger())).toHaveLength(1);
    await service.activateUserDatabase(secondId);
    expect(service.getActiveDatabaseName()).toBe(secondName);
    expect(await ledger()).toHaveLength(0);
  });

  it('keeps default equipment initialization in the verified source athlete database', async () => {
    await service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
      const profiles = await service.ensureDefaultEquipmentProfiles();
      expect(profiles).toHaveLength(3);
      await service.getRecentRegionExposures();
      await service.getPreviousExerciseIds();
    });
    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await service.listEquipmentProfiles()).toHaveLength(0);
    await expect(service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
      await service.ensureDefaultEquipmentProfiles();
    })).rejects.toThrow('Athlete profile changed');
    expect(await service.listEquipmentProfiles()).toHaveLength(0);
    await service.activateUserDatabase('synthetic-athlete-one');
    expect(await service.listEquipmentProfiles()).toHaveLength(3);
  });

  it('rejects athlete A first-week writes if their generator resolves after activating B', async () => {
    let finishGeneration!: () => void;
    const generated = new Promise<void>((resolve) => { finishGeneration = resolve; });
    let resumed = false;
    const delayedFirstWeek = (async () => {
      await generated; // expensive first-week generation paused mid-flight
      resumed = true;
      await service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
        await service.savePerformanceGoal({
          ...weeklyBlock().goal, id: 'stale-athlete-a-goal', createdAt: startedAt,
        } as Parameters<MobileDb['savePerformanceGoal']>[0]);
        await service.saveTrainingBlock(weeklyBlock());
      });
    })();
    await service.activateUserDatabase('synthetic-athlete-two');
    finishGeneration();
    await expect(delayedFirstWeek).rejects.toThrow('Athlete profile changed');
    expect(resumed).toBe(true);
    expect(await service.getLatestPerformanceGoal()).toBeNull();
    expect(await service.getLatestTrainingBlock()).toBeNull();
    // The rejected stale result did not write into A OR B.
    await service.activateUserDatabase('synthetic-athlete-one');
    expect(await service.getLatestPerformanceGoal()).toBeNull();
    expect(await service.getLatestTrainingBlock()).toBeNull();
  });

  it('serializes a profile switch across pending goal, block and calendar writes', async () => {
    let signalGoalSaved!: () => void;
    let releaseAfterGoal!: () => void;
    const goalSaved = new Promise<void>((resolve) => { signalGoalSaved = resolve; });
    const allowBlock = new Promise<void>((resolve) => { releaseAfterGoal = resolve; });
    const goal = { ...weeklyBlock().goal, id: 'a-goal',
      createdAt: startedAt } as Parameters<MobileDb['savePerformanceGoal']>[0];
    const write = service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
      await service.savePerformanceGoal(goal);
      signalGoalSaved();
      await allowBlock; // B switches while A is midway through the workflow.
      await service.saveTrainingBlock(weeklyBlock());
      await service.saveWeeklyPlan(weeklyBlock().weeks[0]!); // derived-calendar placeholder
    });
    await goalSaved;
    let switched = false;
    const switchToB = service.activateUserDatabase('synthetic-athlete-two')
      .then(() => { switched = true; });
    await Promise.resolve();
    expect(switched).toBe(false);
    releaseAfterGoal();
    await write;
    await switchToB;
    expect(switched).toBe(true);
    expect(await service.getLatestPerformanceGoal()).toBeNull();
    expect(await service.getLatestTrainingBlock()).toBeNull();
    expect(await service.getLatestWeeklyPlan()).toBeNull();
    await service.activateUserDatabase('synthetic-athlete-one');
    expect((await service.getLatestPerformanceGoal())?.id).toBe('a-goal');
    expect((await service.getLatestTrainingBlock())?.id).toBe('synthetic-block');
    expect((await service.getLatestWeeklyPlan())?.id).toBe('synthetic-week');
  });

  it('releases profile write lock after a SQLite failure, with no other athlete pollution', async () => {
    state.failNextContaining = 'INSERT INTO training_blocks';
    await expect(service.withVerifiedAthleteDatabase('synthetic-athlete-one', async () => {
      await service.saveTrainingBlock(weeklyBlock());
    })).rejects.toThrow('synthetic SQLite write interruption');
    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await service.getLatestTrainingBlock()).toBeNull();
    await service.withVerifiedAthleteDatabase('synthetic-athlete-two', async () => {
      await service.saveTrainingBlock({ ...weeklyBlock(), id: 'b-block' });
    });
    expect((await service.getLatestTrainingBlock())?.id).toBe('b-block');
    await service.activateUserDatabase('synthetic-athlete-one');
    expect(await service.getLatestTrainingBlock()).toBeNull();
  });

  it('does not expose athlete A ledger or plan within athlete B profile', async () => {
    await service.saveTrainingBlock(weeklyBlock());
    await save();
    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await ledger()).toHaveLength(0);
    expect(await service.getLatestTrainingBlock()).toBeNull();
    await service.activateUserDatabase('synthetic-athlete-one');
    expect(await ledger()).toHaveLength(1);
    expect(await sessionStatus()).toBe('completed');
  });
});

const endurance = () => createManualEnduranceActivity({
  id: 'synthetic-ride-1', name: 'Completed bike session',
  discipline: 'bike', localDate: '2026-10-20', durationMinutes: 75,
  distanceKm: null, intensity: 'easy',
  recordedAt: '2026-10-21T12:00:00.000Z',
});

describe('actual mobile endurance source integrity with real SQLite', () => {
  it('repeated import of the same completed session never duplicates exposure records', async () => {
    const first = await service.upsertEnduranceActivities([endurance()]);
    const second = await service.upsertEnduranceActivities([endurance()]);
    expect(first.insertedIds).toEqual(['synthetic-ride-1']);
    expect(second.insertedIds).toEqual([]);
    const stored = await service.listEnduranceActivities();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.movingTimeSeconds).toBe(4500);
    expect(stored[0]?.distanceMeters).toBeUndefined();
  });

  it('recovers the exact 75-minute ride with unknown distance after database restart', async () => {
    await service.upsertEnduranceActivities([endurance()]);
    for (const handle of state.handles.splice(0)) handle.close();
    vi.resetModules();
    service = await import('../../../apps/mobile/src/services/database');
    await service.activateUserDatabase('synthetic-athlete-one');
    const retrieved = await service.getEnduranceActivity('synthetic-ride-1');
    expect(retrieved?.name).toBe('Completed bike session');
    expect(retrieved?.discipline).toBe('bike');
    expect(retrieved?.movingTimeSeconds).toBe(75 * 60);
    expect(retrieved?.distanceMeters).toBeUndefined();
    expect((await service.listEnduranceActivities()).map(x => x.id))
      .toEqual(['synthetic-ride-1']);
    await service.upsertEnduranceActivities([endurance()]);
    expect(await service.listEnduranceActivities()).toHaveLength(1);
  });

  it('does not expose a completed ride when a different athlete becomes active', async () => {
    await service.upsertEnduranceActivities([endurance()]);
    await service.activateUserDatabase('synthetic-athlete-two');
    expect(await service.getEnduranceActivity('synthetic-ride-1')).toBeNull();
    expect(await service.listEnduranceActivities()).toHaveLength(0);
    await service.activateUserDatabase('synthetic-athlete-one');
    expect((await service.getEnduranceActivity('synthetic-ride-1'))?.movingTimeSeconds)
      .toBe(4500);
    expect((await service.listEnduranceActivities()).map(x => x.id))
      .toEqual(['synthetic-ride-1']);
  });

  it('does not double-count the same provider/source identifier under a new record ID', async () => {
    const record = endurance();
    await service.upsertEnduranceActivities([record]);
    await expect(service.upsertEnduranceActivities([
      { ...record, id: 'alternate-id-for-same-external-workout' },
    ])).rejects.toThrow();
    expect((await service.listEnduranceActivities()).map(x => x.id))
      .toEqual(['synthetic-ride-1']);
  });

  it('treats failed endurance SQL upsert as absent, then admits a single retry', async () => {
    state.failNextContaining = 'INSERT INTO endurance_activities';
    await expect(service.upsertEnduranceActivities([endurance()]))
      .rejects.toThrow(/synthetic SQLite write interruption/);
    expect(await service.listEnduranceActivities()).toHaveLength(0);
    await service.upsertEnduranceActivities([endurance()]);
    expect(await service.listEnduranceActivities()).toHaveLength(1);
  });

  it('soft deletion removes completed activity from default views but retains audit record', async () => {
    await service.upsertEnduranceActivities([endurance()]);
    const deleted = await service.softDeleteEnduranceActivity({
      source: 'manual', externalId: 'synthetic-ride-1',
      deletedAt: '2026-10-22T12:00:00.000Z',
    });
    expect(deleted).toBe('synthetic-ride-1');
    expect(await service.listEnduranceActivities()).toHaveLength(0);
    const retained = await service.listEnduranceActivities({ includeDeleted: true });
    expect(retained).toHaveLength(1);
    expect(retained[0]?.deletedAt).toBe('2026-10-22T12:00:00.000Z');
  });
});
