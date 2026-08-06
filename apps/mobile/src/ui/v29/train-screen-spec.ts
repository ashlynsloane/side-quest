export const V29_TRAIN_SCREEN_SPEC = {
  question: 'What workout can I do now?',
  sectionOrder: ['active', 'builder', 'presets', 'recommended', 'saved', 'together'] as const,
  principles: [
    'An active workout takes precedence over workout discovery.',
    'The builder is a real control surface, not a navigation card.',
    'Recommendations explain why they fit today.',
    'Unavailable workouts never present an enabled Start action.',
    'Saved, recent, and social content remain secondary to training now.',
  ] as const,
  minimumTapTarget: 44,
} as const;
