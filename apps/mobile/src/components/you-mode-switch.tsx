import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function YouModeSwitch({ active }: { active: 'progress' | 'profile' }) {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  function open(mode: 'progress' | 'profile') {
    if (mode === active) return;
    router.replace((mode === 'progress' ? '/(tabs)/profile-progress' : '/(tabs)/profile') as Href);
  }

  return <View style={styles.shell}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Training progress"
      accessibilityState={{ selected: active === 'progress' }}
      onPress={() => open('progress')}
      style={[styles.tab, active === 'progress' && styles.tabActive]}
    >
      <Text style={[styles.label, active === 'progress' && styles.labelActive]}>Progress</Text>
    </Pressable>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Athlete profile and settings"
      accessibilityState={{ selected: active === 'profile' }}
      onPress={() => open('profile')}
      style={[styles.tab, active === 'profile' && styles.tabActive]}
    >
      <Text style={[styles.label, active === 'profile' && styles.labelActive]}>Profile</Text>
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
