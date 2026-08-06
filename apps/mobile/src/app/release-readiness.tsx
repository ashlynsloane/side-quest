import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import { ProductionState } from '@/components/production-state';
import { buildPrivacySafeDiagnostics, type PrivacySafeDiagnostics } from '@/services/diagnostics';
import { buildReleaseGates, normalizeUserFacingError, summarizeReadiness, type ReadinessSeverity } from '@/services/production-readiness';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';

export default function ReleaseReadinessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [report, setReport] = useState<PrivacySafeDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try { setReport(await buildPrivacySafeDiagnostics({ accountMode: user?.mode ?? 'signed_out', userId: user?.mode === 'cloud' ? user.id : undefined })); }
    catch (cause) { setError(normalizeUserFacingError(cause)); }
    finally { setBusy(false); }
  }, [user?.id, user?.mode]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const gates = useMemo(() => buildReleaseGates(report), [report]);
  const summary = useMemo(() => summarizeReadiness(gates), [gates]);
  if (error && !report) return <AppScreen eyebrow="RELEASE CANDIDATE" title="Production readiness"><ProductionState title="Health check unavailable" detail={error} actionLabel="Try again" onAction={() => void load()} busy={busy} /></AppScreen>;
  return <AppScreen eyebrow="RELEASE CANDIDATE" title="Production readiness" subtitle="One place to verify local storage, recovery, delivery, integrations, feedback, and privacy controls before a TestFlight build.">
    <Surface><View style={styles.row}><Pill tone={tone(summary.severity)}>{summary.severity.toUpperCase()}</Pill><Text style={styles.headline}>{summary.ready} ready · {summary.attention} attention · {summary.blocked} blocked</Text></View><Text style={styles.body}>Optional integrations do not block local workouts. A blocked gate means the core local experience needs attention.</Text></Surface>
    <SectionTitle>Release gates</SectionTitle>
    {gates.map(gate => <Surface key={gate.id}><View style={styles.row}><Pill tone={tone(gate.severity)}>{gate.severity.toUpperCase()}</Pill><Text style={styles.title}>{gate.title}</Text></View><Text style={styles.body}>{gate.detail}</Text>{gate.action ? <Text style={styles.action}>{gate.action}</Text> : null}</Surface>)}
    <SectionTitle>Tester support</SectionTitle>
    <Pressable onPress={() => router.push('/beta-feedback' as Href)} style={styles.secondary}><Text style={styles.secondaryText}>Send reproducible beta feedback</Text></Pressable>
    <Pressable onPress={() => router.push('/privacy-data' as Href)} style={styles.secondary}><Text style={styles.secondaryText}>Review data and deletion controls</Text></Pressable>
    <Pressable disabled={busy} onPress={() => void load()} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Checking…' : 'Run health check again'}</Text></Pressable>
  </AppScreen>;
}
function tone(value: ReadinessSeverity): 'good' | 'warn' { return value === 'ready' ? 'good' : 'warn'; }
function makeStyles(t: ReturnType<typeof useTheme>['tokens']) { return StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, headline: { flex: 1, color: t.text, fontSize: 16, fontWeight: '900' }, title: { flex: 1, color: t.text, fontSize: 16, fontWeight: '800' }, body: { color: t.textMuted, fontSize: 13, lineHeight: 19, marginTop: 7 }, action: { color: t.accent, fontSize: 13, fontWeight: '800', marginTop: 8 }, primary: { minHeight: 50, borderRadius: 14, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, primaryText: { color: '#FFFFFF', fontWeight: '900' }, secondary: { minHeight: 50, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.borderStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }, secondaryText: { color: t.accent, fontWeight: '800' } }); }
