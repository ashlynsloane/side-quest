import type { Exercise, GeneratedWorkout, WorkoutExercisePrescription, WorkoutStation } from '@circuit/domain';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { V23Icon } from '@/components/v23-ui';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export function WorkoutEditorModal({
  workout,
  originalWorkout,
  exercises,
  visible,
  onClose,
  onSave,
}: {
  workout: GeneratedWorkout;
  originalWorkout: GeneratedWorkout;
  exercises: Exercise[];
  visible: boolean;
  onClose: () => void;
  onSave: (workout: GeneratedWorkout) => void;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [draft, setDraft] = useState<GeneratedWorkout>(() => cloneWorkout(workout));
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    setDraft(cloneWorkout(workout));
    setAddTarget(null);
    setSearch('');
  }, [visible, workout]);

  function updateStation(stationId: string, updater: (station: WorkoutStation) => WorkoutStation) {
    setDraft((current) => recalculateWorkout({
      ...current,
      stations: current.stations.map((station) => station.id === stationId ? updater(station) : station),
    }));
  }

  function updateExercise(stationId: string, exerciseId: string, update: Partial<WorkoutExercisePrescription>) {
    updateStation(stationId, (station) => ({
      ...station,
      exercises: station.exercises.map((item) => item.exerciseId === exerciseId ? { ...item, ...update } : item),
    }));
  }

  function removeExercise(stationId: string, exerciseId: string) {
    updateStation(stationId, (station) => ({
      ...station,
      exercises: station.exercises
        .filter((item) => item.exerciseId !== exerciseId)
        .map((item, index) => ({ ...item, order: index + 1 })),
    }));
  }

  function moveExercise(stationId: string, exerciseId: string, delta: -1 | 1) {
    updateStation(stationId, (station) => {
      const index = station.exercises.findIndex((item) => item.exerciseId === exerciseId);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= station.exercises.length) return station;
      const next = [...station.exercises];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return { ...station, exercises: next.map((item, order) => ({ ...item, order: order + 1 })) };
    });
  }

  function addExercise(stationId: string, exercise: Exercise) {
    updateStation(stationId, (station) => {
      if (station.exercises.some((item) => item.exerciseId === exercise.id)) return station;
      const prescription = exercise.prescriptions.find((item) => item.style === 'amrap') ?? exercise.prescriptions[0];
      const equipment = exercise.equipmentOptions.find((option) => option.items.every((item) => item.optional || draft.request.availableEquipment.includes(item.equipmentId))) ?? exercise.equipmentOptions[0];
      if (!prescription || !equipment) return station;
      const item: WorkoutExercisePrescription = {
        exerciseId: exercise.id,
        exerciseSnapshot: exercise,
        equipmentOptionId: equipment.id,
        prescriptionId: prescription.id,
        target: prescription.target,
        unit: prescription.unit,
        order: station.exercises.length + 1,
        adaptationNote: 'Added by athlete before starting.',
      };
      return { ...station, exercises: [...station.exercises, item] };
    });
    setAddTarget(null);
    setSearch('');
  }

  const candidates = useMemo(() => {
    if (!addTarget) return [];
    const station = draft.stations.find((item) => item.id === addTarget);
    const existing = new Set(station?.exercises.map((item) => item.exerciseId) ?? []);
    const query = search.trim().toLowerCase();
    return exercises
      .filter((exercise) => exercise.status === 'active' && exercise.defaultEnabled && exercise.suitableForAmrap)
      .filter((exercise) => !existing.has(exercise.id))
      .filter((exercise) => exercise.equipmentOptions.some((option) => option.items.every((item) => item.optional || draft.request.availableEquipment.includes(item.equipmentId))))
      .filter((exercise) => !query || `${exercise.name} ${exercise.category} ${exercise.aliases.join(' ')}`.toLowerCase().includes(query))
      .slice(0, 60);
  }, [addTarget, draft.request.availableEquipment, draft.stations, exercises, search]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.topAction}><Text style={styles.topActionText}>Cancel</Text></Pressable>
          <Text style={styles.topTitle}>Edit workout</Text>
          <Pressable onPress={() => onSave(recalculateWorkout(draft))} style={styles.topAction}><Text style={styles.saveText}>Done</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{draft.name}</Text>
            <Text style={styles.summaryMeta}>{Math.round(draft.estimatedElapsedSeconds / 60)} min total · {draft.stations.length} stations</Text>
            <Pressable onPress={() => setDraft(cloneWorkout(originalWorkout))} style={styles.resetButton}><Text style={styles.resetText}>Reset generated workout</Text></Pressable>
          </View>

          {draft.stations.map((station) => (
            <View key={station.id} style={styles.stationCard}>
              <View style={styles.stationHeader}>
                <View style={{ flex: 1 }}><Text style={styles.eyebrow}>STATION {station.order}</Text><Text style={styles.stationTitle}>{station.purpose}</Text></View>
                <View style={styles.durationControl}>
                  <Pressable onPress={() => updateStation(station.id, (item) => ({ ...item, durationSeconds: Math.max(60, item.durationSeconds - 60) }))} style={styles.stepButton}><Text style={styles.stepText}>−</Text></Pressable>
                  <Text style={styles.durationText}>{Math.round(station.durationSeconds / 60)} min</Text>
                  <Pressable onPress={() => updateStation(station.id, (item) => ({ ...item, durationSeconds: Math.min(1800, item.durationSeconds + 60) }))} style={styles.stepButton}><Text style={styles.stepText}>+</Text></Pressable>
                </View>
              </View>

              {station.exercises.map((item, index) => (
                <View key={item.exerciseId} style={[styles.exerciseCard, index === station.exercises.length - 1 && styles.exerciseCardLast]}>
                  <View style={styles.exerciseHeader}>
                    <Text style={styles.exerciseName}>{item.exerciseSnapshot.name}</Text>
                    <View style={styles.reorderRow}>
                      <Pressable disabled={index === 0} onPress={() => moveExercise(station.id, item.exerciseId, -1)} style={[styles.iconButton, index === 0 && styles.disabled]}><Text style={styles.iconButtonText}>↑</Text></Pressable>
                      <Pressable disabled={index === station.exercises.length - 1} onPress={() => moveExercise(station.id, item.exerciseId, 1)} style={[styles.iconButton, index === station.exercises.length - 1 && styles.disabled]}><Text style={styles.iconButtonText}>↓</Text></Pressable>
                      <Pressable onPress={() => removeExercise(station.id, item.exerciseId)} style={styles.iconButton}><Text style={styles.removeText}>Remove</Text></Pressable>
                    </View>
                  </View>
                  <View style={styles.prescriptionRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>{item.unit === 'seconds' ? 'SECONDS' : item.unit === 'per_side' ? 'REPS / SIDE' : 'REPS'}</Text>
                      <TextInput
                        value={String(item.target)}
                        onChangeText={(value) => updateExercise(station.id, item.exerciseId, { target: Math.max(1, Number(value.replace(/[^0-9.]/g, '')) || 1) })}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        style={styles.input}
                      />
                    </View>
                    <View style={styles.unitGroup}>
                      {(['total', 'per_side', 'seconds'] as const).map((unit) => (
                        <Pressable key={unit} onPress={() => updateExercise(station.id, item.exerciseId, { unit })} style={[styles.unitButton, item.unit === unit && styles.unitButtonSelected]}>
                          <Text style={[styles.unitText, item.unit === unit && styles.unitTextSelected]}>{unit === 'total' ? 'reps' : unit === 'per_side' ? '/side' : 'sec'}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              ))}

              <Pressable onPress={() => setAddTarget(station.id)} style={styles.addButton}><Text style={styles.addButtonText}>＋ Add exercise</Text></Pressable>
            </View>
          ))}
        </ScrollView>

        <Modal visible={Boolean(addTarget)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddTarget(null)}>
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.topBar}>
              <Pressable onPress={() => setAddTarget(null)} style={styles.topAction}><Text style={styles.topActionText}>Cancel</Text></Pressable>
              <Text style={styles.topTitle}>Add exercise</Text><View style={styles.topAction} />
            </View>
            <View style={styles.searchWrap}><V23Icon name="search" color={tokens.textMuted} size={18} /><TextInput value={search} onChangeText={setSearch} placeholder="Search exercises" placeholderTextColor={tokens.textMuted} style={styles.searchInput} autoFocus /></View>
            <ScrollView contentContainerStyle={styles.candidateList} keyboardShouldPersistTaps="handled">
              {candidates.map((exercise) => (
                <Pressable key={exercise.id} onPress={() => addExercise(addTarget!, exercise)} style={styles.candidateRow}>
                  <View style={{ flex: 1 }}><Text style={styles.candidateName}>{exercise.name}</Text><Text style={styles.candidateMeta}>{exercise.category} · {exercise.equipmentOptions[0]?.label ?? 'Bodyweight'}</Text></View>
                  <V23Icon name="chevron" color={tokens.textMuted} size={17} />
                </Pressable>
              ))}
              {!candidates.length ? <Text style={styles.emptyText}>No compatible exercises match this search.</Text> : null}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

export function recalculateWorkout(workout: GeneratedWorkout): GeneratedWorkout {
  const totalWorkSeconds = workout.stations.reduce((sum, station) => sum + station.durationSeconds, 0);
  const totalRestSeconds = Math.max(0, workout.stations.length - 1) * workout.request.restSeconds;
  return {
    ...workout,
    stations: workout.stations.map((station, index) => ({
      ...station,
      order: index + 1,
      exercises: station.exercises.map((item, exerciseIndex) => ({ ...item, order: exerciseIndex + 1 })),
    })),
    request: { ...workout.request, workMinutes: Math.round(totalWorkSeconds / 60) },
    totalWorkSeconds,
    totalRestSeconds,
    estimatedElapsedSeconds: totalWorkSeconds + totalRestSeconds,
  };
}

function cloneWorkout(workout: GeneratedWorkout): GeneratedWorkout {
  return JSON.parse(JSON.stringify(workout)) as GeneratedWorkout;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.canvas },
    topBar: { minHeight: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: tokens.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    topAction: { minWidth: 68, minHeight: 44, justifyContent: 'center' }, topActionText: { color: tokens.textMuted, fontSize: 15, fontWeight: '700' }, saveText: { color: tokens.accent, fontSize: 15, fontWeight: '800', textAlign: 'right' }, topTitle: { color: tokens.text, fontSize: 17, fontWeight: '800' },
    content: { padding: 16, paddingBottom: 80, gap: 14 },
    summaryCard: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, borderRadius: 20, padding: 16, gap: 5 }, summaryTitle: { color: tokens.text, fontSize: 22, fontWeight: '800' }, summaryMeta: { color: tokens.textMuted, fontSize: 14 }, resetButton: { alignSelf: 'flex-start', marginTop: 5, paddingVertical: 5 }, resetText: { color: tokens.accent, fontSize: 13, fontWeight: '700' },
    stationCard: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, borderRadius: 22, padding: 15, gap: 12 }, stationHeader: { gap: 12 }, eyebrow: { color: tokens.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 }, stationTitle: { color: tokens.text, fontSize: 19, fontWeight: '800', marginTop: 2 },
    durationControl: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: tokens.surfaceMuted, borderRadius: 999, padding: 4, gap: 8 }, stepButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface }, stepText: { color: tokens.accent, fontSize: 21, fontWeight: '700' }, durationText: { minWidth: 48, textAlign: 'center', color: tokens.text, fontWeight: '800' },
    exerciseCard: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingTop: 12, gap: 10 }, exerciseCardLast: {}, exerciseHeader: { gap: 8 }, exerciseName: { color: tokens.text, fontSize: 16, fontWeight: '800' }, reorderRow: { flexDirection: 'row', gap: 6, alignItems: 'center' }, iconButton: { minHeight: 32, minWidth: 36, borderRadius: 10, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }, iconButtonText: { color: tokens.accent, fontSize: 15, fontWeight: '800' }, removeText: { color: tokens.danger, fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.35 },
    prescriptionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, field: { width: 96, gap: 5 }, fieldLabel: { color: tokens.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }, input: { minHeight: 44, borderWidth: 1, borderColor: tokens.borderStrong, borderRadius: 12, paddingHorizontal: 12, color: tokens.text, fontSize: 17, fontWeight: '800', textAlign: 'center', backgroundColor: tokens.surfaceRaised }, unitGroup: { flex: 1, flexDirection: 'row', gap: 5 }, unitButton: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: tokens.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, unitButtonSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, unitText: { color: tokens.textMuted, fontSize: 11, fontWeight: '700' }, unitTextSelected: { color: tokens.accent },
    addButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: tokens.borderStrong, alignItems: 'center', justifyContent: 'center' }, addButtonText: { color: tokens.accent, fontSize: 14, fontWeight: '800' },
    searchWrap: { margin: 16, marginBottom: 4, minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 }, searchInput: { flex: 1, color: tokens.text, fontSize: 16 }, candidateList: { padding: 16, paddingBottom: 60 }, candidateRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border, paddingVertical: 10 }, candidateName: { color: tokens.text, fontSize: 16, fontWeight: '800' }, candidateMeta: { color: tokens.textMuted, fontSize: 13, marginTop: 3 }, emptyText: { color: tokens.textMuted, fontSize: 15, textAlign: 'center', paddingVertical: 36 },
  });
}
