import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function CoachModeSwitch({ active }: { active: 'today' | 'strategy' }) {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  function open(mode: 'today' | 'strategy') {
    if (mode === active) return;
    router.replace((mode === 'today' ? '/(tabs)/coach' : '/coach-strategy') as Href);
  }

  return <View style={styles.shell} accessibilityRole="tablist">
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active === 'today' }}
      onPress={() => open('today')}
      style={[styles.tab, active === 'today' && styles.tabActive]}
    >
      <Text style={[styles.label, active === 'today' && styles.labelActive]}>Today</Text>
    </Pressable>
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active === 'strategy' }}
      onPress={() => open('strategy')}
      style={[styles.tab, active === 'strategy' && styles.tabActive]}
    >
      <Text style={[styles.label, active === 'strategy' && styles.labelActive]}>Strategy</Text>
    </Pressable>
  </View>;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    shell: { flexDirection: 'row', borderRadius: 14, backgroundColor: tokens.surfaceMuted, padding: 3, gap: 3 },
    tab: { flex: 1, minHeight: 39, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
    tabActive: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border },
    label: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    labelActive: { color: tokens.text },
  });
}
