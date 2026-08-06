import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { V23GroupedList, V23Row, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import { useTheme } from '@/state/theme-context';

export default function DeveloperToolsScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => ({ eyebrow: { color: tokens.accent, fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.1 }, title: { color: tokens.text, fontSize: 28, lineHeight: 33, fontWeight: '900' as const }, body: { color: tokens.textMuted, fontSize: 14, lineHeight: 20 } }), [tokens]);
  return <V23Screen>
    <View style={{ gap: 6 }}><Text style={styles.eyebrow}>INTERNAL BUILD</Text><Text style={styles.title}>Developer tools</Text><Text style={styles.body}>Review fixtures and release checks that are hidden from ordinary beta navigation.</Text></View>
    <V23SectionHeader>Review</V23SectionHeader>
    <V23GroupedList>
      <V23Row title="Production readiness" detail="Release gates, retries, diagnostics, and tester support" onPress={() => router.push('/release-readiness' as Href)} />
      <V23Row title="Product scenarios" detail="Deterministic cold-start and training-state fixtures" onPress={() => router.push('/beta-scenarios' as Href)} />
      <V23Row title="Visual QA" detail="Release-readiness checklist" onPress={() => router.push('/visual-qa' as Href)} last />
    </V23GroupedList>
  </V23Screen>;
}
