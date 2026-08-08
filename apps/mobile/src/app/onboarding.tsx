import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/theme-context';

/**
 * First-run setup now uses the same Goal Setup workspace as later plan edits.
 * The onboarding flag lets Goal Setup persist onboarding acknowledgements only
 * after a valid plan has been built successfully.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const { tokens } = useTheme();

  useEffect(() => {
    router.replace('/goal-plan?onboarding=1' as Href);
  }, [router]);

  return <View style={[styles.root, { backgroundColor: tokens.canvas }]}>
    <ActivityIndicator color={tokens.accent} />
    <Text style={[styles.text, { color: tokens.textMuted }]}>Opening Goal Setup…</Text>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  text: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
});
