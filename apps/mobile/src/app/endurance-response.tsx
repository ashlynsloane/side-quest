import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardSafeScreen } from '@/components/keyboard-safe-screen';
import { V23Icon } from '@/components/v23-ui';
import {
  saveEnduranceSessionResponse,
  type EnduranceSessionNextDayStatus,
  type EnduranceSessionPerceivedDifficulty,
  type EnduranceSessionResponseRecord,
} from '@/services/database';
import { enduranceSessionRole } from '@/services/completed-workout-adaptation';
import { loadTrainingHistory, type EnduranceHistoryItem } from '@/services/training-history';
import { refreshLatestWholeAthletePlan } from '@/services/whole-athlete-plan-runtime';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

type SymptomTiming = 'none' | 'during' | 'after' | 'during_and_after';

export default function EnduranceResponseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ activityId?: string; stage?: 'post_session' | 'next_day' }>();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [item, setItem] = useState<EnduranceHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [difficulty, setDifficulty] = useState<EnduranceSessionPerceivedDifficulty | null>(null);
  const [sessionRpe, setSessionRpe] = useState<number | null>(null);
  const [symptomTiming, setSymptomTiming] = useState<SymptomTiming | null>(null);
  const [nextDayStatus, setNextDayStatus] = useState<EnduranceSessionNextDayStatus | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let live = true;
    void loadTrainingHistory(500).then((history) => {
      if (!live) return;
      const found = history.find((entry): entry is EnduranceHistoryItem =>
        entry.kind === 'endurance' && entry.activity.id === params.activityId) ?? null;
      setItem(found);
      if (found?.response) {
        setDifficulty(found.response.perceivedDifficulty ?? null);
        setSessionRpe(found.response.sessionRpe ?? null);
        setSymptomTiming(symptomTimingFromRecord(found.response));
        setNextDayStatus(found.response.nextDayStatus ?? null);
        setNotes(found.response.notes ?? '');
      }
      setLoading(false);
    }).catch(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, [params.activityId]);

  const stage = params.stage === 'next_day' ? 'next_day' : 'post_session';
  const discipline = item?.activity.discipline;
  const isRtr = Boolean(item?.plannedEvent && discipline === 'run'
    && enduranceSessionRole(item.plannedEvent.title, item.plannedEvent.description ?? '', 'run') === 'return_to_run');
  const canSave = stage === 'next_day'
    ? Boolean(nextDayStatus)
    : Boolean(difficulty && symptomTiming);

  async function save() {
    if (!item?.plannedEvent || !canSave || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const existing = item.response;
      const symptoms = symptomsFromTiming(symptomTiming);
      const response: EnduranceSessionResponseRecord = {
        activityId: item.activity.id,
        plannedEventId: item.plannedEvent.id,
        perceivedDifficulty: difficulty ?? existing?.perceivedDifficulty,
        sessionRpe: sessionRpe ?? existing?.sessionRpe,
        symptomsDuring: stage === 'post_session' ? symptoms.during : existing?.symptomsDuring,
        symptomsAfter: stage === 'post_session' ? symptoms.after : existing?.symptomsAfter,
        nextDayStatus: nextDayStatus ?? existing?.nextDayStatus,
        notes: notes.trim() || existing?.notes,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await saveEnduranceSessionResponse(response);
      await refreshLatestWholeAthletePlan().catch(() => null);
      router.replace('/(tabs)/plan' as Href);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.center}><Text style={styles.body}>Loading session…</Text></View></SafeAreaView>;
  }

  if (!item?.plannedEvent) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.center}>
      <Text style={styles.title}>Session response unavailable</Text>
      <Text style={styles.body}>This completed activity is no longer linked to a Side Quest prescription.</Text>
      <Pressable onPress={() => router.replace('/(tabs)/plan' as Href)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Back to Week</Text></Pressable>
    </View></SafeAreaView>;
  }

  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
    <KeyboardSafeScreen contentContainerStyle={styles.page}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.replace('/(tabs)/plan' as Href)} style={styles.backButton}>
          <Text style={styles.backText}>‹ Week</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{stage === 'next_day' ? 'NEXT-DAY CHECK' : 'SESSION RESPONSE'}</Text>
        <Text style={styles.title}>{stage === 'next_day' ? 'How are you today?' : 'How did this session go?'}</Text>
        <Text style={styles.sessionTitle}>{item.plannedEvent.title}</Text>
        <Text style={styles.body}>{stage === 'next_day'
          ? 'Return-to-run only progresses after the next day is stable. This check is about symptoms or function, not soreness from ordinary training.'
          : 'A quick response helps Side Quest distinguish “completed” from “tolerated well.” It will inform the next planning decision, not rewrite this week.'}</Text>
      </View>

      {stage === 'post_session' ? <>
        <QuestionCard title="How did the prescription feel?" body="Choose the overall session response, not the hardest single minute." styles={styles}>
          <ChoiceRow
            choices={[
              ['too_easy', 'Too easy'],
              ['about_right', 'About right'],
              ['too_hard', 'Too hard'],
            ]}
            value={difficulty}
            onChange={(value) => setDifficulty(value as EnduranceSessionPerceivedDifficulty)}
            styles={styles}
          />
        </QuestionCard>

        <QuestionCard title="Whole-session effort" body="Optional. Use 1–10 RPE for the session as a whole." styles={styles}>
          <View style={styles.rpeRow}>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <Pressable
              key={value}
              onPress={() => setSessionRpe(value)}
              style={[styles.rpeButton, sessionRpe === value && styles.choiceSelected]}
            ><Text style={[styles.rpeText, sessionRpe === value && styles.choiceTextSelected]}>{value}</Text></Pressable>)}
          </View>
        </QuestionCard>

        <QuestionCard
          title={isRtr ? 'Any symptoms during or after?' : 'Any concerning symptoms during or after?'}
          body={isRtr
            ? 'For return-to-run, this is part of the progression gate.'
            : 'This is separate from normal training fatigue.'}
          styles={styles}
        >
          <ChoiceRow
            choices={[
              ['none', 'None'],
              ['during', 'During'],
              ['after', 'After'],
              ['during_and_after', 'During + after'],
            ]}
            value={symptomTiming}
            onChange={(value) => setSymptomTiming(value as SymptomTiming)}
            styles={styles}
          />
        </QuestionCard>
      </> : <QuestionCard
        title="Compared with before the run, are symptoms or function…"
        body="Return-to-run progression requires the next day to be the same or better."
        styles={styles}
      >
        <ChoiceRow
          choices={[
            ['same_or_better', 'Same or better'],
            ['worse', 'Worse'],
          ]}
          value={nextDayStatus}
          onChange={(value) => setNextDayStatus(value as EnduranceSessionNextDayStatus)}
          styles={styles}
        />
      </QuestionCard>}

      <View style={styles.noteCard}>
        <Text style={styles.questionTitle}>Optional note</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Anything the Coach should know?"
          placeholderTextColor={tokens.textMuted}
          style={styles.noteInput}
        />
      </View>

      {isRtr ? <View style={styles.safetyCard}>
        <V23Icon name="heart" color={tokens.warning} size={18} />
        <Text style={styles.safetyText}>RTR progression still respects active training restrictions and symptom check-ins. A completed run never overrides those guardrails.</Text>
      </View> : null}

      <Pressable
        disabled={!canSave || saving}
        onPress={() => void save()}
        style={[styles.primaryButton, (!canSave || saving) && styles.disabled]}
      >
        <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : stage === 'next_day' ? 'Save next-day check' : 'Save response'}</Text>
      </Pressable>
    </KeyboardSafeScreen>
  </SafeAreaView>;
}

