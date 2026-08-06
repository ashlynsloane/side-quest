import type {
  AvoidanceTag,
  BodyRegion,
  JointRegion,
  MovementPattern,
  PainAreaSelection,
  PainAreaSide,
  RegionProtectionMode,
  RegionRestriction,
} from '@circuit/domain';

export type PainBodyView = 'front' | 'back';

export type PainAreaDefinition = {
  id: string;
  label: string;
  shortLabel: string;
  plainLanguage: string;
  searchTerms: string[];
  view: PainBodyView;
  side: PainAreaSide;
  x: number;
  y: number;
  width: number;
  height: number;
  regions: Array<BodyRegion | JointRegion>;
  penaltyRegions: BodyRegion[];
  suggestedPatterns: MovementPattern[];
  suggestedTags: AvoidanceTag[];
};

const front = (
  id: string,
  label: string,
  shortLabel: string,
  plainLanguage: string,
  side: PainAreaSide,
  x: number,
  y: number,
  width: number,
  height: number,
  regions: Array<BodyRegion | JointRegion>,
  penaltyRegions: BodyRegion[],
  suggestedPatterns: MovementPattern[] = [],
  suggestedTags: AvoidanceTag[] = [],
  searchTerms: string[] = [],
): PainAreaDefinition => ({ id, label, shortLabel, plainLanguage, searchTerms, view: 'front', side, x, y, width, height, regions, penaltyRegions, suggestedPatterns, suggestedTags });

const back = (
  id: string,
  label: string,
  shortLabel: string,
  plainLanguage: string,
  side: PainAreaSide,
  x: number,
  y: number,
  width: number,
  height: number,
  regions: Array<BodyRegion | JointRegion>,
  penaltyRegions: BodyRegion[],
  suggestedPatterns: MovementPattern[] = [],
  suggestedTags: AvoidanceTag[] = [],
  searchTerms: string[] = [],
): PainAreaDefinition => ({ id, label, shortLabel, plainLanguage, searchTerms, view: 'back', side, x, y, width, height, regions, penaltyRegions, suggestedPatterns, suggestedTags });

