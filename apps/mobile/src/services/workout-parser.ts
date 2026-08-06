import type { EquipmentId, Exercise } from '@circuit/domain';
import type { LoadBasis, LoggedExercise, LoggedSet } from './database';

export interface ParsedWorkoutDraft {
  name: string;
  exercises: LoggedExercise[];
  warnings: string[];
  rawText: string;
}

const ALIAS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bbar\s+rdls?\b/gi, 'barbell Romanian deadlift'],
  [/\bbb\s*rdls?\b/gi, 'barbell Romanian deadlift'],
  [/\bdb\s*rdls?\b/gi, 'dumbbell Romanian deadlift'],
  [/\bkb\s*rdls?\b/gi, 'kettlebell Romanian deadlift'],
  [/\brdls?\b/gi, 'Romanian deadlift'],
  [/\bohp\b/gi, 'overhead press'],
  [/\bdb\b/gi, 'dumbbell'],
  [/\bkb\b/gi, 'kettlebell'],
  [/\bbb\b/gi, 'barbell'],
  [/\bbw\b/gi, 'bodyweight'],
  [/\bsl\b/gi, 'single-leg'],
];

export function parseWorkoutDescription(rawText: string, catalog: Exercise[]): ParsedWorkoutDraft {
  const normalized = ALIAS_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), rawText)
    .replace(/(?:lbs|pounds?)\b/gi, 'lb')
    .replace(/\bkilos?\b/gi, 'kg')
    .replace(/\s+/g, ' ')
    .trim();

  const segments = normalized
    .split(/\s*(?:\n|;|\bthen\b|\band then\b|\bafter that\b)\s*/i)
    .flatMap((segment) => splitConservativeAnd(segment))
    .map((segment) => segment.trim())
    .filter(Boolean);

  const warnings: string[] = [];
  const exercises = segments.flatMap((segment, index) => {
    const parsed = parseSegment(segment, catalog, index);
    if (!parsed) {
      warnings.push(`Could not confidently interpret “${segment}”. Add or edit it manually before saving.`);
      return [unmatchedExercise(segment, index)];
    }
    if (parsed.matchConfidence !== 'exact') {
      warnings.push(`Review the match for “${segment}” → ${parsed.name}.`);
    }
    return [parsed];
  });

  return {
    name: inferWorkoutName(exercises),
    exercises,
    warnings,
    rawText,
  };
}

function splitConservativeAnd(segment: string): string[] {
  const parts = segment.split(/\s+and\s+/i);
  if (parts.length <= 1) return [segment];
  return parts.every((part) => /\d/.test(part)) ? parts : [segment];
}

function parseSegment(segment: string, catalog: Exercise[], index: number): LoggedExercise | null {
  const scheme = extractScheme(segment);
  const exerciseText = removeSchemeTokens(segment).trim();
  const match = matchExercise(exerciseText, catalog);
  if (!match) return null;
  const equipmentId = detectEquipment(segment, match.exercise);
  const sets = buildSets({ ...scheme, equipmentId }, index);
  return {
    id: `draft_exercise_${index}_${Date.now()}`,
    exerciseId: match.exercise.id,
    name: match.exercise.name,
    equipmentId,
    sets,
    bodyRegions: match.exercise.bodyRegions,
    movementPatterns: match.exercise.movementPatterns,
    matchConfidence: match.confidence,
  };
}

function extractScheme(text: string): {
  sets: number;
  reps?: number;
  seconds?: number;
  loadValue?: number;
  loadUnit?: 'lb' | 'kg';
  loadBasis?: LoadBasis;
} {
  const duration = text.match(/(?:(\d+)\s*sets?\s*(?:of\s*)?)?(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?)\b/i);
  const nested = text.match(/(\d+)\s*[x×]\s*\(?\s*(\d+)\s*[x×@]\s*(\d+(?:\.\d+)?)\s*(lb|kg)\s*\)?/i);
  const standardLoaded = text.match(/(\d+)\s*[x×]\s*(\d+)\s*(?:reps?\s*)?(?:at|@|[x×])\s*(\d+(?:\.\d+)?)\s*(lb|kg)/i);
  const setsReps = text.match(/(\d+)\s*[x×]\s*(\d+)(?!\s*(?:lb|kg))/i)
    ?? text.match(/(\d+)\s*sets?\s*(?:of\s*)?(\d+)/i);
  const load = text.match(/(?:at|@|with|using|[x×])?\s*(\d+(?:\.\d+)?)\s*(lb|kg)\b/i);
  const bodyweight = /\b(?:bodyweight|no weights?|unweighted)\b/i.test(text);
  const each = /\b(?:each hand|per hand|per dumbbell)\b/i.test(text);
  const total = /\b(?:total|including (?:the )?bar|bar weight)\b/i.test(text);

  if (nested) return {
    sets: Number(nested[1]), reps: Number(nested[2]), loadValue: Number(nested[3]),
    loadUnit: nested[4].toLowerCase() as 'lb' | 'kg', loadBasis: total ? 'total' : undefined,
  };
  if (standardLoaded) return {
    sets: Number(standardLoaded[1]), reps: Number(standardLoaded[2]), loadValue: Number(standardLoaded[3]),
    loadUnit: standardLoaded[4].toLowerCase() as 'lb' | 'kg', loadBasis: total ? 'total' : each ? 'each_hand' : undefined,
  };
  if (duration) {
    const amount = Number(duration[2]);
    const unit = duration[3].toLowerCase();
    return { sets: Number(duration[1] ?? 1), seconds: unit.startsWith('min') ? amount * 60 : amount };
  }
  return {
    sets: Number(setsReps?.[1] ?? 1),
    reps: Number(setsReps?.[2] ?? firstStandaloneRep(text) ?? 10),
    loadValue: bodyweight ? undefined : load ? Number(load[1]) : undefined,
    loadUnit: bodyweight ? undefined : load ? load[2].toLowerCase() as 'lb' | 'kg' : undefined,
    loadBasis: bodyweight ? 'bodyweight' : total ? 'total' : each ? 'each_hand' : undefined,
  };
}

