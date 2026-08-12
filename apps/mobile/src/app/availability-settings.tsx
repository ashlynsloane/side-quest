import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { V23Card, V23Icon, V23OutlineButton, V23PageIntro, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import {
  getDefaultTrainingAvailabilityProfile,
  loadTrainingAvailabilityProfile,
  saveTrainingAvailabilityProfile,
  type AvailabilityException,
  type SportTimePreference,
  type TrainingAvailabilityProfile,
} from '@/services/training-availability';
import { refreshLatestWholeAthletePlan } from '@/services/whole-athlete-plan-runtime';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DISCIPLINES: SportTimePreference['discipline'][] = ['swim', 'bike', 'run', 'strength'];
const DAY_PARTS: Array<{ value: SportTimePreference['preferredDayPart']; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'morning', label: 'AM' },
  { value: 'midday', label: 'Midday' },
  { value: 'evening', label: 'PM' },
];

export default function AvailabilitySettingsScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [profile, setProfile] = useState<TrainingAvailabilityProfile>(() => loadTrainingAvailabilityProfile());
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionMode, setExceptionMode] = useState<AvailabilityException['mode']>('unavailable');
  const [exceptionStart, setExceptionStart] = useState(17 * 60 + 30);
  const [exceptionEnd, setExceptionEnd] = useState(20 * 60);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (profile.enabled && profile.weekly.every((day) => day.windows.length === 0)) {
      setMessage('Add at least one normal weekly training window before turning availability scheduling on.');
      return;
    }
    setSaving(true);
    setMessage(null);
    saveTrainingAvailabilityProfile(profile);
    try {
      await refreshLatestWholeAthletePlan();
      router.back();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Availability was saved, but the plan needs a refresh.');
    } finally {
      setSaving(false);
    }
  };

  const addWindow = (weekday: number) => {
    setProfile((current) => ({
      ...current,
      weekly: current.weekly.map((day) => {
        if (day.weekday !== weekday || day.windows.length >= 2) return day;
        const evening = day.windows.length > 0;
        return {
          ...day,
          windows: [...day.windows, {
            id: `weekly:${weekday}:${Date.now()}`,
            startMinutes: evening ? 17 * 60 : 6 * 60,
            endMinutes: evening ? 20 * 60 : 9 * 60,
          }],
        };
      }),
    }));
  };

  const shiftWindow = (weekday: number, id: string, edge: 'start' | 'end', delta: number) => {
    setProfile((current) => ({
      ...current,
      weekly: current.weekly.map((day) => day.weekday !== weekday ? day : {
        ...day,
        windows: day.windows.map((window) => {
          if (window.id !== id) return window;
          if (edge === 'start') {
            const startMinutes = clamp(window.startMinutes + delta, 0, window.endMinutes - 30);
            return { ...window, startMinutes };
          }
          const endMinutes = clamp(window.endMinutes + delta, window.startMinutes + 30, 24 * 60);
          return { ...window, endMinutes };
        }),
      }),
    }));
  };

  const removeWindow = (weekday: number, id: string) => {
    setProfile((current) => ({
      ...current,
      weekly: current.weekly.map((day) => day.weekday === weekday ? { ...day, windows: day.windows.filter((window) => window.id !== id) } : day),
    }));
  };

  const addException = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exceptionDate)) {
      setMessage('Enter the exception date as YYYY-MM-DD.');
      return;
    }
    if (exceptionMode !== 'unavailable' && exceptionEnd <= exceptionStart) {
      setMessage('The exception end time needs to be after the start time.');
      return;
    }
    const next: AvailabilityException = {
      id: `exception:${Date.now()}`,
      date: exceptionDate,
      mode: exceptionMode,
      ...(exceptionMode !== 'unavailable' ? { startMinutes: exceptionStart, endMinutes: exceptionEnd } : {}),
    };
    setProfile((current) => ({ ...current, exceptions: [...current.exceptions, next].sort((a, b) => a.date.localeCompare(b.date)) }));
    setExceptionDate('');
    setMessage(null);
  };

  const updatePreference = (discipline: SportTimePreference['discipline'], updater: (value: SportTimePreference) => SportTimePreference) => {
    setProfile((current) => ({
      ...current,
      preferences: current.preferences.map((item) => item.discipline === discipline ? updater(item) : item),
    }));
  };

  return <V23Screen contentStyle={styles.page}>
    <V23PageIntro
      label="SCHEDULE"
      title="When can you train?"
      body="Set your normal weekly windows, protect a rest day, and choose the sport weekdays that need to stay consistent. Time-of-day preferences stay flexible inside those anchors."
    />

    <V23Card style={styles.enableCard}>
      <View style={styles.enableCopy}>
        <Text style={styles.cardTitle}>Use availability scheduling</Text>
        <Text style={styles.helper}>Off keeps the current day-only planning behavior. On gives generated sessions real times and prevents Side Quest from placing them outside your saved windows.</Text>
      </View>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: profile.enabled }} onPress={() => setProfile((current) => ({ ...current, enabled: !current.enabled }))} style={[styles.switch, profile.enabled && styles.switchOn]}>
        <View style={[styles.knob, profile.enabled && styles.knobOn]} />
      </Pressable>
    </V23Card>

    <View>
      <V23SectionHeader detail="Weekly anchor">REST DAY</V23SectionHeader>
      <V23Card style={styles.preferenceCard}>
        <Text style={styles.preferenceTitle}>Protected rest day</Text>
        <Text style={styles.helper}>Generated training will not be moved onto this day. Change it when your real weekly schedule uses a different recovery day.</Text>
        <View style={styles.dayChips}>{SHORT_DAYS.map((label, weekday) => {
          const selected = profile.restWeekday === weekday;
          return <Pressable key={`rest:${weekday}`} onPress={() => setProfile((current) => ({ ...current, restWeekday: weekday as TrainingAvailabilityProfile['restWeekday'] }))} style={[styles.dayChip, selected && styles.dayChipSelected]}><Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>{label}</Text></Pressable>;
        })}</View>
      </V23Card>
    </View>

    <View>
      <V23SectionHeader>YOUR NORMAL WEEK</V23SectionHeader>
      <View style={styles.dayStack}>
        {profile.weekly.map((day) => <V23Card key={day.weekday} style={styles.dayCard}>
          <View style={styles.dayHeader}>
            <View>
              <Text style={styles.dayTitle}>{DAYS[day.weekday]}</Text>
              <Text style={styles.helper}>{day.windows.length ? `${day.windows.length} training window${day.windows.length === 1 ? '' : 's'}` : 'Unavailable'}</Text>
            </View>
            {day.windows.length < 2 ? <Pressable onPress={() => addWindow(day.weekday)} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}><Text style={styles.smallButtonText}>+ Add window</Text></Pressable> : null}
          </View>
          {day.windows.map((window) => <View key={window.id} style={styles.windowRow}>
            <TimeStepper value={window.startMinutes} onBack={() => shiftWindow(day.weekday, window.id, 'start', -30)} onForward={() => shiftWindow(day.weekday, window.id, 'start', 30)} styles={styles} />
            <Text style={styles.to}>to</Text>
            <TimeStepper value={window.endMinutes} onBack={() => shiftWindow(day.weekday, window.id, 'end', -30)} onForward={() => shiftWindow(day.weekday, window.id, 'end', 30)} styles={styles} />
            <Pressable accessibilityLabel={`Remove ${DAYS[day.weekday]} window`} onPress={() => removeWindow(day.weekday, window.id)} style={styles.remove}><Text style={styles.removeText}>×</Text></Pressable>
          </View>)}
        </V23Card>)}
      </View>
    </View>

    <View>
      <V23SectionHeader detail="One-off changes">EXCEPTIONS</V23SectionHeader>
      <V23Card style={styles.exceptionEditor}>
        <Text style={styles.cardTitle}>Something different that day?</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          placeholder="YYYY-MM-DD"
          placeholderTextColor={tokens.textMuted}
          value={exceptionDate}
          onChangeText={setExceptionDate}
          style={styles.dateInput}
        />
        <View style={styles.chips}>
          <Choice label="Unavailable" selected={exceptionMode === 'unavailable'} onPress={() => setExceptionMode('unavailable')} styles={styles} />
          <Choice label="Block time" selected={exceptionMode === 'block'} onPress={() => setExceptionMode('block')} styles={styles} />
          <Choice label="Only these hours" selected={exceptionMode === 'replace'} onPress={() => setExceptionMode('replace')} styles={styles} />
        </View>
        {exceptionMode !== 'unavailable' ? <View style={styles.exceptionTimeRow}>
          <TimeStepper value={exceptionStart} onBack={() => setExceptionStart((value) => clamp(value - 30, 0, exceptionEnd - 30))} onForward={() => setExceptionStart((value) => clamp(value + 30, 0, exceptionEnd - 30))} styles={styles} />
          <Text style={styles.to}>to</Text>
          <TimeStepper value={exceptionEnd} onBack={() => setExceptionEnd((value) => clamp(value - 30, exceptionStart + 30, 24 * 60))} onForward={() => setExceptionEnd((value) => clamp(value + 30, exceptionStart + 30, 24 * 60))} styles={styles} />
        </View> : null}
        <Pressable onPress={addException} style={({ pressed }) => [styles.addException, pressed && styles.pressed]}><Text style={styles.addExceptionText}>Add exception</Text></Pressable>
      </V23Card>

      {profile.exceptions.length ? <View style={styles.exceptionList}>{profile.exceptions.map((exception) => <V23Card key={exception.id} style={styles.exceptionCard}>
        <View style={styles.exceptionCopy}>
          <Text style={styles.exceptionDate}>{formatDate(exception.date)}</Text>
          <Text style={styles.helper}>{exceptionLabel(exception)}</Text>
        </View>
        <Pressable onPress={() => setProfile((current) => ({ ...current, exceptions: current.exceptions.filter((item) => item.id !== exception.id) }))} style={styles.remove}><Text style={styles.removeText}>×</Text></Pressable>
      </V23Card>)}</View> : null}
    </View>

    <View>
      <V23SectionHeader detail="Sport constraints">SPORT AVAILABILITY</V23SectionHeader>
      <Text style={styles.sectionHelper}>Select every day this sport is possible. These choices limit where Side Quest may place the sport; they do not set weekly frequency or require a workout on every selected day. Leave the weekdays empty when any available training day can work. Time of day remains flexible.</Text>
      <View style={styles.preferenceStack}>{DISCIPLINES.map((discipline) => {
        const preference = profile.preferences.find((item) => item.discipline === discipline) ?? { discipline, preferredWeekdays: [], preferredDayPart: 'any' as const };
        return <V23Card key={discipline} style={styles.preferenceCard}>
          <Text style={styles.preferenceTitle}>{discipline[0]!.toUpperCase() + discipline.slice(1)}</Text>
          <View style={styles.chips}>{DAY_PARTS.map((part) => <Choice key={part.value} label={part.label} selected={preference.preferredDayPart === part.value} onPress={() => updatePreference(discipline, (value) => ({ ...value, preferredDayPart: part.value }))} styles={styles} />)}</View>
          <View style={styles.dayChips}>{SHORT_DAYS.map((label, weekday) => {
            const selected = preference.preferredWeekdays.includes(weekday);
            return <Pressable key={`${discipline}:${weekday}`} onPress={() => updatePreference(discipline, (value) => ({ ...value, preferredWeekdays: selected ? value.preferredWeekdays.filter((day) => day !== weekday) : [...value.preferredWeekdays, weekday].sort() }))} style={[styles.dayChip, selected && styles.dayChipSelected]}><Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>{label}</Text></Pressable>;
          })}</View>
        </V23Card>;
      })}</View>
    </View>

    {message ? <V23Card style={styles.messageCard}><Text style={styles.message}>{message}</Text></V23Card> : null}

    <View style={styles.actions}>
      <Pressable disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, saving && styles.disabled]}>
        <V23Icon name="check" color="#FFFFFF" size={16} />
        <Text style={styles.saveText}>{saving ? 'Updating plan…' : 'Save and update plan'}</Text>
      </Pressable>
      <V23OutlineButton onPress={() => setProfile(getDefaultTrainingAvailabilityProfile())}>Reset availability</V23OutlineButton>
      <V23OutlineButton onPress={() => router.back()}>Back</V23OutlineButton>
    </View>
  </V23Screen>;
}