export const PAIN_AREAS: PainAreaDefinition[] = [
  front('front_neck', 'Front of neck', 'Neck', 'Front or sides of the neck', 'midline', 41, 12, 18, 8, ['neck'], [], [], [], ['throat', 'cervical']),
  front('left_front_shoulder', 'Left front shoulder', 'Front shoulder', 'Front or outer edge of the left shoulder', 'left', 19, 20, 17, 10, ['shoulders', 'shoulder'], ['shoulders'], ['vertical_push', 'horizontal_push'], ['overhead'], ['deltoid', 'rotator cuff']),
  front('right_front_shoulder', 'Right front shoulder', 'Front shoulder', 'Front or outer edge of the right shoulder', 'right', 64, 20, 17, 10, ['shoulders', 'shoulder'], ['shoulders'], ['vertical_push', 'horizontal_push'], ['overhead'], ['deltoid', 'rotator cuff']),
  front('left_chest', 'Left chest', 'Chest', 'Upper chest or pectoral area on the left', 'left', 30, 27, 18, 11, ['chest'], ['chest'], ['horizontal_push'], [], ['pec', 'pectoral']),
  front('right_chest', 'Right chest', 'Chest', 'Upper chest or pectoral area on the right', 'right', 52, 27, 18, 11, ['chest'], ['chest'], ['horizontal_push'], [], ['pec', 'pectoral']),
  front('left_biceps', 'Left upper arm', 'Upper arm', 'Front of the left upper arm', 'left', 13, 31, 12, 15, ['biceps', 'elbow'], ['biceps'], ['horizontal_pull', 'vertical_pull'], [], ['biceps', 'upper arm']),
  front('right_biceps', 'Right upper arm', 'Upper arm', 'Front of the right upper arm', 'right', 75, 31, 12, 15, ['biceps', 'elbow'], ['biceps'], ['horizontal_pull', 'vertical_pull'], [], ['biceps', 'upper arm']),
  front('left_elbow', 'Left elbow', 'Elbow', 'Front, inside, or outside of the left elbow', 'left', 12, 45, 12, 8, ['elbow'], [], ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull'], [], ['tennis elbow', 'golfer elbow']),
  front('right_elbow', 'Right elbow', 'Elbow', 'Front, inside, or outside of the right elbow', 'right', 76, 45, 12, 8, ['elbow'], [], ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull'], [], ['tennis elbow', 'golfer elbow']),
  front('left_wrist_hand', 'Left wrist or hand', 'Wrist / hand', 'Left forearm, wrist, palm, or hand', 'left', 9, 53, 16, 15, ['forearms_grip', 'wrist_hand'], ['forearms_grip'], ['carry'], ['wrist_weight_bearing'], ['grip', 'forearm']),
  front('right_wrist_hand', 'Right wrist or hand', 'Wrist / hand', 'Right forearm, wrist, palm, or hand', 'right', 75, 53, 16, 15, ['forearms_grip', 'wrist_hand'], ['forearms_grip'], ['carry'], ['wrist_weight_bearing'], ['grip', 'forearm']),
  front('front_core', 'Abdomen or front core', 'Front core', 'Abdominal wall or center of the torso', 'midline', 36, 38, 28, 17, ['core_anterior'], ['core_anterior'], ['trunk_flexion', 'anti_extension'], ['spinal_flexion'], ['abs', 'stomach', 'abdominal']),
  front('left_hip_flexor', 'Left front hip', 'Front hip', 'Front crease of the left hip or hip-flexor area', 'left', 31, 53, 15, 9, ['hip_flexors', 'hip'], ['hip_flexors'], ['lunge', 'locomotion'], [], ['iliopsoas', 'hip crease']),
  front('right_hip_flexor', 'Right front hip', 'Front hip', 'Front crease of the right hip or hip-flexor area', 'right', 54, 53, 15, 9, ['hip_flexors', 'hip'], ['hip_flexors'], ['lunge', 'locomotion'], [], ['iliopsoas', 'hip crease']),
  front('groin', 'Groin or inner hip', 'Groin', 'Inner thigh near the pelvis', 'midline', 42, 56, 16, 9, ['hip_adductors', 'hip'], ['hip_adductors'], ['lunge', 'squat'], ['single_leg_loading'], ['adductor', 'inner thigh']),
  front('left_quadriceps', 'Left front thigh', 'Quadriceps', 'Front of the left thigh', 'left', 30, 61, 16, 20, ['quadriceps'], ['quadriceps'], ['squat', 'lunge', 'locomotion'], ['deep_knee_flexion', 'single_leg_loading'], ['quad', 'thigh']),
  front('right_quadriceps', 'Right front thigh', 'Quadriceps', 'Front of the right thigh', 'right', 54, 61, 16, 20, ['quadriceps'], ['quadriceps'], ['squat', 'lunge', 'locomotion'], ['deep_knee_flexion', 'single_leg_loading'], ['quad', 'thigh']),
  front('left_knee', 'Left knee', 'Knee', 'Front, inside, or outside of the left knee', 'left', 31, 78, 15, 8, ['knee'], ['quadriceps'], ['squat', 'lunge', 'jump_hop', 'locomotion'], ['deep_knee_flexion', 'jumping', 'high_impact'], ['patella', 'kneecap']),
  front('right_knee', 'Right knee', 'Knee', 'Front, inside, or outside of the right knee', 'right', 54, 78, 15, 8, ['knee'], ['quadriceps'], ['squat', 'lunge', 'jump_hop', 'locomotion'], ['deep_knee_flexion', 'jumping', 'high_impact'], ['patella', 'kneecap']),
  front('left_shin', 'Left shin', 'Shin', 'Front or inside edge of the left lower leg', 'left', 32, 84, 13, 14, ['tibialis_anterior', 'feet_ankles'], ['tibialis_anterior', 'feet_ankles'], ['jump_hop', 'locomotion'], ['high_impact'], ['tibia', 'shin splint']),
  front('right_shin', 'Right shin', 'Shin', 'Front or inside edge of the right lower leg', 'right', 55, 84, 13, 14, ['tibialis_anterior', 'feet_ankles'], ['tibialis_anterior', 'feet_ankles'], ['jump_hop', 'locomotion'], ['high_impact'], ['tibia', 'shin splint']),
  front('left_front_ankle_foot', 'Left ankle or foot', 'Ankle / foot', 'Front of the ankle, top of the foot, or toes', 'left', 27, 95, 20, 5, ['feet_ankles', 'ankle', 'foot'], ['feet_ankles'], ['jump_hop', 'balance', 'locomotion'], ['high_impact', 'unstable_surface'], ['heel', 'plantar', 'toe']),
  front('right_front_ankle_foot', 'Right ankle or foot', 'Ankle / foot', 'Front of the ankle, top of the foot, or toes', 'right', 53, 95, 20, 5, ['feet_ankles', 'ankle', 'foot'], ['feet_ankles'], ['jump_hop', 'balance', 'locomotion'], ['high_impact', 'unstable_surface'], ['heel', 'plantar', 'toe']),

  back('back_neck', 'Back of neck', 'Neck', 'Back or sides of the neck', 'midline', 41, 11, 18, 8, ['neck'], [], [], [], ['cervical']),
  back('left_upper_trap', 'Left upper trapezius', 'Upper trap', 'Top of the left shoulder between the neck and shoulder', 'left', 25, 19, 20, 9, ['shoulders', 'upper_back', 'neck'], ['shoulders', 'upper_back'], ['carry', 'vertical_pull'], ['overhead'], ['trap', 'trapezius']),
  back('right_upper_trap', 'Right upper trapezius', 'Upper trap', 'Top of the right shoulder between the neck and shoulder', 'right', 55, 19, 20, 9, ['shoulders', 'upper_back', 'neck'], ['shoulders', 'upper_back'], ['carry', 'vertical_pull'], ['overhead'], ['trap', 'trapezius']),
  back('left_back_shoulder', 'Left back shoulder', 'Back shoulder', 'Back or outer edge of the left shoulder', 'left', 17, 24, 18, 10, ['shoulders', 'shoulder'], ['shoulders'], ['horizontal_pull', 'vertical_pull'], ['overhead'], ['rear deltoid', 'rotator cuff']),
  back('right_back_shoulder', 'Right back shoulder', 'Back shoulder', 'Back or outer edge of the right shoulder', 'right', 65, 24, 18, 10, ['shoulders', 'shoulder'], ['shoulders'], ['horizontal_pull', 'vertical_pull'], ['overhead'], ['rear deltoid', 'rotator cuff']),
  back('left_rhomboid', 'Left inner shoulder blade', 'Rhomboid area', 'Between the left shoulder blade and the spine', 'left', 34, 27, 15, 14, ['upper_back', 'thoracic_spine'], ['upper_back'], ['horizontal_pull'], [], ['rhomboid', 'scapula', 'inside shoulder blade', 'between shoulder blade and spine']),
  back('right_rhomboid', 'Right inner shoulder blade', 'Rhomboid area', 'Between the right shoulder blade and the spine', 'right', 51, 27, 15, 14, ['upper_back', 'thoracic_spine'], ['upper_back'], ['horizontal_pull'], [], ['rhomboid', 'scapula', 'inside shoulder blade', 'between shoulder blade and spine']),
  back('left_lat', 'Left lat or side back', 'Lat', 'Side of the left upper or mid-back below the armpit', 'left', 24, 34, 17, 17, ['lats'], ['lats'], ['horizontal_pull', 'vertical_pull'], ['hanging'], ['latissimus', 'side back']),
  back('right_lat', 'Right lat or side back', 'Lat', 'Side of the right upper or mid-back below the armpit', 'right', 59, 34, 17, 17, ['lats'], ['lats'], ['horizontal_pull', 'vertical_pull'], ['hanging'], ['latissimus', 'side back']),
  back('left_triceps', 'Left back upper arm', 'Triceps', 'Back of the left upper arm', 'left', 12, 31, 13, 16, ['triceps', 'elbow'], ['triceps'], ['horizontal_push', 'vertical_push'], [], ['triceps', 'upper arm']),
  back('right_triceps', 'Right back upper arm', 'Triceps', 'Back of the right upper arm', 'right', 75, 31, 13, 16, ['triceps', 'elbow'], ['triceps'], ['horizontal_push', 'vertical_push'], [], ['triceps', 'upper arm']),
  back('left_lower_back', 'Left lower back', 'Lower back', 'Left side of the low back above the pelvis', 'left', 32, 45, 18, 13, ['lower_back', 'lumbar_spine'], ['lower_back'], ['hinge', 'rotation', 'trunk_flexion'], ['rotation', 'spinal_flexion'], ['lumbar', 'QL', 'quadratus lumborum']),
  back('right_lower_back', 'Right lower back', 'Lower back', 'Right side of the low back above the pelvis', 'right', 50, 45, 18, 13, ['lower_back', 'lumbar_spine'], ['lower_back'], ['hinge', 'rotation', 'trunk_flexion'], ['rotation', 'spinal_flexion'], ['lumbar', 'QL', 'quadratus lumborum']),
  back('left_lateral_hip', 'Left lateral hip', 'Lateral hip', 'Outside of the left hip or glute-median area', 'left', 25, 53, 18, 12, ['hip_abductors', 'hip', 'glutes'], ['hip_abductors', 'glutes'], ['lunge', 'balance'], ['single_leg_loading'], ['glute med', 'IT band', 'outside hip']),
  back('right_lateral_hip', 'Right lateral hip', 'Lateral hip', 'Outside of the right hip or glute-median area', 'right', 57, 53, 18, 12, ['hip_abductors', 'hip', 'glutes'], ['hip_abductors', 'glutes'], ['lunge', 'balance'], ['single_leg_loading'], ['glute med', 'IT band', 'outside hip']),
  back('left_glute', 'Left glute', 'Glute', 'Left buttock or back of the hip', 'left', 33, 55, 16, 12, ['glutes', 'hip'], ['glutes'], ['hinge', 'squat', 'lunge'], [], ['butt', 'posterior hip']),
  back('right_glute', 'Right glute', 'Glute', 'Right buttock or back of the hip', 'right', 51, 55, 16, 12, ['glutes', 'hip'], ['glutes'], ['hinge', 'squat', 'lunge'], [], ['butt', 'posterior hip']),
  back('left_hamstring', 'Left back thigh', 'Hamstring', 'Back of the left thigh', 'left', 31, 64, 17, 18, ['hamstrings'], ['hamstrings'], ['hinge', 'lunge', 'locomotion'], ['single_leg_loading'], ['hamstring', 'back thigh']),
  back('right_hamstring', 'Right back thigh', 'Hamstring', 'Back of the right thigh', 'right', 52, 64, 17, 18, ['hamstrings'], ['hamstrings'], ['hinge', 'lunge', 'locomotion'], ['single_leg_loading'], ['hamstring', 'back thigh']),
  back('left_calf', 'Left calf', 'Calf', 'Back of the left lower leg', 'left', 32, 82, 15, 14, ['gastrocnemius', 'soleus'], ['gastrocnemius', 'soleus'], ['jump_hop', 'locomotion'], ['high_impact'], ['calf', 'soleus', 'gastrocnemius']),
  back('right_calf', 'Right calf', 'Calf', 'Back of the right lower leg', 'right', 53, 82, 15, 14, ['gastrocnemius', 'soleus'], ['gastrocnemius', 'soleus'], ['jump_hop', 'locomotion'], ['high_impact'], ['calf', 'soleus', 'gastrocnemius']),
  back('left_achilles', 'Left Achilles or heel', 'Achilles', 'Back of the left ankle or heel cord', 'left', 34, 93, 12, 6, ['feet_ankles', 'ankle', 'foot'], ['feet_ankles'], ['jump_hop', 'locomotion'], ['high_impact'], ['heel cord', 'achilles tendon']),
  back('right_achilles', 'Right Achilles or heel', 'Achilles', 'Back of the right ankle or heel cord', 'right', 54, 93, 12, 6, ['feet_ankles', 'ankle', 'foot'], ['feet_ankles'], ['jump_hop', 'locomotion'], ['high_impact'], ['heel cord', 'achilles tendon']),
];

export const MOVEMENT_PATTERN_OPTIONS: Array<{ pattern: MovementPattern; label: string; detail: string }> = [
  { pattern: 'horizontal_pull', label: 'Pulling or squeezing shoulder blades', detail: 'Rows, band pulls, and similar retraction work' },
  { pattern: 'vertical_pull', label: 'Pulling overhead', detail: 'Pulldowns, pull-ups, and hanging pulls' },
  { pattern: 'horizontal_push', label: 'Pushing forward', detail: 'Push-ups, bench press, and chest press' },
  { pattern: 'vertical_push', label: 'Pressing overhead', detail: 'Overhead presses and similar work' },
  { pattern: 'carry', label: 'Carrying or gripping', detail: 'Loaded carries and prolonged grip work' },
  { pattern: 'squat', label: 'Squatting', detail: 'Squats and deep knee-bend patterns' },
  { pattern: 'lunge', label: 'Lunging or single-leg loading', detail: 'Lunges, split squats, and step-ups' },
  { pattern: 'hinge', label: 'Hip hinging', detail: 'Deadlifts, good mornings, and hinge patterns' },
  { pattern: 'rotation', label: 'Twisting or rotation', detail: 'Loaded or repeated trunk rotation' },
  { pattern: 'trunk_flexion', label: 'Bending or curling the spine', detail: 'Crunches and loaded spinal flexion' },
  { pattern: 'jump_hop', label: 'Jumping or impact', detail: 'Jumps, hops, running-style impact' },
  { pattern: 'balance', label: 'Balance or unstable positions', detail: 'Single-leg or unstable-surface work' },
  { pattern: 'locomotion', label: 'Walking, running, or stairs', detail: 'Repeated gait and step patterns' },
];

export function painAreaById(id: string): PainAreaDefinition | undefined {
  return PAIN_AREAS.find((area) => area.id === id);
}

export function createPainAreaSelection(area: PainAreaDefinition, protection: RegionProtectionMode = 'direct_only'): PainAreaSelection {
  return { areaId: area.id, label: area.label, side: area.side, protection };
}

export function buildRestrictionsFromPainAreas(selections: PainAreaSelection[]): {
  affectedRegions: Array<BodyRegion | JointRegion>;
  penaltyRegions: BodyRegion[];
  regionRestrictions: RegionRestriction[];
} {
  const affectedRegions = new Set<BodyRegion | JointRegion>();
  const penaltyRegions = new Set<BodyRegion>();
  const byRegion = new Map<BodyRegion | JointRegion, RegionProtectionMode>();
  const rank: Record<RegionProtectionMode, number> = { direct_only: 1, keep_light: 2, avoid: 3 };

  for (const selection of selections) {
    const area = painAreaById(selection.areaId);
    if (!area) continue;
    area.regions.forEach((region) => affectedRegions.add(region));
    area.penaltyRegions.forEach((region) => penaltyRegions.add(region));
    for (const region of area.regions) {
      const current = byRegion.get(region);
      if (!current || rank[selection.protection] > rank[current]) byRegion.set(region, selection.protection);
    }
  }

  return {
    affectedRegions: [...affectedRegions],
    penaltyRegions: [...penaltyRegions],
    regionRestrictions: [...byRegion].map(([region, mode]) => ({ region, mode })),
  };
}

export function suggestedPatternsForAreas(selections: PainAreaSelection[]): MovementPattern[] {
  const patterns = new Set<MovementPattern>();
  for (const selection of selections) painAreaById(selection.areaId)?.suggestedPatterns.forEach((pattern) => patterns.add(pattern));
  return [...patterns];
}

export function suggestedTagsForAreas(selections: PainAreaSelection[]): AvoidanceTag[] {
  const tags = new Set<AvoidanceTag>();
  for (const selection of selections) painAreaById(selection.areaId)?.suggestedTags.forEach((tag) => tags.add(tag));
  return [...tags];
}
