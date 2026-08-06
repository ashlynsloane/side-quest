import type { CoachSessionProposal, CoachSessionProposalSnapshot } from '@circuit/domain';
import { describeCoachProposalDifference } from '@circuit/planner';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import {
  applyCoachSessionProposal,
  listCoachSessionProposals,
  rejectCoachSessionProposal,
  syncAthleteFuturePlan,
  undoLatestCoachPlanChange,
} from '@/services/coach';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

export default function CoachReviewScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [proposals, setProposals] = useState<CoachSessionProposal[]>([]);
  const [selected, setSelected] = useState<CoachSessionProposal | null>(null);
  const [athleteNote, setAthleteNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || user.mode !== 'cloud') return;
    try {
      const next = await listCoachSessionProposals({ athleteId: user.id, status: 'pending' });
      setProposals(next);
      if (selected) setSelected(next.find((item) => item.id === selected.id) ?? null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  }, [selected?.id, user?.id, user?.mode]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function open(proposal: CoachSessionProposal) {
    setSelected(proposal);
    setAthleteNote('');
    setMessage(null);
  }

  async function approve() {
    if (!selected || !user) return;
    setBusy(true); setMessage(null);
    try {
      const result = await applyCoachSessionProposal(selected, athleteNote);
      if (!result.ok) {
        Alert.alert('Proposal cannot be applied', result.reasons.join('\n\n'));
        return;
      }
      await syncAthleteFuturePlan(user.id, result.block);
      setMessage(`${selected.coachDisplayName}'s proposal was approved and applied. An undo snapshot was saved.`);
      setSelected(null);
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  function reject() {
    if (!selected) return;
    Alert.alert(
      'Reject this coach proposal?',
      'Your current future workout will remain unchanged.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject proposal', style: 'destructive', onPress: () => void (async () => {
          setBusy(true); setMessage(null);
          try {
            await rejectCoachSessionProposal(selected.id, athleteNote);
            setMessage('Proposal rejected. Your plan was not changed.');
            setSelected(null);
            await load();
          } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
          finally { setBusy(false); }
        })() },
      ],
    );
  }

  async function undo() {
    setBusy(true); setMessage(null);
    try {
      const restored = await undoLatestCoachPlanChange();
      setMessage(restored ? 'The most recent accepted coach change was undone.' : 'No un-restored coach-change snapshot is available.');
      if (restored && user) await syncAthleteFuturePlan(user.id);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <AppScreen eyebrow="COACH REVIEW" title="You approve every coach change." subtitle="Coach edits are proposals. Your local restrictions are checked before approval, and history is never changed.">
    <Surface style={styles.privacy}><Pill tone="good">ATHLETE CONTROL</Pill><Text style={styles.body}>A coach cannot activate a change. Approval happens on your device after Side Quest checks the proposed exercises against your current private restrictions and equipment.</Text></Surface>

    {!selected ? <>
      <SectionTitle detail={`${proposals.length} pending`}>Proposals waiting for you</SectionTitle>
      {proposals.map((proposal) => {
        const diff = describeCoachProposalDifference(proposal.baseline, proposal.proposed);
        return <Pressable key={proposal.id} onPress={() => open(proposal)} style={styles.proposal}>
          <View style={{ flex: 1 }}><Text style={styles.title}>{proposal.proposed.title}</Text><Text style={styles.body}>{proposal.coachDisplayName} · proposed {formatDateTime(proposal.createdAt)}</Text><Text style={styles.meta}>{differenceSummary(diff)}</Text></View><Pill tone="warn">REVIEW</Pill>
        </Pressable>;
      })}
      {!proposals.length ? <Surface><Text style={styles.title}>Nothing is waiting</Text><Text style={styles.body}>Future coach changes will appear here before they can affect your plan.</Text></Surface> : null}
      <Pressable disabled={busy} onPress={() => void undo()} style={styles.secondary}><Text style={styles.secondaryText}>Undo most recent accepted coach change</Text></Pressable>
      <Pressable onPress={() => router.replace('/coach-access' as Href)}><Text style={styles.back}>Back to Coach Access</Text></Pressable>
    </> : <ProposalReview proposal={selected} athleteNote={athleteNote} setAthleteNote={setAthleteNote} busy={busy} onApprove={() => void approve()} onReject={reject} onCancel={() => setSelected(null)} styles={styles} palette={palette} />}

    {message ? <Surface><Text style={styles.message}>{message}</Text></Surface> : null}
  </AppScreen>;
}

function ProposalReview({ proposal, athleteNote, setAthleteNote, busy, onApprove, onReject, onCancel, styles, palette }: {
  proposal: CoachSessionProposal;
  athleteNote: string;
  setAthleteNote: (value: string) => void;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  styles: ReturnType<typeof makeStyles>;
  palette: AppPalette;
}) {
  const diff = describeCoachProposalDifference(proposal.baseline, proposal.proposed);
  return <>
    <SectionTitle detail={`From ${proposal.coachDisplayName}`}>Compare the proposal</SectionTitle>
    {proposal.coachNote ? <Surface style={styles.note}><Text style={styles.label}>Coach note</Text><Text style={styles.body}>{proposal.coachNote}</Text></Surface> : null}
    <View style={styles.compareRow}>
      <SnapshotCard label="CURRENT" snapshot={proposal.baseline} styles={styles} />
      <SnapshotCard label="PROPOSED" snapshot={proposal.proposed} styles={styles} />
    </View>
    <Surface>
      <Text style={styles.title}>Change summary</Text>
      <Text style={styles.body}>{differenceSummary(diff)}</Text>
      {diff.targetChanges.map((change) => <Text key={change.exerciseName} style={styles.change}>• {change.exerciseName}: {change.before} → {change.after}</Text>)}
      {diff.addedExercises.length ? <Text style={styles.change}>• Added: {diff.addedExercises.join(', ')}</Text> : null}
      {diff.removedExercises.length ? <Text style={styles.change}>• Removed: {diff.removedExercises.join(', ')}</Text> : null}
    </Surface>
    <Surface>
      <Text style={styles.label}>Optional response to coach</Text>
      <TextInput multiline value={athleteNote} onChangeText={setAthleteNote} placeholder="Add a note about your approval or rejection" placeholderTextColor={palette.inkMuted} style={styles.input}/>
    </Surface>
    <Pressable disabled={busy} onPress={onApprove} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Applying…' : 'Approve and apply to my plan'}</Text></Pressable>
    <Pressable disabled={busy} onPress={onReject} style={[styles.dangerButton, busy && styles.disabled]}><Text style={styles.dangerText}>Reject proposal</Text></Pressable>
    <Pressable disabled={busy} onPress={onCancel}><Text style={styles.back}>Return to proposal list</Text></Pressable>
  </>;
}

function SnapshotCard({ label, snapshot, styles }: { label: string; snapshot: CoachSessionProposalSnapshot; styles: ReturnType<typeof makeStyles> }) {
  return <Surface style={styles.snapshot}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.title}>{snapshot.title}</Text>
    <Text style={styles.body}>{formatDate(snapshot.sessionDate)} · {snapshot.intendedLoad} · {Math.round(snapshot.workout.totalWorkSeconds / 60)} min</Text>
    {snapshot.workout.stations.map((station) => <View key={station.id} style={styles.station}><Text style={styles.stationTitle}>{station.order}. {station.purpose}</Text>{station.exercises.map((item) => <Text key={`${station.id}:${item.exerciseId}`} style={styles.exercise}>• {item.exerciseSnapshot.name} · {target(item.target, item.unit)}</Text>)}</View>)}
  </Surface>;
}

function differenceSummary(diff: ReturnType<typeof describeCoachProposalDifference>) {
  const pieces: string[] = [];
  if (diff.dateChanged) pieces.push('date changed');
  if (diff.titleChanged) pieces.push('title changed');
  if (diff.intendedLoadChanged) pieces.push('intended load changed');
  if (diff.addedExercises.length) pieces.push(`${diff.addedExercises.length} exercise${diff.addedExercises.length === 1 ? '' : 's'} added`);
  if (diff.removedExercises.length) pieces.push(`${diff.removedExercises.length} removed`);
  if (diff.targetChanges.length) pieces.push(`${diff.targetChanges.length} target${diff.targetChanges.length === 1 ? '' : 's'} changed`);
  return pieces.length ? pieces.join(' · ') : 'No structural difference detected.';
}
function target(value: number, unit: 'total' | 'per_side' | 'seconds') { return unit === 'seconds' ? `${value} sec` : unit === 'per_side' ? `${value} / side` : `${value} reps`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }

function makeStyles(palette: AppPalette) { return StyleSheet.create({
  privacy:{gap:7,backgroundColor:palette.mint},body:{...typography.small,color:palette.inkMuted},title:{fontSize:16,fontWeight:'900',color:palette.ink},meta:{...typography.small,color:palette.forest,marginTop:4},proposal:{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:18,padding:15,flexDirection:'row',gap:10,alignItems:'center'},
  compareRow:{gap:10},snapshot:{gap:7},label:{...typography.eyebrow,color:palette.forest},station:{borderTopWidth:1,borderTopColor:palette.border,paddingTop:7,gap:3},stationTitle:{fontSize:13,fontWeight:'900',color:palette.ink},exercise:{...typography.small,color:palette.inkMuted},note:{backgroundColor:palette.sand,gap:5},change:{...typography.small,color:palette.ink,marginTop:5},input:{minHeight:90,textAlignVertical:'top',backgroundColor:palette.canvas,borderWidth:1,borderColor:palette.border,borderRadius:14,padding:13,color:palette.ink,marginTop:8},
  primary:{backgroundColor:palette.forest,borderRadius:15,padding:15,alignItems:'center'},primaryText:{color:palette.white,fontWeight:'900'},secondary:{borderWidth:1,borderColor:palette.forest,borderRadius:15,padding:14,alignItems:'center'},secondaryText:{color:palette.forest,fontWeight:'900'},dangerButton:{borderWidth:1,borderColor:palette.danger,borderRadius:15,padding:14,alignItems:'center'},dangerText:{color:palette.danger,fontWeight:'900'},disabled:{opacity:.4},back:{color:palette.forest,fontWeight:'900',textAlign:'center',padding:10},message:{color:palette.ink,fontWeight:'700'},
}); }