function QuestionCard({ title, body, children, styles }: {
  title: string;
  body: string;
  children: React.ReactNode;
  styles: ReturnType<typeof makeStyles>;
}) {
  return <View style={styles.card}>
    <Text style={styles.questionTitle}>{title}</Text>
    <Text style={styles.questionBody}>{body}</Text>
    {children}
  </View>;
}

function ChoiceRow({ choices, value, onChange, styles }: {
  choices: Array<[string, string]>;
  value: string | null;
  onChange: (value: string) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return <View style={styles.choiceRow}>{choices.map(([key, label]) => <Pressable
    key={key}
    onPress={() => onChange(key)}
    style={[styles.choice, value === key && styles.choiceSelected]}
  ><Text style={[styles.choiceText, value === key && styles.choiceTextSelected]}>{label}</Text></Pressable>)}</View>;
}

function symptomsFromTiming(value: SymptomTiming | null): { during?: boolean; after?: boolean } {
  if (!value) return {};
  return {
    during: value === 'during' || value === 'during_and_after',
    after: value === 'after' || value === 'during_and_after',
  };
}

function symptomTimingFromRecord(
  response: EnduranceSessionResponseRecord,
): SymptomTiming | null {
  if (response.symptomsDuring === undefined || response.symptomsAfter === undefined) return null;
  if (response.symptomsDuring && response.symptomsAfter) return 'during_and_after';
  if (response.symptomsDuring) return 'during';
  if (response.symptomsAfter) return 'after';
  return 'none';
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.canvas },
    page: { padding: 18, paddingBottom: 36, gap: 12 },
    center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
    topBar: { minHeight: 38, justifyContent: 'center' },
    backButton: { minHeight: 38, justifyContent: 'center', alignSelf: 'flex-start' },
    backText: { color: tokens.accent, fontSize: 14, fontWeight: '850' as never },
    hero: { borderRadius: 20, backgroundColor: tokens.header, padding: 18, gap: 6 },
    eyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.9 },
    title: { color: '#FFFFFF', fontSize: 25, lineHeight: 30, fontWeight: '900' },
    sessionTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 21, fontWeight: '800' },
    body: { color: tokens.textMuted, fontSize: 14, lineHeight: 20 },
    card: { borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 15, gap: 8 },
    questionTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '850' as never },
    questionBody: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 3 },
    choice: { minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
    choiceSelected: { borderColor: tokens.accent, backgroundColor: tokens.accentSoft },
    choiceText: { color: tokens.text, fontSize: 12.5, lineHeight: 16, fontWeight: '800' },
    choiceTextSelected: { color: tokens.accent },
    rpeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    rpeButton: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    rpeText: { color: tokens.text, fontSize: 12.5, fontWeight: '850' as never },
    noteCard: { borderRadius: 18, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 15, gap: 8 },
    noteInput: { minHeight: 86, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, color: tokens.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, lineHeight: 20, textAlignVertical: 'top' },
    safetyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 14, backgroundColor: tokens.surfaceMuted, padding: 12 },
    safetyText: { flex: 1, color: tokens.textMuted, fontSize: 12, lineHeight: 17 },
    primaryButton: { minHeight: 52, borderRadius: 16, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '900' },
    disabled: { opacity: 0.42 },
  });
}
