/**
 * UTC query boundaries conservatively enclosing an athlete-local Monday-Sunday
 * window, including UTC+14/UTC-12 zones and daylight-saving transitions.
 * This is a QUERY envelope, not an inference that records outside the local
 * week belong in that week's exposure totals.
 */
export interface TrainingSourceQueryEnvelope {
  from: string;
  to: string;
  localWeekStart: string;
  localWeekEnd: string;
}
const MS = 86_400_000;
function dayNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid YYYY-MM-DD');
  const utc = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid calendar date');
  }
  return utc / MS;
}
function dateOf(day: number): string {
  return new Date(day * MS).toISOString().slice(0, 10);
}
export function trainingSourceQueryEnvelope(localWeekStart: string): TrainingSourceQueryEnvelope {
  const day = dayNumber(localWeekStart);
  if (new Date(day * MS).getUTCDay() !== 1) throw new Error('Training week must start Monday.');
  return {
    localWeekStart,
    localWeekEnd: dateOf(day + 6),
    from: new Date((day - 2) * MS).toISOString(),
    to: new Date((day + 9) * MS).toISOString(),
  };
}
