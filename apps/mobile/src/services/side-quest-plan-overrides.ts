import type { TrainingCalendarEvent } from '@circuit/domain';
import type { AdjustmentOption } from '@circuit/planner';
import Storage from 'expo-sqlite/kv-store';

const OVERRIDES_KEY = 'circuit.side-quest-plan-overrides.v1';

export interface SideQuestPlanSessionOverride {
  eventId: string;
  baseEvent: TrainingCalendarEvent;
  option: AdjustmentOption;
  createdAt: string;
}

export function listSideQuestPlanSessionOverrides(): SideQuestPlanSessionOverride[] {
  const saved = Storage.getItemSync(OVERRIDES_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved) as SideQuestPlanSessionOverride[];
    return Array.isArray(parsed) ? parsed.filter(isValidOverride) : [];
  } catch {
    return [];
  }
}

export function getSideQuestPlanSessionOverride(eventId: string): SideQuestPlanSessionOverride | null {
  return listSideQuestPlanSessionOverrides().find((item) => item.eventId === eventId) ?? null;
}

export function saveSideQuestPlanSessionOverride(
  event: TrainingCalendarEvent,
  option: AdjustmentOption,
): SideQuestPlanSessionOverride {
  const override: SideQuestPlanSessionOverride = {
    eventId: event.id,
    baseEvent: event,
    option,
    createdAt: new Date().toISOString(),
  };
  const existing = listSideQuestPlanSessionOverrides().filter((item) => item.eventId !== event.id);
  Storage.setItemSync(OVERRIDES_KEY, JSON.stringify([...existing, override]));
  return override;
}

export function clearSideQuestPlanSessionOverride(eventId: string): void {
  const next = listSideQuestPlanSessionOverrides().filter((item) => item.eventId !== eventId);
  Storage.setItemSync(OVERRIDES_KEY, JSON.stringify(next));
}

export function resolveSideQuestPlanOverrideEvent(
  override: SideQuestPlanSessionOverride,
): TrainingCalendarEvent | null {
  const { baseEvent, option } = override;
  if (option.action === 'skip') return null;

  const originalDuration = eventDurationMinutes(baseEvent);
  const durationMinutes = Math.max(1, option.durationMinutes ?? originalDuration);
  const targetDate = option.action === 'move' ? option.targetDate : undefined;
  if (option.action === 'move' && !targetDate) return baseEvent;

  const startAt = targetDate ? replaceIsoDate(baseEvent.startAt, targetDate) : baseEvent.startAt;
  const endAt = new Date(new Date(startAt).getTime() + durationMinutes * 60_000).toISOString();

  if (option.action === 'replace') {
    const discipline = option.replacementDiscipline;
    if (discipline !== 'swim' && discipline !== 'bike' && discipline !== 'run') return baseEvent;
    return {
      ...baseEvent,
      startAt,
      endAt,
      discipline,
      title: `Easy ${disciplineLabel(discipline)}`,
      description: `Side Quest adaptation · ${option.title}\n${option.description}`,
    };
  }

  if (option.action === 'modify' && option.id.startsWith('easier_')) {
    const discipline = baseEvent.discipline === 'swim' || baseEvent.discipline === 'bike' || baseEvent.discipline === 'run'
      ? baseEvent.discipline
      : 'other';
    return {
      ...baseEvent,
      startAt,
      endAt,
      title: discipline === 'other' ? `Easy ${baseEvent.title}` : `Easy ${disciplineLabel(discipline)}`,
      description: `Side Quest adaptation · ${option.title}\n${option.description}`,
    };
  }

  return {
    ...baseEvent,
    startAt,
    endAt,
    description: appendLine(baseEvent.description, `Side Quest adaptation · ${option.title}`),
  };
}

export function effectiveSideQuestPlanEvents(events: TrainingCalendarEvent[]): TrainingCalendarEvent[] {
  const overrides = new Map(listSideQuestPlanSessionOverrides().map((item) => [item.eventId, item]));
  const resolved: TrainingCalendarEvent[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    const override = overrides.get(event.id);
    if (!override) {
      resolved.push(event);
      seen.add(event.id);
      continue;
    }
    const effective = resolveSideQuestPlanOverrideEvent(override);
    if (effective) resolved.push(effective);
    seen.add(event.id);
  }

  for (const override of overrides.values()) {
    if (seen.has(override.eventId)) continue;
    const effective = resolveSideQuestPlanOverrideEvent(override);
    if (effective) resolved.push(effective);
  }

  return resolved;
}

function isValidOverride(value: SideQuestPlanSessionOverride): boolean {
  return Boolean(value?.eventId && value?.baseEvent?.id && value?.option?.id && value?.option?.action);
}

function eventDurationMinutes(event: TrainingCalendarEvent): number {
  if (!event.endAt) return 60;
  const duration = Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000);
  return Number.isFinite(duration) && duration > 0 ? duration : 60;
}

function replaceIsoDate(value: string, date: string): string {
  const index = value.indexOf('T');
  return index >= 0 ? `${date}${value.slice(index)}` : `${date}T12:00:00.000Z`;
}

function disciplineLabel(discipline: 'swim' | 'bike' | 'run'): string {
  if (discipline === 'swim') return 'swim';
  if (discipline === 'bike') return 'ride';
  return 'run';
}

function appendLine(existing: string | undefined, next: string): string {
  if (!existing?.trim()) return next;
  if (existing.includes(next)) return existing;
  return `${existing}\n${next}`;
}
