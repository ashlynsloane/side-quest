import { StyleSheet, Text, View } from 'react-native';

import type { CoachOperatingInboxItem } from '@/services/coach-operating-inbox';
import { useTheme } from '@/state/theme-context';

export function CoachOperatingInboxPanel({ items }: { items: CoachOperatingInboxItem[] }) {
  const { tokens } = useTheme();
  if (!items.length) return null;
  const styles = makeStyles(tokens);
  return (
    <View style={styles.stack}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>COACH ATTENTION</Text>
        <Text style={styles.title}>What matters next</Text>
      </View>
      {items.map((item) => (
        <View key={item.id} style={[styles.card, item.level === 'protection' && styles.protection]}>
          <View style={styles.topRow}>
            <Text style={[styles.level, item.level === 'protection' && styles.protectionText]}>{label(item.level)}</Text>
            <Text style={styles.action}>{item.actionable ? 'REVIEW' : 'FYI'}</Text>
          </View>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.reason}>{item.reason}</Text>
        </View>
      ))}
    </View>
  );
}

function label(level: CoachOperatingInboxItem['level']): string {
  if (level === 'protection') return 'PROTECTION';
  if (level === 'check_in') return 'CHECK-IN';
  if (level === 'suggestion') return 'SUGGESTION';
  return 'INFO';
}

function makeStyles(tokens: ReturnType<typeof useTheme>['tokens']) {
  return StyleSheet.create({
    stack: { gap: 10 },
    header: { gap: 2 },
    eyebrow: { color: tokens.accent, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 1.05 },
    title: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '900' },
    card: { borderWidth: 1, borderColor: tokens.border, borderRadius: 17, backgroundColor: tokens.surface, padding: 15, gap: 6 },
    protection: { borderColor: tokens.danger },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    level: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    protectionText: { color: tokens.danger },
    action: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 12, fontWeight: '800', letterSpacing: 0.7 },
    itemTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '850' },
    body: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 19 },
    reason: { color: tokens.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  });
}
