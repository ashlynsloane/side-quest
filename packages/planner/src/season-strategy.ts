import type { CoachSemanticStrategyChange } from './coach-semantic-frame';
import { coachStrategyAppliesToWeek, coachStrategyWindowStateForWeek, type CoachStrategyWindowState } from './coach-strategy-window';

export interface SeasonStrategyEntry {
  id: string;
  strategy: CoachSemanticStrategyChange;
  approvedAt?: string;
  sourceTurnId?: string;
}

export interface SeasonStrategyScheduleValidation {
  valid: boolean;
  errors: string[];
}

export interface SeasonStrategyWeekResolution {
  entry?: SeasonStrategyEntry;
  state?: CoachStrategyWindowState;
}

export function validateSeasonStrategySchedule(entries: SeasonStrategyEntry[]): SeasonStrategyScheduleValidation {
  const errors: string[] = [];
  const ids = new Set<string>();
  const ordered = [...entries].sort(compareEntries);

  if (entries.length > 16) errors.push('A season strategy can contain at most 16 approved windows.');

  for (const entry of ordered) {
    if (!entry.id.trim()) errors.push('Every season strategy window requires an id.');
    if (ids.has(entry.id)) errors.push(`Duplicate season strategy window id: ${entry.id}.`);
    ids.add(entry.id);
    if (entry.strategy.startsAt && entry.strategy.endsAt && entry.strategy.endsAt < entry.strategy.startsAt) {
      errors.push(`Strategy window ${entry.id} ends before it starts.`);
    }
  }

  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const right = ordered[rightIndex]!;
      if (strategyWindowsSharePlanningWeek(left.strategy, right.strategy)) {
        errors.push(`Strategy windows ${left.id} and ${right.id} overlap the same planning week.`);
      }
    }
  }

  const openEnded = ordered.filter((entry) => !entry.strategy.endsAt);
  if (openEnded.length > 1) errors.push('Only one approved strategy window can be open-ended.');
  if (openEnded.length === 1) {
    const open = openEnded[0]!;
    const later = ordered.find((entry) => entry.id !== open.id && startsAfter(entry.strategy, open.strategy));
    if (later) errors.push(`Open-ended strategy window ${open.id} must be the final season strategy window.`);
  }

  return { valid: errors.length === 0, errors: unique(errors) };
}

export function resolveSeasonStrategyForWeek(
  entries: SeasonStrategyEntry[],
  weekStartDate: string,
): SeasonStrategyWeekResolution {
  const active = entries.filter((entry) => coachStrategyAppliesToWeek(entry.strategy, weekStartDate));
  if (active.length > 1) {
    throw new Error(`Multiple approved strategy windows apply to week ${weekStartDate}.`);
  }
  if (active[0]) return { entry: cloneEntry(active[0]), state: 'active' };

  const next = [...entries]
    .filter((entry) => coachStrategyWindowStateForWeek(entry.strategy, weekStartDate) === 'scheduled')
    .sort(compareEntries)[0];
  if (next) return { entry: cloneEntry(next), state: 'scheduled' };

  const previous = [...entries]
    .filter((entry) => coachStrategyWindowStateForWeek(entry.strategy, weekStartDate) === 'expired')
    .sort(compareEntries)
    .at(-1);
  return previous ? { entry: cloneEntry(previous), state: 'expired' } : {};
}

export function activeSeasonStrategyForWeek(
  entries: SeasonStrategyEntry[],
  weekStartDate: string,
): SeasonStrategyEntry | undefined {
  const resolution = resolveSeasonStrategyForWeek(entries, weekStartDate);
  return resolution.state === 'active' ? resolution.entry : undefined;
}

export function upsertSeasonStrategyEntry(
  entries: SeasonStrategyEntry[],
  next: SeasonStrategyEntry,
): SeasonStrategyEntry[] {
  const sameIdIndex = entries.findIndex((entry) => entry.id === next.id);
  const candidate = sameIdIndex >= 0
    ? entries.map((entry, index) => index === sameIdIndex ? cloneEntry(next) : cloneEntry(entry))
    : [...entries.map(cloneEntry), cloneEntry(next)];
  const validation = validateSeasonStrategySchedule(candidate);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  return candidate.sort(compareEntries);
}

export function removeSeasonStrategyEntry(entries: SeasonStrategyEntry[], id: string): SeasonStrategyEntry[] {
  return entries.filter((entry) => entry.id !== id).map(cloneEntry).sort(compareEntries);
}

export function strategyWindowsSharePlanningWeek(
  left: CoachSemanticStrategyChange,
  right: CoachSemanticStrategyChange,
): boolean {
  const leftStart = planningWeekStart(left.startsAt) ?? '0000-00-00';
  const leftEnd = planningWeekStart(left.endsAt) ?? '9999-12-31';
  const rightStart = planningWeekStart(right.startsAt) ?? '0000-00-00';
  const rightEnd = planningWeekStart(right.endsAt) ?? '9999-12-31';
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function planningWeekStart(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return undefined;
  const day = date.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function seasonStrategyEntryLabel(entry: SeasonStrategyEntry): string {
  const focus = entry.strategy.primaryFocus
    ?? Object.entries(entry.strategy.disciplineObjectives).find(([, objective]) => objective === 'maximize' || objective === 'primary_focus')?.[0];
  return focus ? `${titleCase(focus)} focus` : 'Strategy window';
}

function compareEntries(left: SeasonStrategyEntry, right: SeasonStrategyEntry): number {
  const leftStart = planningWeekStart(left.strategy.startsAt) ?? '0000-00-00';
  const rightStart = planningWeekStart(right.strategy.startsAt) ?? '0000-00-00';
  return leftStart.localeCompare(rightStart) || left.id.localeCompare(right.id);
}

function startsAfter(candidate: CoachSemanticStrategyChange, reference: CoachSemanticStrategyChange): boolean {
  if (!candidate.startsAt) return false;
  if (!reference.startsAt) return true;
  return candidate.startsAt > reference.startsAt;
}

function cloneEntry(entry: SeasonStrategyEntry): SeasonStrategyEntry {
  return {
    ...entry,
    strategy: {
      ...entry.strategy,
      disciplineObjectives: { ...entry.strategy.disciplineObjectives },
      racePriority: entry.strategy.racePriority ? { ...entry.strategy.racePriority } : undefined,
    },
  };
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
