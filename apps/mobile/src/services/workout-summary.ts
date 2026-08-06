import type { BodyRegion, GeneratedWorkout } from '@circuit/domain';
import { Share } from 'react-native';
import type { LoggedSet, WorkoutLedgerEntry } from './database';

export type WorkoutShareOptions = {
  includeDuration: boolean;
  includeTrainedAreas: boolean;
  includeCategories: boolean;
  includeExerciseList: boolean;
  includeReps: boolean;
  includeLoads: boolean;
};

export const DEFAULT_WORKOUT_SHARE_OPTIONS: WorkoutShareOptions = {
  includeDuration: true,
  includeTrainedAreas: true,
  includeCategories: true,
  includeExerciseList: false,
  includeReps: false,
  includeLoads: false,
};

export type CompletedWorkoutSummary = {
  name: string;
  completedAt: string;
  durationMinutes: number;
  stationCount: number;
  totalRounds: number;
  equipment: string[];
  categories: string[];
  exercises: Array<{
    name: string;
    sets: LoggedSet[];
  }>;
  regionLoads: Partial<Record<BodyRegion, number>>;
  topRegions: BodyRegion[];
};

export function buildCompletedWorkoutSummary(input: {
  workout: GeneratedWorkout;
  completedAt?: string;
  durationMinutes: number;
  stationRounds: Record<string, number>;
  exerciseSets: Record<string, LoggedSet[]>;
}): CompletedWorkoutSummary {
  const { workout, exerciseSets, stationRounds } = input;
  const regionLoads: Partial<Record<BodyRegion, number>> = {};
  const categories = new Set<string>();
  const completedExercises: CompletedWorkoutSummary['exercises'] = [];

  for (const station of workout.stations) {
    for (const item of station.exercises) {
      const sets = (exerciseSets[item.exerciseId] ?? []).filter((set) => set.completed);
      const fallbackCompleted = (stationRounds[station.id] ?? 0) > 0;
      if (!sets.length && !fallbackCompleted) continue;
      const completedSetCount = Math.max(1, sets.length || stationRounds[station.id] || 1);
      completedExercises.push({ name: item.exerciseSnapshot.name, sets });
      categories.add(categoryLabel(item.exerciseSnapshot.category));
      for (const region of item.exerciseSnapshot.bodyRegions) {
        const roleFactor = region.role === 'primary' ? 1 : region.role === 'secondary' ? 0.62 : 0.34;
        const contribution = Math.max(0.25, region.load) * roleFactor * completedSetCount;
        regionLoads[region.region] = (regionLoads[region.region] ?? 0) + contribution;
      }
    }
  }

  const maxLoad = Math.max(1, ...Object.values(regionLoads).filter((value): value is number => typeof value === 'number'));
  for (const region of Object.keys(regionLoads) as BodyRegion[]) {
    regionLoads[region] = Math.min(1, (regionLoads[region] ?? 0) / maxLoad);
  }
  const topRegions = (Object.entries(regionLoads) as Array<[BodyRegion, number]>)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([region]) => region);

  return {
    name: workout.name,
    completedAt: input.completedAt ?? new Date().toISOString(),
    durationMinutes: Math.max(1, Math.round(input.durationMinutes)),
    stationCount: workout.stations.length,
    totalRounds: Object.values(stationRounds).reduce((sum, value) => sum + value, 0),
    equipment: workout.requiredEquipment.filter((item) => item !== 'bodyweight').map(equipmentLabel),
    categories: [...categories].slice(0, 4),
    exercises: completedExercises,
    regionLoads,
    topRegions,
  };
}

export function buildLedgerWorkoutSummary(entry: WorkoutLedgerEntry): CompletedWorkoutSummary {
  const regionLoads: Partial<Record<BodyRegion, number>> = {};
  const categories = new Set<string>();
  for (const exercise of entry.exercises) {
    const setCount = Math.max(1, exercise.sets.filter((set) => set.completed).length);
    for (const region of exercise.bodyRegions) {
      const roleFactor = region.role === 'primary' ? 1 : region.role === 'secondary' ? 0.62 : 0.34;
      regionLoads[region.region] = (regionLoads[region.region] ?? 0) + Math.max(0.25, region.load) * roleFactor * setCount;
    }
    exercise.movementPatterns.slice(0, 2).forEach((pattern) => categories.add(categoryLabel(pattern)));
  }
  const maxLoad = Math.max(1, ...Object.values(regionLoads).filter((value): value is number => typeof value === 'number'));
  for (const region of Object.keys(regionLoads) as BodyRegion[]) regionLoads[region] = Math.min(1, (regionLoads[region] ?? 0) / maxLoad);
  const topRegions = (Object.entries(regionLoads) as Array<[BodyRegion, number]>).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([region])=>region);
  const durationMinutes = Math.max(1, Math.round((new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime()) / 60_000));
  return {
    name: entry.name,
    completedAt: entry.completedAt,
    durationMinutes,
    stationCount: entry.workout?.stations.length ?? 0,
    totalRounds: Object.values(entry.stationRounds).reduce((sum, value) => sum + value, 0),
    equipment: [...new Set(entry.exercises.map((item) => item.equipmentId).filter(Boolean).map((item) => equipmentLabel(String(item))))],
    categories: [...categories].slice(0,4),
    exercises: entry.exercises.map((item) => ({ name: item.name, sets: item.sets })),
    regionLoads,
    topRegions,
  };
}

