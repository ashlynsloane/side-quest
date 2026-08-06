import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '@/state/theme-context';

export function ProductionState({ title, detail, actionLabel, onAction, busy = false }: { title: string; detail: string; actionLabel?: string; onAction?: () => void; busy?: boolean }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    root: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 20 },
    title: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
    detail: { color: tokens.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 330 },
    button: { minHeight: 48, minWidth: 160, marginTop: 8, paddingHorizontal: 18, borderRadius: 14, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  }), [tokens]);
  return <View accessibilityRole="summary" style={styles.root}><Text style={styles.title}>{title}</Text><Text style={styles.detail}>{detail}</Text>{actionLabel && onAction ? <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} disabled={busy} onPress={onAction} style={({ pressed }) => [styles.button, pressed && { opacity: 0.72 }, busy && { opacity: 0.55 }]}><Text style={styles.buttonText}>{busy ? 'Working…' : actionLabel}</Text></Pressable> : null}</View>;
}
