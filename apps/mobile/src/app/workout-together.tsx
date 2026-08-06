import type { GeneratedWorkout, PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import { getLatestTrainingBlock, listFavoriteWorkouts, type FavoriteWorkoutRecord } from '@/services/database';
import { sendWorkoutInvitation } from '@/services/social';
import { createWorkoutRoom, joinWorkoutRoom } from '@/services/workout-together';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

interface WorkoutOption {
  id: string;
  label: string;
  detail: string;
  workout: GeneratedWorkout;
  sourceSessionId?: string;
}

export default function WorkoutTogetherScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ friendId?: string; friendName?: string }>();
  const invitedFriendId = typeof params.friendId === 'string' ? params.friendId : undefined;
  const invitedFriendName = typeof params.friendName === 'string' ? params.friendName : undefined;
  const { user, cloudEnabled } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [block, setBlock] = useState<TrainingBlockPlan | null>(null);
  const [favorites, setFavorites] = useState<FavoriteWorkoutRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    void Promise.all([getLatestTrainingBlock(), listFavoriteWorkouts()]).then(([savedBlock, savedFavorites]) => {
      if (!live) return;
      setBlock(savedBlock?.block ?? null);
      setFavorites(savedFavorites.slice(0, 6));
    });
    return () => { live = false; };
  }, []));

  const options = useMemo(() => buildOptions(block, favorites), [block, favorites]);
  const selected = options.find((option) => option.id === selectedId) ?? options[0] ?? null;
  const available = cloudEnabled && user?.mode === 'cloud';

  async function create() {
    if (!user || !selected || !available) return;
    setBusy(true); setError(null);
    try {
      const room = await createWorkoutRoom({
        workout: selected.workout,
        userId: user.id,
        displayName: user.displayName,
        sourceSessionId: selected.sourceSessionId,
      });
      if (invitedFriendId) {
        await sendWorkoutInvitation({
          senderId: user.id,
          receiverId: invitedFriendId,
          roomCode: room.code,
          workoutName: selected.workout.name,
        });
      }
      router.push({ pathname: '/workout-room', params: { code: room.code } } as Href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function join() {
    if (!user || !available) return;
    setBusy(true); setError(null);
    try {
      const room = await joinWorkoutRoom({ code: joinCode, userId: user.id, displayName: user.displayName });
      router.push({ pathname: '/workout-room', params: { code: room.code } } as Href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <AppScreen eyebrow="WORKOUT TOGETHER" title="Choose, combine, or substitute." subtitle="Offer your next session, combine it with a friend’s, or use one person’s workout as the shared session.">
    {!available ? <Surface style={styles.notice}><Pill tone="warn">Cloud account required</Pill><Text style={styles.noticeTitle}>Cross-phone rooms need Supabase login.</Text><Text style={styles.body}>{cloudEnabled ? 'This athlete is using a local beta profile. Sign out and use email OTP to create rooms across phones.' : 'Configure Supabase using the V12 and V13 setup files before testing this feature across devices.'}</Text></Surface> : null}

    {invitedFriendId ? <Surface style={styles.inviteBanner}><Pill tone="good">DIRECT INVITE</Pill><Text style={styles.inviteTitle}>Create a room for {invitedFriendName ?? 'your friend'}</Text><Text style={styles.body}>They will receive a private Workout Together invitation in Friends. The invitation expires after six hours.</Text></Surface> : null}

    <SectionTitle detail="Host chooses">Create a room</SectionTitle>
    {options.length ? <View style={styles.optionList}>{options.map((option) => {
      const active = option.id === (selected?.id ?? null);
      return <Pressable key={option.id} onPress={() => setSelectedId(option.id)} style={[styles.option, active && styles.optionActive]}><View style={{ flex: 1 }}><Text style={styles.optionTitle}>{option.label}</Text><Text style={styles.optionDetail}>{option.detail}</Text></View><View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View></Pressable>;
    })}</View> : <Surface><Text style={styles.noticeTitle}>No shareable workout yet</Text><Text style={styles.body}>Create a goal plan or save a favorite workout first.</Text></Surface>}
    <Pressable disabled={!available || !selected || busy} onPress={() => void create()} style={[styles.primary, (!available || !selected || busy) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Working…' : 'Create workout room'}</Text></Pressable>

    <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>OR</Text><View style={styles.line} /></View>
    <SectionTitle>Join a room</SectionTitle>
    <Surface><Text style={styles.label}>Six-character room code</Text><TextInput value={joinCode} onChangeText={(value: string) => setJoinCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} autoCapitalize="characters" autoCorrect={false} placeholder="AB12CD" placeholderTextColor={palette.inkMuted} style={styles.codeInput} maxLength={6} /><Pressable disabled={!available || joinCode.length !== 6 || busy} onPress={() => void join()} style={[styles.secondary, (!available || joinCode.length !== 6 || busy) && styles.disabled]}><Text style={styles.secondaryText}>Join room</Text></Pressable></Surface>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Surface><Text style={styles.privacyTitle}>Private by design</Text><Text style={styles.body}>The room shares only sanitized workout structure, display names, ready state, and start timing. PT notes, restrictions, readiness, pain reports, personal loads, and personal rounds stay on each person’s phone.</Text></Surface>
  </AppScreen>;
}

function buildOptions(block: TrainingBlockPlan | null, favorites: FavoriteWorkoutRecord[]): WorkoutOption[] {
  const output: WorkoutOption[] = [];
  const next = nextSession(block);
  if (next) output.push({ id: `plan-${next.id}`, label: next.title, detail: `Next goal-plan session · ${Math.round(next.workout.totalWorkSeconds / 60)} min`, workout: next.workout, sourceSessionId: next.id });
  for (const favorite of favorites) output.push({ id: `favorite-${favorite.id}`, label: favorite.name, detail: `Favorite · ${Math.round(favorite.workout.totalWorkSeconds / 60)} min · ${favorite.workout.stations.length} stations`, workout: favorite.workout });
  return output;
}
function nextSession(block: TrainingBlockPlan | null): PlannedStrengthSession | null {
  if (!block) return null;
  const today = new Date().toISOString().slice(0, 10);
  return block.weeks.flatMap((week) => week.sessions).filter((session) => session.date >= today && !['completed','skipped'].includes(session.completionStatus)).sort((a,b) => a.date.localeCompare(b.date))[0] ?? null;
}

function makeStyles(palette: AppPalette) { return StyleSheet.create({
  notice:{gap:8},inviteBanner:{gap:7,backgroundColor:palette.mint},inviteTitle:{fontSize:17,fontWeight:'900',color:palette.ink},noticeTitle:{...typography.h2,color:palette.ink},body:{...typography.body,color:palette.inkMuted},optionList:{gap:9},option:{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:18,padding:15,flexDirection:'row',alignItems:'center',gap:12},optionActive:{borderColor:palette.forest,borderWidth:2,backgroundColor:palette.surfaceMuted},optionTitle:{fontSize:16,fontWeight:'900',color:palette.ink},optionDetail:{...typography.small,color:palette.inkMuted,marginTop:3},radio:{width:24,height:24,borderRadius:12,borderWidth:2,borderColor:palette.border,alignItems:'center',justifyContent:'center'},radioActive:{borderColor:palette.forest},radioDot:{width:12,height:12,borderRadius:6,backgroundColor:palette.forest},primary:{backgroundColor:palette.forest,borderRadius:16,padding:16,alignItems:'center'},primaryText:{color:palette.white,fontWeight:'900',fontSize:15},secondary:{borderWidth:2,borderColor:palette.forest,borderRadius:15,padding:14,alignItems:'center',marginTop:12},secondaryText:{color:palette.forest,fontWeight:'900'},disabled:{opacity:.42},divider:{flexDirection:'row',alignItems:'center',gap:10,marginVertical:3},line:{height:1,backgroundColor:palette.border,flex:1},or:{...typography.eyebrow,color:palette.inkMuted},label:{...typography.eyebrow,color:palette.forest},codeInput:{fontSize:30,fontWeight:'900',letterSpacing:6,color:palette.ink,textAlign:'center',backgroundColor:palette.canvas,borderWidth:1,borderColor:palette.border,borderRadius:14,padding:14,marginTop:8},error:{color:palette.danger,fontWeight:'800',fontSize:13},privacyTitle:{fontSize:16,fontWeight:'900',color:palette.ink,marginBottom:5},
}); }
