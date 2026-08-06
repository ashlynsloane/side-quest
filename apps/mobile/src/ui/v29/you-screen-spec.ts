export const V29_YOU_SCREEN_SPEC = {
  question: 'What does Side Quest know about me, and what can I control?',
  order: ['profile', 'context', 'connections', 'coach', 'social', 'controls'] as const,
  requiredDirectActions: ['Edit athlete profile', 'Friends', 'Sharing controls', 'Privacy'] as const,
  prohibitedPatterns: ['settings icon grid', 'hidden privacy controls', 'connection status without an action'] as const,
  minimumTapTarget: 44,
} as const;
