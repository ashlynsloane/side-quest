import type {
  Exercise,
  ExerciseProgressionProfile,
  ExerciseTrainingFamily,
} from '@circuit/domain';

export const exerciseTrainingFamilies: Record<
  string,
  ExerciseTrainingFamily
> = {
  // Lower-leg strength versus elastic/reactive work
  ex_standing_calf_raise: 'calf_strength',
  ex_weighted_standing_calf_raise: 'calf_strength',
  ex_single_leg_calf_raise: 'calf_strength',
  ex_bent_knee_calf_raise: 'calf_strength',
  ex_seated_calf_raise: 'calf_strength',

  ex_double_leg_pogo_hop: 'elastic_lower_leg',
  ex_alternating_pogo_hop: 'elastic_lower_leg',
  ex_single_leg_pogo_hop: 'elastic_lower_leg',
  ex_box_supported_lateral_pogo_hop: 'elastic_lower_leg',

  // Bilateral hinge strength
  ex_dumbbell_romanian_deadlift: 'hip_hinge_strength',
  ex_barbell_romanian_deadlift: 'hip_hinge_strength',
  ex_barbell_deadlift: 'hip_hinge_strength',
  ex_trap_bar_deadlift: 'hip_hinge_strength',
  ex_kettlebell_deadlift_with_hip_drive: 'hip_hinge_strength',

  // Hip extension
  ex_barbell_hip_thrust: 'hip_extension_strength',
  ex_single_leg_glute_bridge: 'hip_extension_strength',
  ex_banded_glute_bridge_with_knee_press_out: 'hip_extension_strength',

  // Hamstring knee flexion
  ex_slider_hamstring_curl: 'hamstring_knee_flexion',
  ex_single_leg_slider_hamstring_curl: 'hamstring_knee_flexion',
  ex_stability_ball_hamstring_curl: 'hamstring_knee_flexion',
  ex_machine_seated_leg_curl: 'hamstring_knee_flexion',
  ex_nordic_hamstring_lower: 'hamstring_knee_flexion',

  // Unilateral hinge
  ex_single_leg_romanian_deadlift: 'unilateral_hip_hinge_strength',
  ex_single_leg_romanian_deadlift_to_row: 'unilateral_hip_hinge_strength',

  // Bilateral knee dominant
  ex_goblet_squat: 'bilateral_knee_dominant_strength',
  ex_double_kettlebell_squat: 'bilateral_knee_dominant_strength',
  ex_barbell_back_squat: 'bilateral_knee_dominant_strength',
  ex_barbell_back_squat_with_1_and_a_half_reps: 'bilateral_knee_dominant_strength',
  ex_barbell_front_squat: 'bilateral_knee_dominant_strength',
  ex_leg_press: 'bilateral_knee_dominant_strength',
  ex_machine_hack_squat: 'bilateral_knee_dominant_strength',

  // Unilateral knee dominant
  ex_weighted_bulgarian_split_squat: 'unilateral_knee_dominant_strength',
  ex_kettlebell_forward_lunge: 'unilateral_knee_dominant_strength',
  ex_kettlebell_reverse_lunge: 'unilateral_knee_dominant_strength',
  ex_single_leg_sit_to_stand: 'unilateral_knee_dominant_strength',
  ex_single_leg_squat_to_box: 'unilateral_knee_dominant_strength',
  ex_skater_squat_to_bench: 'unilateral_knee_dominant_strength',
  ex_lateral_step_up_with_knee_drive: 'unilateral_knee_dominant_strength',

  // Lateral lower body
  ex_lateral_lunge: 'lateral_lower_body_strength',
  ex_slider_lateral_lunge: 'lateral_lower_body_strength',
  ex_cossack_squat: 'lateral_lower_body_strength',

  // Power
  ex_bodyweight_squat_jump: 'lower_body_power',
  ex_dumbbell_jump_squat: 'lower_body_power',
  ex_kettlebell_swing: 'lower_body_power',
  ex_bulgarian_split_squat_jump: 'lower_body_power',
  ex_skater_hop: 'lower_body_power',

  // Balance/control rather than primary strength
  ex_bosu_hip_hinge_reach: 'lower_body_control_balance',
  ex_bosu_single_leg_romanian_deadlift: 'lower_body_control_balance',
  ex_bosu_single_leg_romanian_deadlift_reach: 'lower_body_control_balance',
  ex_bosu_single_leg_squat: 'lower_body_control_balance',
  ex_bosu_single_leg_mini_squat: 'lower_body_control_balance',
  ex_controlled_lateral_step_down: 'lower_body_control_balance',
  ex_lateral_step_down_to_reach: 'lower_body_control_balance',
  ex_crossover_step_down: 'lower_body_control_balance',
};

