/** Deterministic athlete-calendar date arithmetic, not UTC timestamp inference. */
const DAY = 86_400_000;
function ordinal(ymd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error('Expected YYYY-MM-DD');
  const epoch = Date.parse(ymd + 'T00:00:00Z');
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== ymd) {
    throw new Error('Invalid local calendar date');
  }
  return epoch / DAY;
}
function ymd(day: number): string { return new Date(day * DAY).toISOString().slice(0, 10); }
export function addLocalCalendarDays(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error('Days must be an integer');
  return ymd(ordinal(date) + days);
}
export function localCalendarDate(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date');
  return date.getFullYear() + '-'
    + String(date.getMonth() + 1).padStart(2, '0') + '-'
    + String(date.getDate()).padStart(2, '0');
}
/** Next Monday (not today's Monday), in the runtime's local calendar. */
export function nextLocalMonday(now: Date = new Date()): string {
  const current = localCalendarDate(now);
  const weekday = new Date(ordinal(current) * DAY).getUTCDay();
  return addLocalCalendarDays(current, weekday === 0 ? 1 : 8 - weekday);
}
export function localMondayOf(date: string): string {
  const current = ordinal(date);
  const weekday = new Date(current * DAY).getUTCDay();
  return ymd(current - ((weekday + 6) % 7));
}
