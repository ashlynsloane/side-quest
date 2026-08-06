import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';
import { ActionCard, AppScreen, SectionTitle } from '@/components/v12-ui';

type Tool = { route: string; eyebrow: string; title: string; detail: string; icon: string; badge?: string };
const GROUPS: Array<{ title: string; tools: Tool[] }> = [
  { title: 'Plan and adapt', tools: [
    { route: '/plan-dashboard', eyebrow: 'PLAN', title: 'Plan dashboard', detail: 'Countdown, upcoming sessions, and plan export.', icon: '◫' },
    { route: '/adaptive-plan', eyebrow: 'SCHEDULE', title: 'Adaptive plan', detail: 'Review conflicts and reversible calendar changes.', icon: '↔' },
    { route: '/session-rescue', eyebrow: 'TODAY', title: 'Session rescue', detail: 'Choose a full, reduced, minimum, or re-entry dose.', icon: '▶' },
    { route: '/workout-together', eyebrow: 'LIVE', title: 'Workout Together', detail: 'Create a private room and synchronize a shared workout.', icon: '∞' },
    { route: '/weekly-review', eyebrow: 'REVIEW', title: 'Weekly review', detail: 'Review readiness, effort, and next-week guidance.', icon: '▥' },
  ]},
  { title: 'Workouts and progress', tools: [
    { route: '/progressions', eyebrow: 'LOADS', title: 'Progressions', detail: 'Review rep-first, equipment-aware load progression.', icon: '↕' },
    { route: '/exercise-library', eyebrow: 'EXERCISES', title: 'Exercise library', detail: 'Browse demonstrations and add custom or PT movements.', icon: '◉' },
    { route: '/race-readiness', eyebrow: 'EVENT', title: 'Race readiness', detail: 'Review taper guardrails, equipment, and event preparation.', icon: '⚑' },
  ]},
  { title: 'Check-ins and settings', tools: [
    { route: '/readiness', eyebrow: 'DAILY', title: 'Readiness check-in', detail: 'Log sleep, energy, freshness, stress, and motivation.', icon: '☾' },
    { route: '/today-check-in', eyebrow: 'SYMPTOMS', title: 'Pain and soreness check-in', detail: 'Record a temporary change that may affect training.', icon: '+' },
    { route: '/pt-profile', eyebrow: 'RESTRICTIONS', title: 'PT profile', detail: 'Manage persistent movement and return-to-training restrictions.', icon: 'PT' },
    { route: '/calendar-sync', eyebrow: 'CONNECTIONS', title: 'Calendar connection', detail: 'Manage ICS, webcal, TrainingPeaks, and manual entries.', icon: '↻' },
    { route: '/appearance', eyebrow: 'DISPLAY', title: 'Appearance', detail: 'Choose a training environment and light or dark behavior.', icon: '◐' },
  ]},
];

export default function MoreScreen() {
  const router = useRouter();
  return <AppScreen title="Tools" subtitle="Planning, workout, review, and account tools.">
    {GROUPS.map((group) => <View key={group.title} style={{ gap: 9 }}><SectionTitle>{group.title}</SectionTitle>{group.tools.map((tool) => <ActionCard key={tool.route} icon={tool.icon} eyebrow={tool.eyebrow} title={tool.title} body={tool.detail} badge={tool.badge} onPress={() => router.push(tool.route as Href)} />)}</View>)}
  </AppScreen>;
}