function firstStandaloneRep(text: string): number | undefined {
  const match = text.match(/\b(\d+)\s*reps?\b/i);
  return match ? Number(match[1]) : undefined;
}

function removeSchemeTokens(text: string): string {
  return text
    .replace(/(\d+)\s*[x×]\s*\(?\s*(\d+)\s*[x×@]\s*(\d+(?:\.\d+)?)\s*(lb|kg)\s*\)?/gi, ' ')
    .replace(/(\d+)\s*[x×]\s*(\d+)\s*(?:reps?\s*)?(?:at|@|[x×])\s*(\d+(?:\.\d+)?)\s*(lb|kg)/gi, ' ')
    .replace(/\b\d+\s*sets?\s*(?:of\s*)?\d+\b/gi, ' ')
    .replace(/\b\d+\s*[x×]\s*\d+\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:lb|kg)\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:seconds?|secs?|minutes?|mins?|reps?)\b/gi, ' ')
    .replace(/\b(?:at|with|using|bodyweight|no weights?|unweighted|each hand|per hand|total|including the bar)\b/gi, ' ')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ');
}

function matchExercise(text: string, catalog: Exercise[]): { exercise: Exercise; confidence: 'exact' | 'likely' } | null {
  const query = normalize(text);
  if (!query) return null;
  const scored = catalog.map((exercise) => {
    const candidates = [exercise.name, ...exercise.aliases].map(normalize);
    const exact = candidates.some((candidate) => candidate === query);
    const containment = candidates.some((candidate) => candidate.includes(query) || query.includes(candidate));
    const overlap = Math.max(...candidates.map((candidate) => tokenOverlap(query, candidate)));
    return { exercise, exact, score: exact ? 1_000 : containment ? 500 + overlap : overlap };
  }).sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best || best.score < 35) return null;
  return { exercise: best.exercise, confidence: best.exact ? 'exact' : 'likely' };
}

function tokenOverlap(left: string, right: string): number {
  const a = new Set(left.split(' ').filter(Boolean));
  const b = new Set(right.split(' ').filter(Boolean));
  const common = [...a].filter((token) => b.has(token)).length;
  return common / Math.max(1, Math.max(a.size, b.size)) * 100;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(?:the|a|an|exercise|reps?|sets?)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectEquipment(text: string, exercise: Exercise): EquipmentId | undefined {
  const lower = text.toLowerCase();
  const rules: Array<[RegExp, EquipmentId]> = [
    [/\bbarbell\b/, 'barbell'], [/\bdumbbell\b/, 'dumbbell'], [/\bkettlebell\b/, 'kettlebell'],
    [/\bmedicine ball\b/, 'medicine_ball'], [/\bbosu\b/, 'bosu'], [/\bmini band\b|\bloop band\b/, 'mini_band'],
    [/\blong band\b|\bresistance band\b/, 'long_band'], [/\bslider\b|\bslides\b/, 'slider'], [/\btrx\b|\bsuspension\b/, 'trx'],
  ];
  for (const [pattern, id] of rules) if (pattern.test(lower)) return id;
  return exercise.equipmentOptions.flatMap((option) => option.items).find((item) => item.equipmentId !== 'bodyweight')?.equipmentId
    ?? exercise.equipmentOptions[0]?.items[0]?.equipmentId;
}

function buildSets(input: ReturnType<typeof extractScheme> & { equipmentId?: EquipmentId }, index: number): LoggedSet[] {
  const basis = input.loadBasis ?? defaultBasis(input.equipmentId, input.loadValue);
  return Array.from({ length: Math.max(1, Math.min(20, input.sets)) }, (_, setIndex) => ({
    id: `draft_set_${index}_${setIndex}_${Date.now()}`,
    reps: input.reps,
    seconds: input.seconds,
    loadValue: input.loadValue,
    loadUnit: input.loadUnit,
    loadBasis: basis,
    completed: true,
  }));
}

function defaultBasis(equipmentId: EquipmentId | undefined, loadValue: number | undefined): LoadBasis {
  if (equipmentId === 'bodyweight') return 'bodyweight';
  if (equipmentId === 'long_band' || equipmentId === 'mini_band') return 'band_level';
  if (equipmentId === 'dumbbell') return 'each_hand';
  if (equipmentId === 'barbell' || equipmentId === 'trap_bar') return 'total';
  if (equipmentId) return 'single_implement';
  return loadValue === undefined ? 'not_recorded' : 'single_implement';
}

function unmatchedExercise(segment: string, index: number): LoggedExercise {
  const scheme = extractScheme(segment);
  return {
    id: `draft_unmatched_${index}_${Date.now()}`,
    name: removeSchemeTokens(segment).trim() || `Unmatched exercise ${index + 1}`,
    sets: buildSets(scheme, index),
    bodyRegions: [],
    movementPatterns: [],
    matchConfidence: 'unmatched',
    notes: segment,
  };
}

function inferWorkoutName(exercises: LoggedExercise[]): string {
  if (!exercises.length) return 'Outside strength workout';
  if (exercises.length === 1) return `${exercises[0]!.name} session`;
  return `Outside strength workout · ${exercises.length} exercises`;
}
