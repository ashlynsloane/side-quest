import type { PerformanceGoalType } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { V23GoalChoiceRow, V23ScenicBanner, V23Screen } from '@/components/v23-ui';
import { getLatestPerformanceGoal } from '@/services/database';
import { useTheme } from '@/state/theme-context';

type GoalChoice = { type: PerformanceGoalType; title: string; description: string; disciplines: Array<'swim' | 'bike' | 'run'> };
const GOALS: GoalChoice[] = [
  { type: 'triathlon_sprint', title: 'Sprint triathlon', description: 'Short course. Fast off the bike.', disciplines: ['swim', 'bike', 'run'] },
  { type: 'triathlon_olympic', title: 'Olympic triathlon', description: 'Balanced. More endurance than sprint.', disciplines: ['swim', 'bike', 'run'] },
  { type: 'ironman_70_3', title: 'Ironman 70.3', description: 'Long course. Durability with balanced strength.', disciplines: ['swim', 'bike', 'run'] },
  { type: 'ironman_full', title: 'Ironman distance', description: 'Full-distance durability and resilient strength.', disciplines: ['swim', 'bike', 'run'] },
  { type: 'swimrun', title: 'Swimrun', description: 'Swim and trail run transitions.', disciplines: ['swim', 'run'] },
  { type: 'road_10k', title: 'Road 10K', description: 'Speed and leg resilience.', disciplines: ['run'] },
  { type: 'road_half_marathon', title: 'Road half marathon', description: 'Economy and sustained single-leg strength.', disciplines: ['run'] },
  { type: 'road_marathon', title: 'Road marathon', description: 'Durability for high-volume road running.', disciplines: ['run'] },
  { type: 'trail_50k', title: 'Trail 50K', description: 'Climbing, descending, and trail durability.', disciplines: ['run'] },
  { type: 'trail_100k', title: 'Trail 100K', description: 'Ultra-distance mountain resilience.', disciplines: ['run'] },
  { type: 'swim_speed', title: 'Swim faster', description: 'Upper-back strength, control, and power.', disciplines: ['swim'] },
  { type: 'general_offseason', title: 'Offseason strength', description: 'Build broad strength without a near-term race.', disciplines: [] },
];

export default function GoalCatalogScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const [selected, setSelected] = useState<PerformanceGoalType>('ironman_70_3');
  useFocusEffect(useCallback(() => { let live = true; void getLatestPerformanceGoal().then((goal) => { if (live && goal) setSelected(goal.type); }); return () => { live = false; }; }, []));

  function choose(type: PerformanceGoalType) { setSelected(type); router.push({ pathname: '/goal-plan', params: { goal: type } } as Href); }

  return <V23Screen contentStyle={styles.content}>
    <V23ScenicBanner variant="goal" />
    <View style={styles.intro}><Text style={[styles.introTitle, { color: tokens.text }]}>Choose your goal</Text><Text style={[styles.introBody, { color: tokens.textMuted }]}>Your plan will use the sport, available hours, restrictions, and event timeline you enter next.</Text></View>
    <View style={styles.list}>{GOALS.map((goal) => <V23GoalChoiceRow key={goal.type} title={goal.title} description={goal.description} disciplines={goal.disciplines} selected={selected === goal.type} onPress={() => choose(goal.type)} />)}</View>
  </V23Screen>;
}

const styles = StyleSheet.create({ content: { paddingTop: 0 }, intro: { gap: 4, paddingTop: 2 }, introTitle: { fontSize: 23, lineHeight: 29, fontWeight: '800' }, introBody: { fontSize: 14, lineHeight: 20 }, list: { gap: 9 } });