function TimeStepper({ value, onBack, onForward, styles }: { value: number; onBack: () => void; onForward: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.timeStepper}>
    <Pressable onPress={onBack} style={styles.timeArrow}><Text style={styles.timeArrowText}>‹</Text></Pressable>
    <Text style={styles.timeText}>{formatMinutes(value)}</Text>
    <Pressable onPress={onForward} style={styles.timeArrow}><Text style={styles.timeArrowText}>›</Text></Pressable>
  </View>;
}

function Choice({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: ReturnType<typeof makeStyles> }) {
  return <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

function exceptionLabel(exception: AvailabilityException): string {
  if (exception.mode === 'unavailable') return 'Unavailable all day';
  const range = `${formatMinutes(exception.startMinutes ?? 0)}–${formatMinutes(exception.endMinutes ?? 0)}`;
  return exception.mode === 'replace' ? `Only available ${range}` : `Busy ${range}`;
}

function formatMinutes(value: number): string {
  if (value >= 24 * 60) return '12:00 AM';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { paddingTop: 16, paddingBottom: 38, gap: 22 },
    enableCard: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
    enableCopy: { flex: 1, gap: 4 },
    cardTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    helper: { color: tokens.textMuted, fontSize: 12, lineHeight: 17 },
    switch: { width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: tokens.surfaceMuted, borderWidth: 1, borderColor: tokens.border },
    switchOn: { backgroundColor: tokens.accent, borderColor: tokens.accent },
    knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: tokens.surface },
    knobOn: { alignSelf: 'flex-end', backgroundColor: '#FFFFFF' },
    dayStack: { gap: 8 },
    dayCard: { padding: 14, gap: 11 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    dayTitle: { color: tokens.text, fontSize: 15, lineHeight: 19, fontWeight: '900' },
    smallButton: { minHeight: 34, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    smallButtonText: { color: tokens.accent, fontSize: 11, fontWeight: '850' as never },
    windowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    timeStepper: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, backgroundColor: tokens.surfaceMuted, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden' },
    timeArrow: { width: 30, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
    timeArrowText: { color: tokens.accent, fontSize: 22, lineHeight: 25, fontWeight: '700' },
    timeText: { color: tokens.text, fontSize: 11.5, fontWeight: '850' as never },
    to: { color: tokens.textMuted, fontSize: 11, fontWeight: '700' },
    remove: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surfaceMuted },
    removeText: { color: tokens.textMuted, fontSize: 20, lineHeight: 22 },
    exceptionEditor: { padding: 15, gap: 12 },
    dateInput: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, color: tokens.text, paddingHorizontal: 13, fontSize: 14, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    choice: { minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
    choiceSelected: { borderColor: tokens.accent, backgroundColor: tokens.surfaceMuted },
    choiceText: { color: tokens.textMuted, fontSize: 11, fontWeight: '800' },
    choiceTextSelected: { color: tokens.accent },
    exceptionTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    addException: { minHeight: 42, borderRadius: 13, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center' },
    addExceptionText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
    exceptionList: { gap: 7, marginTop: 8 },
    exceptionCard: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
    exceptionCopy: { flex: 1, gap: 2 },
    exceptionDate: { color: tokens.text, fontSize: 13, fontWeight: '850' as never },
    sectionHelper: { color: tokens.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 9 },
    preferenceStack: { gap: 8 },
    preferenceCard: { padding: 14, gap: 10 },
    preferenceTitle: { color: tokens.text, fontSize: 14, lineHeight: 18, fontWeight: '900' },
    dayChips: { flexDirection: 'row', gap: 6 },
    dayChip: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    dayChipSelected: { backgroundColor: tokens.accent, borderColor: tokens.accent },
    dayChipText: { color: tokens.textMuted, fontSize: 11, fontWeight: '850' as never },
    dayChipTextSelected: { color: '#FFFFFF' },
    messageCard: { padding: 14, backgroundColor: tokens.surfaceMuted },
    message: { color: tokens.text, fontSize: 12.5, lineHeight: 18, fontWeight: '750' as never },
    actions: { gap: 9 },
    saveButton: { minHeight: 48, borderRadius: 14, backgroundColor: tokens.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    saveText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
    disabled: { opacity: 0.55 },
    pressed: { opacity: 0.72 },
  });
}
