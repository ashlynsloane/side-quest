import { Tabs } from 'expo-router';
import { V23Icon } from '@/components/v23-ui';
import { useTheme } from '@/state/theme-context';

type IconKind = 'home' | 'plan' | 'train' | 'insights' | 'profile';
function TabIcon({ kind, focused }: { kind: IconKind; focused: boolean }) {
  const { tokens } = useTheme();
  return <V23Icon name={kind} color={focused ? tokens.accent : tokens.textMuted} size={focused ? 22 : 20} />;
}

export default function TabLayout() {
  const { tokens } = useTheme();
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: tokens.accent,
    tabBarInactiveTintColor: tokens.textMuted,
    tabBarHideOnKeyboard: true,
    tabBarStyle: { height: 76, paddingTop: 8, paddingBottom: 10, backgroundColor: tokens.tabBar, borderTopWidth: 1, borderTopColor: tokens.border },
    tabBarLabelStyle: { fontSize: 11.5, lineHeight: 15, fontWeight: '800' },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ focused }) => <TabIcon kind="home" focused={focused} /> }} />
    <Tabs.Screen name="plan" options={{ title: 'Week', tabBarIcon: ({ focused }) => <TabIcon kind="plan" focused={focused} /> }} />
    <Tabs.Screen name="train" options={{ title: 'Train', tabBarIcon: ({ focused }) => <TabIcon kind="train" focused={focused} /> }} />
    <Tabs.Screen name="coach" options={{ title: 'Coach', tabBarIcon: ({ focused }) => <TabIcon kind="insights" focused={focused} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'You', tabBarIcon: ({ focused }) => <TabIcon kind="profile" focused={focused} /> }} />
    <Tabs.Screen name="coach-strategy" options={{ href: null }} />
    <Tabs.Screen name="profile-progress" options={{ href: null }} />
    <Tabs.Screen name="library" options={{ href: null }} />
  </Tabs>;
}
