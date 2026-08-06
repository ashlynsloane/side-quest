export const progressScreenSpec = {
  sectionOrder: ['overview', 'regional_status', 'training_wins', 'movement_trends', 'training_balance', 'history', 'milestones'],
  minimumTapTarget: 44,
  terminology: {
    improvements: 'Training wins',
    trends: ['Maintained', 'Building', 'Returning', 'Learning'],
  },
  prohibited: ['completion percentage', 'consistency score', 'streak', 'always improve', 'push through pain'],
} as const;
