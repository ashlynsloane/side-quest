import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

export type SportIconKind = 'swim' | 'bike' | 'run' | 'strength' | 'hiit' | 'recovery' | 'other';

const SYMBOLS: Record<SportIconKind, { ios: string; android: string; web: string }> = {
  swim: { ios: 'figure.pool.swim', android: 'pool', web: 'pool' },
  bike: { ios: 'bicycle', android: 'directions_bike', web: 'directions_bike' },
  run: { ios: 'figure.run', android: 'directions_run', web: 'directions_run' },
  strength: { ios: 'dumbbell.fill', android: 'fitness_center', web: 'fitness_center' },
  hiit: { ios: 'figure.mixed.cardio', android: 'exercise', web: 'exercise' },
  recovery: { ios: 'moon.zzz.fill', android: 'bedtime', web: 'bedtime' },
  other: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
};

export function SportIcon({ kind, color, size = 18, backgroundColor = 'transparent' }: { kind: SportIconKind; color: string; size?: number; backgroundColor?: string }) {
  const framed = backgroundColor !== 'transparent';
  const diameter = size + 18;
  return <View style={[styles.wrap, {
    width: diameter,
    height: diameter,
    borderRadius: diameter / 2,
    backgroundColor,
    borderWidth: framed ? StyleSheet.hairlineWidth : 0,
    borderColor: framed ? 'rgba(16,42,75,0.10)' : 'transparent',
  }]}>
    <SymbolView
      name={SYMBOLS[kind] as never}
      size={size}
      tintColor={color}
      fallback={<Text style={[styles.fallback, { color, fontSize: Math.max(10, size - 5) }]}>{FALLBACK[kind]}</Text>}
    />
  </View>;
}

const FALLBACK: Record<SportIconKind, string> = {
  swim: 'S', bike: 'B', run: 'R', strength: 'ST', hiit: 'H', recovery: 'Z', other: '•',
};

export function normalizeSportKind(value?: string): SportIconKind {
  if (value === 'swim') return 'swim';
  if (value === 'bike') return 'bike';
  if (value === 'run') return 'run';
  if (value === 'strength') return 'strength';
  if (value === 'hiit') return 'hiit';
  if (value === 'recovery' || value === 'rest') return 'recovery';
  return 'other';
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  fallback: { fontFamily: 'monospace', fontWeight: '900' },
});
