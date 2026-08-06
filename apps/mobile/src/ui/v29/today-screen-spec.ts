export const V29_TODAY_SCREEN_SPEC = {
  dominantObject: 'today-session-or-open-day',
  sectionOrder: ['context', 'safety-readiness-when-needed', 'hero', 'readiness', 'timeline', 'decision', 'upcoming'],
  maxUpcomingDays: 2,
  inlineFirstActions: ['start', 'edit', 'move', 'replace', 'check-in', 'add-restriction'],
  prohibitedPatterns: ['feature-menu-grid', 'readiness-reroute-card', 'generic-coaching-insight-card', 'completion-percentage'],
} as const;
