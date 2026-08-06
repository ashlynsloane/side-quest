export const V29_PLAN_SCREEN_SPEC = {
  pageQuestion: 'How does my training fit together?',
  sectionOrder: ['phase', 'alerts', 'week', 'controls', 'roadmap'] as const,
  minimumTapTarget: 44,
  maximumVisibleDays: 7,
  principles: [
    'Show the current training phase before calendar detail.',
    'Resolve scheduling conflicts without shame or completion scoring.',
    'Keep availability and training-emphasis controls directly accessible.',
    'Treat open days as usable space rather than missing work.',
  ] as const,
};