export const exerciseProgressionProfiles: Record<
  string,
  ExerciseProgressionProfile
> = {
  // ---------------------------------------------------------------------------
  // CALF — STRAIGHT KNEE
  //
  // Bilateral calf raises remain useful for experienced athletes when loaded.
  // Do not treat the unloaded exercise name itself as permanently "beginner".
  // ---------------------------------------------------------------------------
  ex_standing_calf_raise: {
    family: 'calf_straight_knee',
    role: 'loadable_base',
    progressionModes: [
      'external_load',
      'unilateral',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
    preferLoadForExperiencedAthlete: true,
  },

  ex_weighted_standing_calf_raise: {
    family: 'calf_straight_knee',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
  },

  ex_single_leg_calf_raise: {
    family: 'calf_straight_knee',
    role: 'advanced_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'moderate',
    loadedCeiling: 'high',
  },

  // ---------------------------------------------------------------------------
  // CALF — BENT KNEE / SOLEUS
  // ---------------------------------------------------------------------------
  ex_bent_knee_calf_raise: {
    family: 'calf_bent_knee',
    role: 'loadable_base',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
    preferLoadForExperiencedAthlete: true,
  },

  ex_seated_calf_raise: {
    family: 'calf_bent_knee',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
  },

  // ---------------------------------------------------------------------------
  // POGO / ELASTIC CAPACITY
  //
  // Unlike calf strength, adding arbitrary external weight is not the normal
  // progression axis here. Complexity and unilateral/reactive demand matter.
  // ---------------------------------------------------------------------------
  ex_double_leg_pogo_hop: {
    family: 'vertical_pogo',
    role: 'skill_regression',
    progressionModes: ['impact_complexity'],
    bodyweightCeiling: 'moderate',
  },

  ex_alternating_pogo_hop: {
    family: 'vertical_pogo',
    role: 'standard_variant',
    progressionModes: ['impact_complexity'],
    bodyweightCeiling: 'high',
  },

  ex_single_leg_pogo_hop: {
    family: 'vertical_pogo',
    role: 'advanced_variant',
    progressionModes: [
      'impact_complexity',
      'balance_complexity',
    ],
    bodyweightCeiling: 'high',
  },

  ex_box_supported_lateral_pogo_hop: {
    family: 'lateral_pogo',
    role: 'standard_variant',
    progressionModes: [
      'impact_complexity',
      'balance_complexity',
    ],
    bodyweightCeiling: 'high',
  },

  // ---------------------------------------------------------------------------
  // DEAD BUG
  //
  // The basic movement is extremely loadable through external load and lever
  // manipulation. It should not disappear merely because the athlete is
  // experienced.
  // ---------------------------------------------------------------------------
  ex_dead_bug: {
    family: 'dead_bug',
    role: 'loadable_base',
    progressionModes: [
      'external_load',
      'lever_length',
      'tempo',
    ],
    bodyweightCeiling: 'moderate',
    loadedCeiling: 'high',
    preferLoadForExperiencedAthlete: true,
  },

  // ---------------------------------------------------------------------------
  // BILATERAL SQUAT
  //
  // These are primarily loading/equipment variants, not a rigid linear skill
  // ladder. External load should therefore remain a first-class progression.
  // ---------------------------------------------------------------------------
  ex_goblet_squat: {
    family: 'bilateral_squat',
    role: 'loadable_base',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
    preferLoadForExperiencedAthlete: true,
  },

  ex_double_kettlebell_squat: {
    family: 'bilateral_squat',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
  },

  ex_barbell_back_squat_with_1_and_a_half_reps: {
    family: 'bilateral_squat',
    role: 'advanced_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
  },


  // ---------------------------------------------------------------------------
  // ROMANIAN DEADLIFT
  //
  // Dumbbell and barbell RDLs are primarily loading/equipment variants of the
  // same strength task. A dumbbell RDL does not become obsolete simply because
  // the athlete can use a barbell.
  // ---------------------------------------------------------------------------
  ex_dumbbell_romanian_deadlift: {
    family: 'romanian_deadlift',
    role: 'loadable_base',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
    preferLoadForExperiencedAthlete: true,
  },

  ex_barbell_romanian_deadlift: {
    family: 'romanian_deadlift',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
  },

  // ---------------------------------------------------------------------------
  // DEADLIFT
  //
  // Kettlebell, conventional-barbell, and trap-bar deadlifts share a broad
  // strength purpose but are equipment/technique variants rather than a rigid
  // novice -> expert ladder.
  // ---------------------------------------------------------------------------
  ex_kettlebell_deadlift_with_hip_drive: {
    family: 'deadlift',
    role: 'loadable_base',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
    preferLoadForExperiencedAthlete: true,
  },

  ex_barbell_deadlift: {
    family: 'deadlift',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
  },

  ex_trap_bar_deadlift: {
    family: 'deadlift',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
  },

  // ---------------------------------------------------------------------------
  // SINGLE-LEG RDL
  //
  // This is a unilateral strength family. BOSU variants intentionally remain
  // outside this family because their primary purpose is balance/control, not
  // simply "a harder RDL."
  // ---------------------------------------------------------------------------
  ex_single_leg_romanian_deadlift: {
    family: 'single_leg_rdl',
    role: 'loadable_base',
    progressionModes: [
      'external_load',
      'balance_complexity',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'moderate',
    loadedCeiling: 'high',
    preferLoadForExperiencedAthlete: true,
  },

  // ---------------------------------------------------------------------------
  // HAMSTRING KNEE FLEXION
  //
  // These share tissue/function but use different loading strategies. Nordic
  // lowering represents a genuinely high-demand eccentric variant.
  // ---------------------------------------------------------------------------
  ex_slider_hamstring_curl: {
    family: 'hamstring_curl',
    role: 'standard_variant',
    progressionModes: [
      'unilateral',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'high',
  },

  ex_stability_ball_hamstring_curl: {
    family: 'hamstring_curl',
    role: 'standard_variant',
    progressionModes: [
      'unilateral',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'high',
  },

  ex_single_leg_slider_hamstring_curl: {
    family: 'hamstring_curl',
    role: 'advanced_variant',
    progressionModes: [
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'high',
  },

  ex_machine_seated_leg_curl: {
    family: 'hamstring_curl',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'low',
    loadedCeiling: 'high',
  },

  ex_nordic_hamstring_lower: {
    family: 'hamstring_curl',
    role: 'advanced_variant',
    progressionModes: [
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'high',
  },

  // ---------------------------------------------------------------------------
  // SPLIT-SQUAT / LOADED LUNGE STRENGTH
  // ---------------------------------------------------------------------------
  ex_weighted_bulgarian_split_squat: {
    family: 'split_squat',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'moderate',
    loadedCeiling: 'high',
  },

  ex_kettlebell_forward_lunge: {
    family: 'weighted_lunge',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'moderate',
    loadedCeiling: 'high',
  },

  ex_kettlebell_reverse_lunge: {
    family: 'weighted_lunge',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'moderate',
    loadedCeiling: 'high',
  },


  // Loadable unilateral knee-dominant movements.
  // Bodyweight remains valid; experienced athletes can preserve the movement
  // and increase stimulus through external load rather than being forced into
  // a different exercise.
  ex_single_leg_sit_to_stand: {
    family: 'single_leg_squat',
    role: 'loadable_base',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
      'balance_complexity',
    ],
    bodyweightCeiling: 'moderate',
    loadedCeiling: 'high',
    preferLoadForExperiencedAthlete: true,
  },

  ex_lateral_step_up_with_knee_drive: {
    family: 'step_up',
    role: 'loadable_base',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'moderate',
    loadedCeiling: 'high',
    preferLoadForExperiencedAthlete: true,
  },

  ex_single_leg_squat_to_box: {
    family: 'single_leg_squat',
    role: 'standard_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
      'balance_complexity',
    ],
    bodyweightCeiling: 'high',
    loadedCeiling: 'high',
  },

  ex_skater_squat_to_bench: {
    family: 'single_leg_squat',
    role: 'advanced_variant',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
      'balance_complexity',
    ],
    bodyweightCeiling: 'high',
    loadedCeiling: 'high',
  },

  ex_single_leg_glute_bridge: {
    family: 'glute_bridge',
    role: 'loadable_base',
    progressionModes: [
      'external_load',
      'range_of_motion',
      'tempo',
    ],
    bodyweightCeiling: 'moderate',
    loadedCeiling: 'high',
    preferLoadForExperiencedAthlete: true,
  },
};

export function withExerciseProgressionProfile(
  exercise: Exercise,
): Exercise {
  const progressionProfile = exerciseProgressionProfiles[exercise.id];
  const trainingFamily = exerciseTrainingFamilies[exercise.id];

  if (!progressionProfile && !trainingFamily) return exercise;

  return {
    ...exercise,
    ...(trainingFamily ? { trainingFamily } : {}),
    ...(progressionProfile ? { progressionProfile } : {}),
  };
}