export async function shareCompletedWorkout(summary: CompletedWorkoutSummary, options: WorkoutShareOptions): Promise<void> {
  const message = workoutShareMessage(summary, options);
  const svg = workoutShareSvg(summary, options);
  const url = `data:image/svg+xml;base64,${encodeAsciiBase64(svg)}`;
  try {
    await Share.share({ title: summary.name, message, url });
  } catch {
    await Share.share({ title: summary.name, message });
  }
}

export function workoutShareMessage(summary: CompletedWorkoutSummary, options: WorkoutShareOptions): string {
  const lines = [summary.name];
  if (options.includeDuration) lines.push(`${summary.durationMinutes} min · ${summary.stationCount} stations${summary.totalRounds ? ` · ${summary.totalRounds} rounds` : ''}`);
  if (options.includeTrainedAreas && summary.topRegions.length) lines.push(`Areas trained: ${summary.topRegions.map(regionLabel).join(', ')}`);
  if (options.includeCategories && summary.categories.length) lines.push(summary.categories.join(' · '));
  if (options.includeExerciseList && summary.exercises.length) {
    lines.push('', ...summary.exercises.slice(0, 10).map((exercise) => exerciseLine(exercise, options)));
  }
  lines.push('', 'Side Quest');
  return lines.join('\n');
}

function exerciseLine(exercise: CompletedWorkoutSummary['exercises'][number], options: WorkoutShareOptions): string {
  const details: string[] = [];
  if (options.includeReps) {
    const reps = exercise.sets.map((set) => set.reps ?? (set.seconds ? `${set.seconds}s` : undefined)).filter(Boolean);
    if (reps.length) details.push(reps.join('/'));
  }
  if (options.includeLoads) {
    const load = exercise.sets.find((set) => set.loadValue)?.loadValue;
    const unit = exercise.sets.find((set) => set.loadValue)?.loadUnit;
    if (load) details.push(`${load} ${unit ?? 'lb'}`);
  }
  return `• ${exercise.name}${details.length ? ` — ${details.join(' · ')}` : ''}`;
}

