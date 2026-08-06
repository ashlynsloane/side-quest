export type VisualQaArea = 'Navigation' | 'Hierarchy' | 'Accessibility' | 'Continuity' | 'Privacy';

export type VisualQaCheck = {
  id: string;
  area: VisualQaArea;
  title: string;
  criterion: string;
  surfaces: string;
};

export const V31_VISUAL_QA_CHECKS: readonly VisualQaCheck[] = [
  { id: 'nav-order', area: 'Navigation', title: 'Canonical tab order', criterion: 'Today, Train, Plan, Progress, and You appear in that order with no duplicate destination.', surfaces: 'Tab shell' },
  { id: 'nav-labels', area: 'Navigation', title: 'Consistent destination names', criterion: 'Side Quest Coach, Human Coach Access, Training Body Map, and You use the same wording everywhere.', surfaces: 'All primary surfaces' },
  { id: 'one-primary', area: 'Hierarchy', title: 'One dominant action', criterion: 'Each major screen has one visually dominant next action; secondary actions do not compete with it.', surfaces: 'Today, Coach, workout preview, completion' },
  { id: 'readability', area: 'Hierarchy', title: 'Readable type hierarchy', criterion: 'Page titles, section labels, body copy, and metadata remain distinct at default text size.', surfaces: 'All V31.7 screens' },
  { id: 'card-separation', area: 'Hierarchy', title: 'Card and canvas separation', criterion: 'Cards remain visually distinct from the canvas in both light and dark appearance without excessive borders.', surfaces: 'Today, Plan, Progress, You' },
  { id: 'tap-targets', area: 'Accessibility', title: 'Comfortable touch targets', criterion: 'Primary controls and rows are at least approximately 48 points tall and do not crowd screen edges.', surfaces: 'Tabs, rows, workout controls' },
  { id: 'dynamic-copy', area: 'Accessibility', title: 'Copy does not clip', criterion: 'Long labels, status text, and explanations wrap cleanly without overlapping controls.', surfaces: 'Coach reasoning, scenario fixtures, share center' },
  { id: 'contrast', area: 'Accessibility', title: 'Secondary text remains legible', criterion: 'Muted copy has sufficient visual contrast and is not used for essential warnings or primary actions.', surfaces: 'All V31.7 screens' },
  { id: 'preview-active', area: 'Continuity', title: 'Preview carries into workout', criterion: 'Edited duration, prescriptions, swaps, and optional exercises match what appears after Start workout.', surfaces: 'Workout preview → Active Workout' },
  { id: 'completion-today', area: 'Continuity', title: 'Completion returns coherently', criterion: 'Saving a workout returns to Today and the completed session is reflected without contradictory messaging.', surfaces: 'Completion → Today → Progress' },
  { id: 'coach-state', area: 'Continuity', title: 'Coach explanation matches state', criterion: 'Recommendation rationale, changed-state copy, and confidence language agree with the visible plan state.', surfaces: 'Today → Side Quest Coach → Plan' },
  { id: 'body-map', area: 'Continuity', title: 'Regional status is plan-relative', criterion: 'Training Body Map labels agree with Progress and regional detail; no universal body-part target percentages appear.', surfaces: 'Progress → Training Body Map → region detail' },
  { id: 'share-preview', area: 'Privacy', title: 'Share preview is authoritative', criterion: 'The preview accurately represents what leaves the app and excludes private health, readiness, notes, weights, and reasoning.', surfaces: 'Sharing center → system share sheet' },
  { id: 'fixture-boundary', area: 'Privacy', title: 'Review fixtures stay isolated', criterion: 'Product scenarios and Visual QA do not seed athlete history, change planner outputs, or masquerade as production data.', surfaces: 'You → Product scenarios / Visual QA' },
] as const;

export const V31_VISUAL_QA_AREAS: readonly VisualQaArea[] = ['Navigation', 'Hierarchy', 'Accessibility', 'Continuity', 'Privacy'] as const;
