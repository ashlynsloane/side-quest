import type { PrivacySafeDiagnostics } from './diagnostics';

export type ReadinessSeverity = 'ready' | 'attention' | 'blocked';
export type ReadinessGate = {
  id: string;
  title: string;
  detail: string;
  severity: ReadinessSeverity;
  action?: string;
};

export const APP_VERSION = '0.18.10';
export const RELEASE_CHANNEL = __DEV__ ? 'development' : 'beta';
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function normalizeUserFacingError(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause ?? 'Unknown error');
  const lower = raw.toLowerCase();
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('offline')) return 'Side Quest could not reach the service. Your local training data is still available.';
  if (lower.includes('permission denied') || lower.includes('row-level security') || lower.includes('42501')) return 'This beta service is not available for this account yet. Your local training data is unaffected.';
  if (lower.includes('jwt') || lower.includes('token') || lower.includes('session')) return 'Your cloud session needs to be refreshed. Sign in again to resume syncing.';
  if (lower.includes('timeout')) return 'The request took too long. Try again when the connection is stable.';
  return 'Side Quest could not complete that action. Nothing was deleted; try again.';
}

export function isTimestampStale(value?: string, now = Date.now(), maxAgeMs = STALE_AFTER_MS): boolean {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) || now - timestamp > maxAgeMs;
}

export function buildReleaseGates(report: PrivacySafeDiagnostics | null): ReadinessGate[] {
  if (!report) return [{ id: 'diagnostics', title: 'Diagnostics', detail: 'Health report has not loaded.', severity: 'attention', action: 'Refresh diagnostics' }];
  const gates: ReadinessGate[] = [];
  gates.push({
    id: 'database', title: 'Local training record',
    detail: report.database.active ? `Schema ${report.database.schemaVersion} is active.` : 'Local storage is unavailable.',
    severity: report.database.active ? 'ready' : 'blocked', action: report.database.active ? undefined : 'Restart the app',
  });
  gates.push({
    id: 'runtime', title: 'Foreground recovery',
    detail: report.runtime.hasError ? 'The most recent recovery pass failed.' : `Status: ${report.runtime.status.replaceAll('_', ' ')}.`,
    severity: report.runtime.hasError ? 'attention' : 'ready', action: report.runtime.hasError ? 'Retry and reconcile' : undefined,
  });
  gates.push({
    id: 'queue', title: 'Reliable delivery queue',
    detail: report.reliability.dueNow > 0 ? `${report.reliability.dueNow} operation(s) are ready to retry.` : 'No operations require immediate retry.',
    severity: report.reliability.dueNow > 0 ? 'attention' : 'ready', action: report.reliability.dueNow > 0 ? 'Process queue' : undefined,
  });
  gates.push({
    id: 'calendar', title: 'Training calendar',
    detail: report.calendar.connected ? `${report.calendar.eventCount} event(s) available.` : 'Optional calendar connection is not active.',
    severity: report.calendar.hasError ? 'attention' : 'ready', action: report.calendar.hasError ? 'Review calendar connection' : undefined,
  });
  gates.push({
    id: 'strava', title: 'Strava',
    detail: report.strava.connected ? 'Connected and available for training context.' : 'Optional Strava connection is not active.',
    severity: report.strava.hasError ? 'attention' : 'ready', action: report.strava.hasError ? 'Review Strava connection' : undefined,
  });
  return gates;
}

export function summarizeReadiness(gates: ReadinessGate[]): { severity: ReadinessSeverity; ready: number; attention: number; blocked: number } {
  const ready = gates.filter(g => g.severity === 'ready').length;
  const attention = gates.filter(g => g.severity === 'attention').length;
  const blocked = gates.filter(g => g.severity === 'blocked').length;
  return { severity: blocked > 0 ? 'blocked' : attention > 0 ? 'attention' : 'ready', ready, attention, blocked };
}

export function buildFeedbackContext(input: { route: string; accountMode?: string }) {
  return {
    appVersion: APP_VERSION,
    releaseChannel: RELEASE_CHANNEL,
    platform: 'mobile',
    route: input.route,
    accountMode: input.accountMode ?? 'signed_out',
    capturedAt: new Date().toISOString(),
  };
}