function workoutShareSvg(summary: CompletedWorkoutSummary, options: WorkoutShareOptions): string {
  const accent = '#0D513D';
  const navy = '#062B5C';
  const muted = '#68766F';
  const top = summary.topRegions.slice(0, 6);
  const labels = top.map((region, index) => `<text x="620" y="${390 + index * 48}" font-size="27" font-family="Arial" fill="${navy}">• ${escapeXml(regionLabel(region))}</text>`).join('');
  const exerciseText = options.includeExerciseList ? summary.exercises.slice(0, 5).map((item, index) => `<text x="72" y="${790 + index * 38}" font-size="22" font-family="Arial" fill="${navy}">${escapeXml(exerciseLine(item, options).slice(0, 46))}</text>`).join('') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" rx="54" fill="#F5F6F3"/>
  <rect x="36" y="36" width="1008" height="1008" rx="44" fill="#FFFFFF" stroke="#D4DDD7" stroke-width="3"/>
  <text x="72" y="112" font-size="28" font-family="Arial" font-weight="700" fill="${accent}" letter-spacing="4">SIDE QUEST</text>
  <text x="72" y="190" font-size="52" font-family="Arial" font-weight="800" fill="${navy}">${escapeXml(summary.name.slice(0, 31))}</text>
  ${options.includeDuration ? `<text x="72" y="248" font-size="30" font-family="Arial" fill="${muted}">${summary.durationMinutes} min · ${summary.stationCount} stations${summary.totalRounds ? ` · ${summary.totalRounds} rounds` : ''}</text>` : ''}
  <rect x="72" y="300" width="480" height="410" rx="34" fill="#EAF1EC"/>
  ${bodySilhouetteSvg(188, 338, false, summary.regionLoads, accent)}
  ${bodySilhouetteSvg(368, 338, true, summary.regionLoads, accent)}
  ${options.includeTrainedAreas ? `<text x="620" y="342" font-size="24" font-family="Arial" font-weight="700" fill="${accent}" letter-spacing="2">AREAS TRAINED</text>${labels}` : ''}
  ${options.includeCategories && summary.categories.length ? `<text x="72" y="750" font-size="25" font-family="Arial" font-weight="700" fill="${accent}">${escapeXml(summary.categories.join(' · ').slice(0, 65))}</text>` : ''}
  ${exerciseText}
  <text x="72" y="1000" font-size="24" font-family="Arial" fill="${muted}">${escapeXml(new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(summary.completedAt)))}</text>
  </svg>`;
}

function bodySilhouetteSvg(x: number, y: number, back: boolean, loads: Partial<Record<BodyRegion, number>>, accent: string): string {
  const marks = Object.entries(loads).flatMap(([region, intensity]) => {
    const point = SHARE_REGION_POINTS[region as BodyRegion];
    if (!point || point.back !== back || !intensity) return [];
    return [`<ellipse cx="${x + point.x}" cy="${y + point.y}" rx="${point.rx}" ry="${point.ry}" fill="${accent}" opacity="${(0.32 + intensity * 0.68).toFixed(2)}"/>`];
  }).join('');
  return `<g><circle cx="${x+60}" cy="${y+35}" r="25" fill="#DCE2DE" stroke="#AAB5AE" stroke-width="3"/><path d="M${x+60} ${y+62} C${x+22} ${y+82},${x+20} ${y+170},${x+34} ${y+236} L${x+20} ${y+355} L${x+52} ${y+355} L${x+60} ${y+245} L${x+68} ${y+355} L${x+100} ${y+355} L${x+86} ${y+236} C${x+100} ${y+170},${x+98} ${y+82},${x+60} ${y+62}Z" fill="#EEF1EF" stroke="#AAB5AE" stroke-width="3"/>${marks}</g>`;
}

const SHARE_REGION_POINTS: Record<BodyRegion, { x:number; y:number; rx:number; ry:number; back:boolean }> = {
  chest:{x:60,y:112,rx:29,ry:22,back:false}, shoulders:{x:60,y:87,rx:45,ry:16,back:false}, upper_back:{x:60,y:112,rx:36,ry:27,back:true}, lats:{x:60,y:145,rx:38,ry:34,back:true}, biceps:{x:22,y:135,rx:13,ry:28,back:false}, triceps:{x:22,y:135,rx:13,ry:28,back:true}, forearms_grip:{x:15,y:190,rx:10,ry:31,back:false}, core_anterior:{x:60,y:163,rx:26,ry:43,back:false}, core_lateral:{x:60,y:176,rx:38,ry:35,back:true}, core_rotation:{x:60,y:176,rx:37,ry:36,back:false}, lower_back:{x:60,y:190,rx:27,ry:25,back:true}, glutes:{x:60,y:226,rx:35,ry:25,back:true}, hamstrings:{x:60,y:275,rx:37,ry:47,back:true}, quadriceps:{x:60,y:275,rx:37,ry:47,back:false}, hip_abductors:{x:60,y:226,rx:46,ry:22,back:true}, hip_adductors:{x:60,y:254,rx:22,ry:35,back:false}, hip_flexors:{x:60,y:220,rx:27,ry:20,back:false}, gastrocnemius:{x:60,y:330,rx:34,ry:32,back:true}, soleus:{x:60,y:347,rx:28,ry:22,back:true}, tibialis_anterior:{x:60,y:330,rx:31,ry:31,back:false}, feet_ankles:{x:60,y:363,rx:45,ry:15,back:false},
};

export function regionLabel(region: BodyRegion): string {
  return region.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase()).replace('Gastrocnemius','Calves').replace('Hip Abductors','Lateral Hips');
}
function categoryLabel(value: string): string { return value.replaceAll('_',' ').replace(/\b\w/g, (character)=>character.toUpperCase()); }
function equipmentLabel(value: string): string { return value.replaceAll('_',' ').replace(/\b\w/g, (character)=>character.toUpperCase()); }
function escapeXml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' })[character]!); }
function encodeAsciiBase64(value: string): string {
  const ascii = value.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(ascii);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (let index = 0; index < ascii.length; index += 3) {
    const a = ascii.charCodeAt(index); const b = ascii.charCodeAt(index+1); const c = ascii.charCodeAt(index+2);
    output += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)] + (Number.isNaN(b) ? '=' : alphabet[((b & 15) << 2) | (c >> 6)]) + (Number.isNaN(c) ? '=' : alphabet[c & 63]);
  }
  return output;
}
