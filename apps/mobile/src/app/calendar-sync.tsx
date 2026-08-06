import type { EnduranceActivity, EnduranceSchedule, ExternalTrainingClassification, PlannedCompletedMatch, TrainingCalendarEvent, TrainingCalendarSource, WorkoutSensorLink } from '@circuit/domain';
import { isMatchEligibleCalendarEvent } from '@circuit/planner';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type AlertButton } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { suggestEnduranceSchedule, syncIcsCalendar } from '@/services/calendar-sync';
import { classifyExternalTrainingActivity, dismissExternalTrainingLink, linkExternalTrainingToWorkout } from '@/services/endurance';
import {
  getLatestTrainingCalendarSource,
  getTrainingCalendarEvents,
  listEnduranceActivities,
  listWorkoutLedgerEntries,
  listWorkoutSensorLinks,
  listPlannedCompletedMatches,
  saveTrainingCalendarSource,
  type WorkoutLedgerEntry,
} from '@/services/database';
import {
  connectStrava,
  disconnectStrava,
  getStravaConnection,
  getStravaSyncState,
  syncStravaActivities,
  type StravaConnection,
} from '@/services/strava';
import { useAuth } from '@/state/auth-context';

export default function CalendarSyncScreen() {
  const router = useRouter();
  const { user, cloudEnabled } = useAuth();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('TrainingPeaks Calendar');
  const [source, setSource] = useState<TrainingCalendarSource | null>(null);
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);
  const [suggestion, setSuggestion] = useState<EnduranceSchedule>({});
  const [strava, setStrava] = useState<StravaConnection | null>(null);
  const [stravaState, setStravaState] = useState<Awaited<ReturnType<typeof getStravaSyncState>>>(null);
  const [activities, setActivities] = useState<EnduranceActivity[]>([]);
  const [matches, setMatches] = useState<PlannedCompletedMatch[]>([]);
  const [sensorLinks, setSensorLinks] = useState<WorkoutSensorLink[]>([]);
  const [strengthWorkouts, setStrengthWorkouts] = useState<WorkoutLedgerEntry[]>([]);
  const [busy, setBusy] = useState<'calendar' | 'strava' | 'activity' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const range = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 14);
    const to = new Date();
    to.setDate(to.getDate() + 28);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const load = useCallback(async () => {
    const [savedSource, savedEvents, savedActivities, savedMatches, savedSensorLinks, savedStrengthWorkouts, connection, syncState] = await Promise.all([
      getLatestTrainingCalendarSource(),
      getTrainingCalendarEvents(range),
      listEnduranceActivities({ from: range.from, to: range.to, limit: 100 }),
      listPlannedCompletedMatches(),
      listWorkoutSensorLinks(),
      listWorkoutLedgerEntries({ from: range.from, to: range.to, limit: 100 }),
      cloudEnabled && user?.mode === 'cloud' ? getStravaConnection().catch(() => null) : Promise.resolve(null),
      getStravaSyncState(),
    ]);
    setSource(savedSource);
    setEvents(savedEvents);
    setSuggestion(suggestEnduranceSchedule(savedEvents));
    setActivities(savedActivities);
    setMatches(savedMatches);
    setSensorLinks(savedSensorLinks);
    setStrengthWorkouts(savedStrengthWorkouts);
    setStrava(connection);
    setStravaState(syncState);
    if (savedSource?.url) { setUrl(savedSource.url); setName(savedSource.name); }
  }, [cloudEnabled, range, user?.mode]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function syncCalendar() {
    setBusy('calendar'); setMessage(null);
    try {
      const result = await syncIcsCalendar({ url, name: name.trim() || 'Training calendar', sourceId: source?.id, force: true });
      setSource(result.source);
      const upcoming = result.events.filter((event) => event.startAt >= range.from && event.startAt <= range.to);
      setEvents(upcoming);
      setSuggestion(suggestEnduranceSchedule(result.events));
      setMessage(result.notModified ? 'Calendar checked; no changes were returned.' : `Synced ${result.events.length} calendar events.`);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Calendar sync failed.');
      await load();
    } finally { setBusy(null); }
  }

  async function toggleAutomaticRefresh() {
    if (!source) return;
    const updated = { ...source, autoRefresh: source.autoRefresh === false, updatedAt: new Date().toISOString() };
    await saveTrainingCalendarSource(updated);
    setSource(updated);
  }

  async function authorizeStrava() {
    setBusy('strava'); setMessage(null);
    try {
      const connected = await connectStrava();
      setStrava(connected);
      setMessage(connected ? 'Strava connected and historical activities imported.' : 'Strava connection was not completed.');
      await load();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Strava connection failed.'); }
    finally { setBusy(null); }
  }

  async function syncStrava() {
    setBusy('strava'); setMessage(null);
    try {
      const needsExternalClassBackfill = !activities.some((activity) => activity.discipline === 'strength' || activity.discipline === 'hiit');
      const result = await syncStravaActivities({ reason: 'manual', backfillDays: needsExternalClassBackfill ? 365 : undefined });
      setMessage(`Strava sync complete: ${result.insertedIds.length} new, ${result.updatedIds.length} updated, ${result.replanCount} high-confidence strength guardrail${result.replanCount === 1 ? '' : 's'}.`);
      await load();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Strava sync failed.'); }
    finally { setBusy(null); }
  }

  async function classifyActivity(activity: EnduranceActivity, classification: ExternalTrainingClassification) {
    setBusy('activity'); setMessage(null);
    try {
      await classifyExternalTrainingActivity(activity.id, classification);
      const label = classification === 'full_body_strength'
        ? 'Full-body strength class'
        : classification === 'conditioning'
          ? 'Conditioning only'
          : classification === 'ignored'
            ? 'Ignored for matching and Training Memory'
            : 'Needs classification';
      setMessage(`${activity.name}: ${label}.`);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Activity classification failed.');
    } finally { setBusy(null); }
  }

  async function linkActivity(activity: EnduranceActivity, workout: WorkoutLedgerEntry) {
    setBusy('activity'); setMessage(null);
    try {
      await linkExternalTrainingToWorkout(activity.id, workout.id);
      setMessage(`${activity.name} linked to ${workout.name}. Watch metrics are attached; muscle credit remains exercise-based.`);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Workout linking failed.');
    } finally { setBusy(null); }
  }

  async function keepActivitySeparate(activity: EnduranceActivity) {
    setBusy('activity'); setMessage(null);
    try {
      await dismissExternalTrainingLink(activity.id);
      setMessage(`${activity.name} will remain separate from Side Quest workout records.`);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Could not keep the activity separate.');
    } finally { setBusy(null); }
  }

  function openActivityClassification(activity: EnduranceActivity) {
    if (activity.discipline !== 'strength' && activity.discipline !== 'hiit') return;
    const link = sensorLinks.find((item) => item.activityId === activity.id);
    const linkedWorkout = link?.workoutId ? strengthWorkouts.find((item) => item.id === link.workoutId) : undefined;
    if (link?.status === 'linked' && linkedWorkout) {
      Alert.alert(
        'Watch data attached',
        `${activity.name} is linked to ${linkedWorkout.name}. Side Quest exercises provide muscle credit; Strava provides ${sensorSummary(activity)}.`,
        [
          { text: 'View Side Quest workout', onPress: () => router.push({ pathname: '/workout-detail', params: { id: linkedWorkout.id } } as never) },
          { text: 'Keep records separate', style: 'destructive', onPress: () => void keepActivitySeparate(activity) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    const possibleWorkout = link?.workoutId ? strengthWorkouts.find((item) => item.id === link.workoutId) : undefined;
    const buttons: AlertButton[] = [];
    if (possibleWorkout) buttons.push({ text: `Link to ${truncate(possibleWorkout.name, 24)}`, onPress: () => void linkActivity(activity, possibleWorkout) });
    buttons.push(
      { text: 'Full-body strength class', onPress: () => void classifyActivity(activity, 'full_body_strength') },
      { text: 'Conditioning only', onPress: () => void classifyActivity(activity, 'conditioning') },
      { text: 'Keep separate', onPress: () => void keepActivitySeparate(activity) },
      { text: 'Cancel', style: 'cancel' },
    );
    Alert.alert(
      possibleWorkout ? 'Possible duplicate workout' : 'Classify external class',
      possibleWorkout
        ? `This watch activity may be the same session as ${possibleWorkout.name}. Linking keeps one canonical workout: exercises from Side Quest, sensor data from Strava.`
        : 'Side Quest will not infer exercise-level muscle credit from Strava alone. Choose how this class should be handled.',
      buttons,
    );
  }

  function confirmDisconnect() {
    Alert.alert('Disconnect Strava?', 'Future Strava updates will stop. Strava credentials, cloud activities, and their local endurance-contribution layer will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => void (async () => {
        setBusy('strava');
        try { await disconnectStrava(); setMessage('Strava disconnected and imported Strava activity data removed.'); await load(); }
        catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Strava disconnect failed.'); }
        finally { setBusy(null); }
      })() },
    ]);
  }

  const visibleActivities = activities;
  const countedActivities = activities.filter((activity) => activity.classification !== 'ignored');
  const matched = matches.filter((item) => item.status === 'matched').length;
  const ambiguous = matches.filter((item) => item.status === 'ambiguous').length;
  const matchablePlans = events.filter(isMatchEligibleCalendarEvent).length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}><Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹ Home</Text></Pressable><Text style={styles.topTitle}>Training connections</Text></View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}><Text style={styles.eyebrow}>V18 CONNECTIONS</Text><Text style={styles.title}>Plan from TrainingPeaks. Confirm with Strava.</Text><Text style={styles.subtitle}>The calendar remains the planned schedule. Strava is read-only completed history. Side Quest matches the two conservatively and never writes back to either service.</Text></View>

        {message ? <View style={styles.messageCard}><Text style={styles.message}>{message}</Text></View> : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>TrainingPeaks / ICS plan</Text><Text style={styles.helper}>Automatically refreshes while the app is active and whenever it returns to the foreground.</Text></View><StatusPill status={source?.syncStatus ?? 'idle'} /></View>
          <Text style={styles.label}>Name</Text><TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Training calendar" placeholderTextColor="#7B867F" />
          <Text style={styles.label}>Private webcal or ICS URL</Text><TextInput value={url} onChangeText={setUrl} style={[styles.input, styles.urlInput]} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="webcal://… or https://…" placeholderTextColor="#7B867F" />
          <Pressable disabled={busy !== null} onPress={() => void syncCalendar()} style={[styles.primaryButton, busy !== null && styles.disabled]}><Text style={styles.primaryButtonText}>{busy === 'calendar' ? 'Syncing…' : source ? 'Refresh now' : 'Connect calendar'}</Text></Pressable>
          {source ? <Pressable onPress={() => void toggleAutomaticRefresh()} style={styles.toggleRow}><View style={[styles.toggle, source.autoRefresh !== false && styles.toggleOn]}><View style={[styles.knob, source.autoRefresh !== false && styles.knobOn]} /></View><View style={{ flex: 1 }}><Text style={styles.toggleTitle}>Automatic refresh</Text><Text style={styles.helper}>{source.autoRefresh === false ? 'Manual only' : `At app start, foreground, and when older than ${source.refreshIntervalMinutes ?? 60} minutes`}</Text></View></Pressable> : null}
          {source?.lastAttemptedAt ? <Text style={styles.helper}>Last attempted {formatDateTime(source.lastAttemptedAt)}</Text> : null}{source?.lastSuccessfulAt ? <Text style={styles.helper}>Last successful {formatDateTime(source.lastSuccessfulAt)} · {source.lastEventCount ?? events.length} events</Text> : null}
          {source?.lastError ? <Text style={styles.errorText}>{source.lastError}. Existing events were preserved.</Text> : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Strava completed training</Text><Text style={styles.helper}>Read-only OAuth, historical backfill, webhook updates, edits, privacy changes, and deletions.</Text></View><StatusPill status={strava?.status === 'connected' ? stravaState?.status ?? 'success' : 'idle'} /></View>
          {!cloudEnabled || user?.mode !== 'cloud' ? <View style={styles.noticeCard}><Text style={styles.noticeTitle}>Cloud account required</Text><Text style={styles.helper}>Strava tokens and webhook processing live in Supabase Edge Functions. Local-only profiles can still use the TrainingPeaks calendar.</Text></View> : null}
          {strava?.status === 'connected' ? <>
            <Text style={styles.connectionTitle}>{strava.athleteName || 'Strava athlete'} connected</Text>
            <Text style={styles.helper}>Scopes: {strava.scopes.join(', ') || 'activity:read_all'} · Last cloud update {formatDateTime(strava.lastWebhookAt ?? strava.lastBackfillAt ?? strava.updatedAt)}</Text>
            <View style={styles.buttonRow}><Pressable disabled={busy !== null} onPress={() => void syncStrava()} style={[styles.primaryButton, styles.flexButton, busy !== null && styles.disabled]}><Text style={styles.primaryButtonText}>{busy === 'strava' ? 'Syncing…' : 'Sync now'}</Text></Pressable><Pressable disabled={busy !== null} onPress={confirmDisconnect} style={[styles.secondaryButton, styles.flexButton]}><Text style={styles.secondaryButtonText}>Disconnect</Text></Pressable></View>
          </> : <Pressable disabled={!cloudEnabled || user?.mode !== 'cloud' || busy !== null} onPress={() => void authorizeStrava()} style={[styles.stravaButton, (!cloudEnabled || user?.mode !== 'cloud' || busy !== null) && styles.disabled]}><Text style={styles.stravaButtonText}>{busy === 'strava' ? 'Connecting…' : 'Connect with Strava'}</Text></Pressable>}
          {stravaState?.lastAttemptedAt ? <Text style={styles.helper}>Last attempted {formatDateTime(stravaState.lastAttemptedAt)}</Text> : null}{stravaState?.lastSuccessfulAt ? <Text style={styles.helper}>Last successful {formatDateTime(stravaState.lastSuccessfulAt)} · {stravaState.importedCount ?? 0} changed activities</Text> : null}{stravaState?.lastError ? <Text style={styles.errorText}>{stravaState.lastError}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Planned versus completed</Text><Text style={styles.helper}>Eligible plan counts only sessions Side Quest can compare with completed swim, bike, run, strength, and HIIT/class records. Matches are one-to-one; uncertain cases remain in Review instead of being forced.</Text>
          <View style={styles.statsRow}><Stat label="Eligible plan" value={matchablePlans} /><Stat label="Completed" value={countedActivities.length} /><Stat label="Matched" value={matched} /><Stat label="Review" value={ambiguous} /></View>
        </View>

        <Pressable onPress={() => router.push('/integration-diagnostics' as never)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Open privacy-safe diagnostics</Text></Pressable>

        <View style={styles.section}><Text style={styles.sectionTitle}>Suggested key days</Text><View style={styles.suggestionRow}><Suggestion label="Swim" value={suggestion.keySwim} /><Suggestion label="Bike" value={suggestion.keyBike} /><Suggestion label="Run" value={suggestion.keyRun} /></View></View>

        <View style={styles.section}><Text style={styles.sectionTitle}>Recent completed training</Text>{visibleActivities.length === 0 ? <Text style={styles.helper}>No completed activities have been imported.</Text> : visibleActivities.slice(0, 10).map((activity) => {
          const match = matches.find((item) => item.activityId === activity.id);
          const sensorLink = sensorLinks.find((item) => item.activityId === activity.id);
          const linkedWorkout = sensorLink?.workoutId ? strengthWorkouts.find((item) => item.id === sensorLink.workoutId) : undefined;
          const externalClass = activity.discipline === 'strength' || activity.discipline === 'hiit';
          return <Pressable key={activity.id} disabled={busy !== null} onPress={() => router.push({ pathname: '/activity-review', params: { id: activity.id } } as never)} style={styles.eventRow}><View style={styles.dateBox}><Text style={styles.dateMonth}>{formatMonth(activity.startLocal ?? activity.startAt)}</Text><Text style={styles.dateDay}>{formatDay(activity.startLocal ?? activity.startAt)}</Text></View><View style={styles.eventCopy}><Text style={styles.eventTitle}>{activity.name}</Text><Text style={styles.helper}>{activityDisciplineLabel(activity)} · {Math.round(activity.movingTimeSeconds / 60)} min · {matchStatusLabel(match)}</Text>{externalClass ? <Text style={styles.classificationText}>{sensorLinkLabel(activity, sensorLink, linkedWorkout)}</Text> : null}<Text style={styles.classificationText}>Tap to review match, source time, classification, or duplicate linking</Text>{hasSensorMetrics(activity) ? <Text style={styles.sensorText}>{sensorSummary(activity)}</Text> : null}</View></Pressable>;
        })}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

function activityDisciplineLabel(activity: EnduranceActivity) { return activity.discipline === 'hiit' ? 'HIIT / class' : titleCase(activity.discipline); }
function matchStatusLabel(match?: PlannedCompletedMatch) {
  if (!match || match.status === 'unmatched') return 'No planned-session match';
  if (match.status === 'ambiguous') return 'Review recommended';
  if (match.status === 'dismissed') return 'No planned-session match · manual';
  return 'Matched to plan';
}
function sensorLinkLabel(activity: EnduranceActivity, link?: WorkoutSensorLink, workout?: WorkoutLedgerEntry) {
  if (link?.status === 'linked' && workout) return `Linked to ${workout.name}; no duplicate muscle credit`;
  if (link?.status === 'ambiguous' && workout) return `Possible duplicate of ${workout.name}`;
  if (link?.status === 'dismissed') return 'Kept separate from Side Quest workouts';
  if (activity.classification === 'full_body_strength') return 'Generic full-body class credit';
  if (activity.classification === 'conditioning') return 'Conditioning only';
  if (activity.classification === 'ignored') return 'Ignored';
  return 'No muscle credit yet · review classification';
}
function hasSensorMetrics(activity: EnduranceActivity) { return Boolean(activity.averageHeartRate || activity.maxHeartRate || activity.relativeEffort || activity.averageWatts || activity.weightedAverageWatts || activity.kilojoules); }
function sensorSummary(activity: EnduranceActivity) {
  const parts = [`${Math.round(activity.movingTimeSeconds / 60)} min`];
  if (activity.averageHeartRate) parts.push(`avg HR ${Math.round(activity.averageHeartRate)}`);
  if (activity.maxHeartRate) parts.push(`max HR ${Math.round(activity.maxHeartRate)}`);
  if (activity.relativeEffort) parts.push(`relative effort ${Math.round(activity.relativeEffort)}`);
  if (activity.weightedAverageWatts) parts.push(`weighted power ${Math.round(activity.weightedAverageWatts)} W`);
  else if (activity.averageWatts) parts.push(`avg power ${Math.round(activity.averageWatts)} W`);
  if (activity.kilojoules) parts.push(`${Math.round(activity.kilojoules)} kJ`);
  return parts.join(' · ');
}
function truncate(value: string, limit: number) { return value.length <= limit ? value : `${value.slice(0, Math.max(1, limit - 1))}…`; }
function StatusPill({ status }: { status: string }) { const error = status === 'error'; const active = status === 'syncing'; return <View style={[styles.statusPill, error && styles.statusError, active && styles.statusBusy]}><Text style={[styles.statusText, error && styles.statusErrorText]}>{status.replaceAll('_', ' ').toUpperCase()}</Text></View>; }
function Suggestion({ label, value }: { label: string; value?: string | null }) { return <View style={styles.suggestionCard}><Text style={styles.suggestionLabel}>{label}</Text><Text style={styles.suggestionValue}>{value ? titleCase(value) : 'None'}</Text></View>; }
function Stat({ label, value }: { label: string; value: number }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
function formatMonth(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(value)).toUpperCase(); }
function formatDay(value: string) { return new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(new Date(value)); }
function titleCase(value: string) { return value.replace(/\b\w/g, (character) => character.toUpperCase()); }

const colors = { background: '#E4EBE3', card: '#FFFDF8', ink: '#01234D', muted: '#6B7770', border: '#164C73', accent: '#153E2F', accentSoft: '#D8E9DF', warm: '#F4E7D2', danger: '#9B2C2C', strava: '#FC5200' };
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background }, topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }, backButton: { flex: 1, paddingVertical: 6 }, backText: { color: colors.accent, fontSize: 16, fontWeight: '700' }, topTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 60, gap: 16 }, intro: { gap: 6 }, eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, title: { color: colors.ink, fontSize: 29, fontWeight: '700', lineHeight: 35 }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 }, helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  section: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 17, gap: 10 }, sectionHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' }, label: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 3 }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: colors.ink, backgroundColor: '#FAFBFA', fontSize: 15 }, urlInput: { minHeight: 52 },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 }, primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' }, secondaryButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 }, secondaryButtonText: { color: colors.accent, fontSize: 15, fontWeight: '800' }, stravaButton: { backgroundColor: colors.strava, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }, stravaButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, disabled: { opacity: 0.5 },
  buttonRow: { flexDirection: 'row', gap: 8 }, flexButton: { flex: 1 }, messageCard: { backgroundColor: colors.accentSoft, borderRadius: 15, padding: 13 }, message: { color: colors.accent, fontSize: 13, fontWeight: '700', lineHeight: 19 }, errorText: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '700' }, noticeCard: { backgroundColor: colors.warm, borderRadius: 15, padding: 13, gap: 4 }, noticeTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, connectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }, toggle: { width: 46, height: 27, borderRadius: 14, backgroundColor: colors.border, padding: 3 }, toggleOn: { backgroundColor: colors.accent }, knob: { width: 21, height: 21, borderRadius: 11, backgroundColor: colors.card }, knobOn: { marginLeft: 19 }, toggleTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  statusPill: { backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, statusBusy: { opacity: 0.65 }, statusError: { backgroundColor: '#F5DDDD' }, statusText: { color: colors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 }, statusErrorText: { color: colors.danger },
  statsRow: { flexDirection: 'row', gap: 7 }, stat: { flex: 1, backgroundColor: colors.background, borderRadius: 12, paddingVertical: 11, alignItems: 'center' }, statValue: { color: colors.accent, fontSize: 20, fontWeight: '900' }, statLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  suggestionRow: { flexDirection: 'row', gap: 8 }, suggestionCard: { flex: 1, backgroundColor: colors.accentSoft, borderRadius: 13, padding: 11, gap: 3 }, suggestionLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }, suggestionValue: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  eventRow: { flexDirection: 'row', gap: 11, alignItems: 'center', paddingVertical: 5 }, classificationText: { color: colors.accent, fontSize: 11, fontWeight: '700', marginTop: 2 }, sensorText: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 2 }, dateBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, dateMonth: { color: colors.accent, fontSize: 9, fontWeight: '900' }, dateDay: { color: colors.ink, fontSize: 18, fontWeight: '900' }, eventCopy: { flex: 1 }, eventTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
});
