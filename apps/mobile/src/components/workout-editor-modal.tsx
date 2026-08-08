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

type ExerciseTarget = { stationId: string; exerciseId: string };

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
  const [editTarget, setEditTarget] = useState<ExerciseTarget | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    setDraft(cloneWorkout(workout));
    setAddTarget(null);
    setEditTarget(null);
    setSearch('');
  }, [visible, workout]);

  function closeCurrentLayer() {
    if (addTarget) {
      setAddTarget(null);
      setSearch('');
      return;
    }
    if (editTarget) {
      setEditTarget(null);
      return;
    }
    onClose();
  }

  function saveAndClose() {
    onSave(recalculateWorkout(draft));
  }

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
    updateStation(stationId, (station) => {
      if (station.exercises.length <= 1) return station;
      return {
        ...station,
        exercises: station.exercises
          .filter((item) => item.exerciseId !== exerciseId)
          .map((item, index) => ({ ...item, order: index + 1 })),
      };
    });
    setEditTarget(null);
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

  const editingStation = editTarget ? draft.stations.find((station) => station.id === editTarget.stationId) ?? null : null;
  const editingExercise = editTarget
    ? editingStation?.exercises.find((item) => item.exerciseId === editTarget.exerciseId) ?? null
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      hardwareAccelerated
      onRequestClose={closeCurrentLayer}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        {addTarget ? (
          <ExercisePicker
            candidates={candidates}
            search={search}
            onSearch={setSearch}
            onBack={closeCurrentLayer}
            onChoose={(exercise) => addExercise(addTarget, exercise)}
            styles={styles}
            tokens={tokens}
          />
        ) : editingStation && editingExercise && editTarget ? (
          <ExerciseEditor
            station={editingStation}
            item={editingExercise}
            onBack={closeCurrentLayer}
            onUpdate={(update) => updateExercise(editTarget.stationId, editTarget.exerciseId, update)}
            onMove={(delta) => moveExercise(editTarget.stationId, editTarget.exerciseId, delta)}
            onRemove={() => removeExercise(editTarget.stationId, editTarget.exerciseId)}
            styles={styles}
            tokens={tokens}
          />
        ) : (
          <>
            <EditorHeader onClose={onClose} onSave={saveAndClose} styles={styles} tokens={tokens} />
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.intro}>
                <Text style={styles.eyebrow}>WORKOUT EDITOR</Text>
                <Text style={styles.pageTitle}>Change the structure without rebuilding the workout.</Text>
                <Text style={styles.pageBody}>Station time, exercise order, prescriptions, and added movements stay in this draft until you save.</Text>
              </View>

              <View style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.summaryTitle}>{draft.name}</Text>
                    <Text style={styles.summaryMeta}>{Math.round(draft.estimatedElapsedSeconds / 60)} min · {draft.stations.length} stations · {exerciseCount(draft)} exercises</Text>
                  </View>
                  <View style={styles.draftPill}><Text style={styles.draftPillText}>Draft</Text></View>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setDraft(cloneWorkout(originalWorkout))} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}>
                  <V23Icon name="adjust" color={tokens.accent} size={15} />
                  <Text style={styles.resetText}>Reset to generated workout</Text>
                </Pressable>
              </View>

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionEyebrow}>STATIONS</Text>
                <Text style={styles.sectionTitle}>Edit one decision at a time.</Text>
              </View>

              {draft.stations.map((station) => (
                <View key={station.id} style={styles.stationCard}>
                  <View style={styles.stationHeader}>
                    <View style={styles.stationNumber}><Text style={styles.stationNumberText}>{station.order}</Text></View>
                    <View style={styles.stationCopy}>
                      <Text style={styles.stationTitle}>{station.purpose}</Text>
                      <Text style={styles.stationMeta}>{station.exercises.length} exercise{station.exercises.length === 1 ? '' : 's'}</Text>
                    </View>
                    <DurationControl
                      station={station}
                      onChange={(durationSeconds) => updateStation(station.id, (item) => ({ ...item, durationSeconds }))}
                      styles={styles}
                    />
                  </View>

                  <View style={styles.exerciseList}>
                    {station.exercises.map((item, index) => (
                      <Pressable
                        key={item.exerciseId}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${item.exerciseSnapshot.name}`}
                        onPress={() => setEditTarget({ stationId: station.id, exerciseId: item.exerciseId })}
                        style={({ pressed }) => [styles.exerciseRow, index > 0 && styles.exerciseRowBorder, pressed && styles.pressed]}
                      >
                        <View style={styles.exerciseOrder}><Text style={styles.exerciseOrderText}>{index + 1}</Text></View>
                        <View style={styles.exerciseCopy}>
                          <Text style={styles.exerciseName}>{item.exerciseSnapshot.name}</Text>
                          <Text style={styles.exerciseMeta}>{formatTarget(item.target, item.unit)} · {item.exerciseSnapshot.category}</Text>
                        </View>
                        <View style={styles.editPill}><Text style={styles.editPillText}>Edit</Text></View>
                        <V23Icon name="chevron" color={tokens.textMuted} size={15} />
                      </Pressable>
                    ))}
                  </View>

                  <Pressable accessibilityRole="button" onPress={() => setAddTarget(station.id)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
                    <View style={styles.addIcon}><Text style={styles.addIconText}>＋</Text></View>
                    <View style={styles.addCopy}><Text style={styles.addButtonText}>Add an exercise</Text><Text style={styles.addButtonMeta}>Only equipment-compatible movements are shown.</Text></View>
                    <V23Icon name="chevron" color={tokens.textMuted} size={15} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            <View style={styles.bottomBar}>
              <View style={styles.bottomCopy}>
                <Text style={styles.bottomLabel}>UNSAVED EDITS</Text>
                <Text style={styles.bottomMeta}>{Math.round(draft.estimatedElapsedSeconds / 60)} min · {exerciseCount(draft)} exercises</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={saveAndClose} style={({ pressed }) => [styles.bottomSave, pressed && styles.pressed]}>
                <Text style={styles.bottomSaveText}>Save changes</Text>
                <V23Icon name="check" color="#FFFFFF" size={16} />
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function EditorHeader({
  onClose,
  onSave,
  styles,
  tokens,
}: {
  onClose: () => void;
  onSave: () => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close workout editor" onPress={onClose} style={({ pressed }) => [styles.topSideAction, pressed && styles.pressed]} hitSlop={8}>
        <V23Icon name="back" color={tokens.text} size={18} />
        <Text style={styles.topSideText}>Close</Text>
      </Pressable>
      <Text style={styles.topTitle}>Edit workout</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Save workout changes" onPress={onSave} style={({ pressed }) => [styles.topSaveAction, pressed && styles.pressed]} hitSlop={8}>
        <Text style={styles.topSaveText}>Save</Text>
      </Pressable>
    </View>
  );
}

function DurationControl({ station, onChange, styles }: { station: WorkoutStation; onChange: (durationSeconds: number) => void; styles: ReturnType<typeof makeStyles> }) {
  const minutes = Math.round(station.durationSeconds / 60);
  return <View style={styles.durationWrap}>
    <Text style={styles.durationLabel}>WORK</Text>
    <View style={styles.durationControl}>
      <Pressable accessibilityLabel={`Reduce station ${station.order} duration`} onPress={() => onChange(Math.max(60, station.durationSeconds - 60))} style={styles.stepButton} hitSlop={5}><Text style={styles.stepText}>−</Text></Pressable>
      <Text style={styles.durationText}>{minutes}m</Text>
      <Pressable accessibilityLabel={`Increase station ${station.order} duration`} onPress={() => onChange(Math.min(1800, station.durationSeconds + 60))} style={styles.stepButton} hitSlop={5}><Text style={styles.stepText}>+</Text></Pressable>
    </View>
  </View>;
}

function ExerciseEditor({
  station,
  item,
  onBack,
  onUpdate,
  onMove,
  onRemove,
  styles,
  tokens,
}: {
  station: WorkoutStation;
  item: WorkoutExercisePrescription;
  onBack: () => void;
  onUpdate: (update: Partial<WorkoutExercisePrescription>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  const index = station.exercises.findIndex((exercise) => exercise.exerciseId === item.exerciseId);
  const onlyExercise = station.exercises.length <= 1;

  return <>
    <LayerHeader label="Edit exercise" onBack={onBack} styles={styles} tokens={tokens} />
    <ScrollView contentContainerStyle={styles.layerContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
      <View style={styles.exerciseHero}>
        <View style={styles.exerciseHeroIcon}><V23Icon name="train" color={tokens.accent} size={20} /></View>
        <View style={styles.exerciseHeroCopy}>
          <Text style={styles.layerEyebrow}>STATION {station.order}</Text>
          <Text style={styles.layerTitle}>{item.exerciseSnapshot.name}</Text>
          <Text style={styles.layerBody}>{item.exerciseSnapshot.shortDescription || item.exerciseSnapshot.category}</Text>
        </View>
      </View>

      <View style={styles.editorSection}>
        <Text style={styles.editorSectionLabel}>PRESCRIPTION</Text>
        <Text style={styles.editorSectionTitle}>What should one round ask for?</Text>
        <View style={styles.prescriptionRow}>
          <View style={styles.targetField}>
            <Text style={styles.fieldLabel}>{item.unit === 'seconds' ? 'SECONDS' : item.unit === 'per_side' ? 'REPS / SIDE' : 'REPS'}</Text>
            <TextInput
              value={String(item.target)}
              onChangeText={(value) => onUpdate({ target: Math.max(1, Number(value.replace(/[^0-9.]/g, '')) || 1) })}
              keyboardType="decimal-pad"
              selectTextOnFocus
              style={styles.input}
            />
          </View>
          <View style={styles.unitWrap}>
            <Text style={styles.fieldLabel}>FORMAT</Text>
            <View style={styles.unitGroup}>
              {(['total', 'per_side', 'seconds'] as const).map((unit) => (
                <Pressable key={unit} onPress={() => onUpdate({ unit })} style={[styles.unitButton, item.unit === unit && styles.unitButtonSelected]}>
                  <Text style={[styles.unitText, item.unit === unit && styles.unitTextSelected]}>{unit === 'total' ? 'reps' : unit === 'per_side' ? '/side' : 'sec'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.editorSection}>
        <Text style={styles.editorSectionLabel}>POSITION</Text>
        <Text style={styles.editorSectionTitle}>Move it within this station.</Text>
        <View style={styles.positionRow}>
          <Pressable accessibilityRole="button" disabled={index <= 0} onPress={() => onMove(-1)} style={({ pressed }) => [styles.positionButton, index <= 0 && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.positionArrow}>↑</Text><Text style={styles.positionText}>Earlier</Text>
          </Pressable>
          <View style={styles.positionStatus}><Text style={styles.positionStatusLabel}>POSITION</Text><Text style={styles.positionStatusValue}>{index + 1} of {station.exercises.length}</Text></View>
          <Pressable accessibilityRole="button" disabled={index >= station.exercises.length - 1} onPress={() => onMove(1)} style={({ pressed }) => [styles.positionButton, index >= station.exercises.length - 1 && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.positionArrow}>↓</Text><Text style={styles.positionText}>Later</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.editorSection}>
        <Text style={styles.editorSectionLabel}>WORKOUT STRUCTURE</Text>
        <Pressable accessibilityRole="button" disabled={onlyExercise} onPress={onRemove} style={({ pressed }) => [styles.removeExerciseButton, onlyExercise && styles.disabled, pressed && styles.pressed]}>
          <View style={styles.removeExerciseCopy}>
            <Text style={styles.removeExerciseTitle}>Remove from this station</Text>
            <Text style={styles.removeExerciseBody}>{onlyExercise ? 'Each station needs at least one exercise.' : 'This only changes the current workout draft.'}</Text>
          </View>
          <Text style={styles.removeExerciseText}>Remove</Text>
        </Pressable>
      </View>
    </ScrollView>
    <View style={styles.layerFooter}>
      <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}>
        <Text style={styles.doneButtonText}>Done editing exercise</Text><V23Icon name="check" color="#FFFFFF" size={16} />
      </Pressable>
    </View>
  </>;
}

function ExercisePicker({
  candidates,
  search,
  onSearch,
  onBack,
  onChoose,
  styles,
  tokens,
}: {
  candidates: Exercise[];
  search: string;
  onSearch: (value: string) => void;
  onBack: () => void;
  onChoose: (exercise: Exercise) => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <>
    <LayerHeader label="Add exercise" onBack={onBack} styles={styles} tokens={tokens} />
    <View style={styles.pickerIntro}>
      <Text style={styles.layerEyebrow}>COMPATIBLE WITH THIS WORKOUT</Text>
      <Text style={styles.pickerTitle}>Add a movement to the station.</Text>
      <Text style={styles.layerBody}>Only active AMRAP exercises that fit the workout’s available equipment are shown.</Text>
    </View>
    <View style={styles.searchWrap}>
      <V23Icon name="search" color={tokens.textMuted} size={18} />
      <TextInput value={search} onChangeText={onSearch} placeholder="Search exercises" placeholderTextColor={tokens.textMuted} style={styles.searchInput} autoFocus />
    </View>
    <ScrollView contentContainerStyle={styles.candidateList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {candidates.map((exercise) => (
        <Pressable key={exercise.id} accessibilityRole="button" onPress={() => onChoose(exercise)} style={({ pressed }) => [styles.candidateRow, pressed && styles.pressed]}>
          <View style={styles.candidateIcon}><V23Icon name="train" color={tokens.accent} size={17} /></View>
          <View style={styles.candidateCopy}>
            <Text style={styles.candidateName}>{exercise.name}</Text>
            <Text style={styles.candidateMeta}>{exercise.category} · {exercise.equipmentOptions[0]?.label ?? 'Bodyweight'}</Text>
          </View>
          <View style={styles.addCandidatePill}><Text style={styles.addCandidateText}>Add</Text></View>
        </Pressable>
      ))}
      {!candidates.length ? <View style={styles.emptyState}><V23Icon name="search" color={tokens.textMuted} size={22} /><Text style={styles.emptyTitle}>No compatible match</Text><Text style={styles.emptyText}>Try a broader exercise name. Equipment and workout compatibility filters stay in force.</Text></View> : null}
    </ScrollView>
  </>;
}

function LayerHeader({ label, onBack, styles, tokens }: { label: string; onBack: () => void; styles: ReturnType<typeof makeStyles>; tokens: DesignTokens }) {
  return <View style={styles.topBar}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Back from ${label}`} onPress={onBack} style={({ pressed }) => [styles.topSideAction, pressed && styles.pressed]} hitSlop={8}>
      <V23Icon name="back" color={tokens.text} size={18} /><Text style={styles.topSideText}>Back</Text>
    </Pressable>
    <Text style={styles.topTitle}>{label}</Text>
    <View style={styles.topSaveAction} />
  </View>;
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

function exerciseCount(workout: GeneratedWorkout): number {
  return workout.stations.reduce((total, station) => total + station.exercises.length, 0);
}

function formatTarget(target: number, unit: WorkoutExercisePrescription['unit']): string {
  if (unit === 'seconds') return `${target} sec`;
  return unit === 'per_side' ? `${target}/side` : `${target} reps`;
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.canvas },
    topBar: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: tokens.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border, zIndex: 5 },
    topSideAction: { width: 84, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 3 },
    topSideText: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    topSaveAction: { width: 84, minHeight: 46, alignItems: 'flex-end', justifyContent: 'center' },
    topSaveText: { color: tokens.accent, fontSize: 13, lineHeight: 17, fontWeight: '900' },
    topTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    content: { paddingHorizontal: 16, paddingTop: 17, paddingBottom: 30, gap: 15 },

    intro: { gap: 4, paddingHorizontal: 2 },
    eyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    pageTitle: { color: tokens.text, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.4 },
    pageBody: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },

    summaryCard: { backgroundColor: tokens.surfaceMuted, borderRadius: 18, padding: 14, gap: 10 },
    summaryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    summaryCopy: { flex: 1, minWidth: 0, gap: 2 },
    summaryTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },
    summaryMeta: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
    draftPill: { borderRadius: 999, backgroundColor: tokens.surface, paddingHorizontal: 8, paddingVertical: 5 },
    draftPillText: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.5 },
    resetButton: { alignSelf: 'flex-start', minHeight: 34, borderRadius: 17, backgroundColor: tokens.surface, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
    resetText: { color: tokens.accent, fontSize: 11.5, lineHeight: 15, fontWeight: '800' },

    sectionHeading: { gap: 2, paddingHorizontal: 2 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.9 },
    sectionTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '900' },

    stationCard: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, borderRadius: 21, padding: 13, gap: 10 },
    stationHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    stationNumber: { width: 32, height: 32, borderRadius: 11, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center' },
    stationNumberText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
    stationCopy: { flex: 1, minWidth: 0, gap: 1 },
    stationTitle: { color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
    stationMeta: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14 },
    durationWrap: { gap: 3, alignItems: 'center' },
    durationLabel: { color: tokens.textMuted, fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.7 },
    durationControl: { flexDirection: 'row', alignItems: 'center', backgroundColor: tokens.surfaceMuted, borderRadius: 999, padding: 3, gap: 3 },
    stepButton: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface },
    stepText: { color: tokens.accent, fontSize: 18, lineHeight: 20, fontWeight: '800' },
    durationText: { minWidth: 34, textAlign: 'center', color: tokens.text, fontSize: 11.5, lineHeight: 15, fontWeight: '900' },

    exerciseList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    exerciseRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
    exerciseRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    exerciseOrder: { width: 27, height: 27, borderRadius: 14, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    exerciseOrderText: { color: tokens.textMuted, fontSize: 10.5, fontWeight: '900' },
    exerciseCopy: { flex: 1, minWidth: 0, gap: 2 },
    exerciseName: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    exerciseMeta: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14 },
    editPill: { borderRadius: 999, backgroundColor: tokens.accentSoft, paddingHorizontal: 8, paddingVertical: 5 },
    editPillText: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900' },

    addButton: { minHeight: 58, borderRadius: 14, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
    addIcon: { width: 29, height: 29, borderRadius: 15, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    addIconText: { color: tokens.accent, fontSize: 16, lineHeight: 18, fontWeight: '900' },
    addCopy: { flex: 1, minWidth: 0, gap: 1 },
    addButtonText: { color: tokens.text, fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
    addButtonMeta: { color: tokens.textMuted, fontSize: 10, lineHeight: 13 },

    bottomBar: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, backgroundColor: tokens.surface },
    bottomCopy: { flex: 1, minWidth: 0, gap: 1 },
    bottomLabel: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.75 },
    bottomMeta: { color: tokens.textMuted, fontSize: 11, lineHeight: 15 },
    bottomSave: { minHeight: 45, borderRadius: 14, backgroundColor: tokens.header, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    bottomSaveText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 17, fontWeight: '900' },

    layerContent: { paddingHorizontal: 16, paddingTop: 17, paddingBottom: 34, gap: 14 },
    layerEyebrow: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.85 },
    layerTitle: { color: tokens.text, fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.35 },
    layerBody: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 },
    exerciseHero: { borderRadius: 20, backgroundColor: tokens.surfaceMuted, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
    exerciseHeroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
    exerciseHeroCopy: { flex: 1, minWidth: 0, gap: 3 },
    editorSection: { borderRadius: 19, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, padding: 14, gap: 10 },
    editorSectionLabel: { color: tokens.accent, fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.85 },
    editorSectionTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '900' },
    prescriptionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    targetField: { width: 102, gap: 5 },
    unitWrap: { flex: 1, gap: 5 },
    fieldLabel: { color: tokens.textMuted, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7 },
    input: { minHeight: 47, borderWidth: 1, borderColor: tokens.border, borderRadius: 13, paddingHorizontal: 10, color: tokens.text, fontSize: 17, fontWeight: '900', textAlign: 'center', backgroundColor: tokens.surfaceMuted },
    unitGroup: { flexDirection: 'row', gap: 5 },
    unitButton: { flex: 1, minHeight: 47, borderWidth: 1, borderColor: tokens.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface },
    unitButtonSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent },
    unitText: { color: tokens.textMuted, fontSize: 10.5, fontWeight: '800' },
    unitTextSelected: { color: tokens.accent, fontWeight: '900' },
    positionRow: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
    positionButton: { flex: 1, minHeight: 57, borderRadius: 13, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center', gap: 2 },
    positionArrow: { color: tokens.accent, fontSize: 17, lineHeight: 20, fontWeight: '900' },
    positionText: { color: tokens.text, fontSize: 10.5, lineHeight: 14, fontWeight: '800' },
    positionStatus: { minWidth: 86, borderRadius: 13, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 8 },
    positionStatusLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 7.5, lineHeight: 10, fontWeight: '900', letterSpacing: 0.65 },
    positionStatusValue: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '900' },
    removeExerciseButton: { minHeight: 62, borderRadius: 14, backgroundColor: tokens.surfaceMuted, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
    removeExerciseCopy: { flex: 1, minWidth: 0, gap: 2 },
    removeExerciseTitle: { color: tokens.text, fontSize: 12.5, lineHeight: 17, fontWeight: '900' },
    removeExerciseBody: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14 },
    removeExerciseText: { color: tokens.danger, fontSize: 11.5, lineHeight: 15, fontWeight: '900' },
    layerFooter: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, backgroundColor: tokens.surface },
    doneButton: { minHeight: 47, borderRadius: 14, backgroundColor: tokens.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    doneButtonText: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 17, fontWeight: '900' },

    pickerIntro: { paddingHorizontal: 16, paddingTop: 16, gap: 4 },
    pickerTitle: { color: tokens.text, fontSize: 22, lineHeight: 27, fontWeight: '900', letterSpacing: -0.3 },
    searchWrap: { marginHorizontal: 16, marginTop: 13, minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13 },
    searchInput: { flex: 1, color: tokens.text, fontSize: 15 },
    candidateList: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 50 },
    candidateRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border, paddingVertical: 9 },
    candidateIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    candidateCopy: { flex: 1, minWidth: 0, gap: 2 },
    candidateName: { color: tokens.text, fontSize: 14, lineHeight: 19, fontWeight: '900' },
    candidateMeta: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14 },
    addCandidatePill: { borderRadius: 999, backgroundColor: tokens.surfaceMuted, paddingHorizontal: 9, paddingVertical: 6 },
    addCandidateText: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900' },
    emptyState: { alignItems: 'center', gap: 5, paddingVertical: 38, paddingHorizontal: 20 },
    emptyTitle: { color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '900' },
    emptyText: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 17, textAlign: 'center' },
    disabled: { opacity: 0.35 },
    pressed: { opacity: 0.72 },
  });
}
