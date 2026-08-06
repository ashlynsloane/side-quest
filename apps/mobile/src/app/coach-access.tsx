import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionCard, AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import {
  acceptCoachInvite,
  createCoachInvite,
  listCoachAccess,
  listCoachSessionProposals,
  renewCoachAccess,
  revokeCoachAccess,
  syncAthleteFuturePlan,
  type CoachAccessGrant,
  type CoachInvite,
} from '@/services/coach';
import { getLatestTrainingBlock } from '@/services/database';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

export default function CoachAccessScreen() {
  const router = useRouter();
  const { user, cloudEnabled } = useAuth();
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [coaches, setCoaches] = useState<CoachAccessGrant[]>([]);
  const [athletes, setAthletes] = useState<CoachAccessGrant[]>([]);
  const [invite, setInvite] = useState<CoachInvite | null>(null);
  const [pendingProposalCount, setPendingProposalCount] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const available = cloudEnabled && user?.mode === 'cloud';

  const load = useCallback(async () => {
    if (!user || !available) return;
    try {
      const [access, proposals] = await Promise.all([
        listCoachAccess(user.id),
        listCoachSessionProposals({ athleteId: user.id, status: 'pending' }),
      ]);
      setCoaches(access.coaches);
      setAthletes(access.athletes);
      setPendingProposalCount(proposals.length);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    }
  }, [available, user?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function makeInvite() {
    if (!user) return;
    setBusy(true); setMessage(null);
    try {
      const next = await createCoachInvite(user.displayName);
      setInvite(next);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function shareInvite() {
    if (!invite) return;
    await Share.share({
      message: `Use coach code ${invite.code} in Side Quest. This grants access only to my future strength plan. It does not share workout history, pain, readiness, heart rate, calendar details, or private notes.`,
    });
  }

  async function accept() {
    if (!user || code.trim().length < 6) return;
    setBusy(true); setMessage(null);
    try {
      const grant = await acceptCoachInvite(code, user.displayName);
      setCode('');
      setMessage(`Coach access accepted for ${grant.athleteDisplayName}.`);
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function syncPlan() {
    if (!user) return;
    setBusy(true); setMessage(null);
    try {
      const saved = await getLatestTrainingBlock();
      const result = await syncAthleteFuturePlan(user.id, saved?.block ?? null);
      setMessage(`${result.sharedFutureSessions} future session${result.sharedFutureSessions === 1 ? '' : 's'} shared. ${result.pendingProposalCount} coach proposal${result.pendingProposalCount === 1 ? ' is' : 's are'} waiting for athlete review.`);
      setPendingProposalCount(result.pendingProposalCount);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function renew(grant: CoachAccessGrant) {
    setBusy(true); setMessage(null);
    try {
      const updated = await renewCoachAccess(grant.id);
      setMessage(`${updated.coachDisplayName}'s access was renewed through ${formatDate(updated.expiresAt)}.`);
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  function confirmRevoke(grant: CoachAccessGrant) {
    Alert.alert(
      `Remove ${grant.coachDisplayName}?`,
      'They will immediately lose access to your future strength plan. Existing audit records remain visible to you.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove access', style: 'destructive', onPress: () => void (async () => {
          setBusy(true);
          try { await revokeCoachAccess(grant.id); await load(); }
          catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
          finally { setBusy(false); }
        })() },
      ],
    );
  }

  return <AppScreen eyebrow="COACH ACCESS" title="Future planning without private surveillance." subtitle="A coach can review and edit future Side Quest strength sessions. History and private athlete context remain inaccessible.">
    {!available ? <Surface style={styles.notice}><Pill tone="warn">Cloud account required</Pill><Text style={styles.body}>Coach access requires a signed-in cloud account.</Text></Surface> : null}

    <Surface style={styles.privacy}>
      <Text style={styles.title}>What a coach can see</Text>
      <Text style={styles.body}>Future strength-session dates, titles, intended load, stations, exercises, targets, and equipment.</Text>
      <Text style={styles.title}>What stays private</Text>
      <Text style={styles.body}>Completed history, workout performance, loads used, heart rate, Strava, TrainingPeaks calendar details, readiness, pain, PT restrictions, notes, and social activity.</Text>
    </Surface>

    <SectionTitle detail="Athlete controls">Share future plan</SectionTitle>
    <Pressable disabled={!available || busy} onPress={() => void makeInvite()} style={[styles.primary, (!available || busy) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Working…' : 'Create one-time coach code'}</Text></Pressable>
    {invite ? <Surface style={styles.codeCard}><Text style={styles.codeLabel}>COACH CODE</Text><Text style={styles.code}>{invite.code}</Text><Text style={styles.body}>Expires {new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(invite.expiresAt))}</Text><Pressable onPress={() => void shareInvite()} style={styles.secondary}><Text style={styles.secondaryText}>Share code</Text></Pressable></Surface> : null}
    <Pressable disabled={!available || busy} onPress={() => void syncPlan()} style={[styles.secondary, (!available || busy) && styles.disabled]}><Text style={styles.secondaryText}>Sync future plan</Text></Pressable>
    <ActionCard icon="✓" title="Review coach proposals" body={`${pendingProposalCount} proposal${pendingProposalCount === 1 ? '' : 's'} waiting. Compare the current and proposed sessions before anything changes.`} onPress={() => router.push('/coach-review' as never)} badge={pendingProposalCount ? 'REVIEW' : 'CLEAR'} />

    {coaches.length ? <View style={styles.list}>{coaches.map((grant) => <Surface key={grant.id} style={styles.row}><View style={{flex:1}}><Text style={styles.title}>{grant.coachDisplayName}</Text><Text style={styles.body}>Future strength proposals only · access expires {formatDate(grant.expiresAt)}</Text><View style={styles.inlineActions}><Pressable disabled={busy} onPress={() => void renew(grant)}><Text style={styles.link}>Renew 90 days</Text></Pressable><Pressable onPress={() => confirmRevoke(grant)}><Text style={styles.danger}>Remove</Text></Pressable></View></View></Surface>)}</View> : <Text style={styles.empty}>No coach currently has access.</Text>}

    <SectionTitle detail="Coach role">Enter an athlete code</SectionTitle>
    <Surface><TextInput value={code} onChangeText={(value: string) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10))} placeholder="COACH CODE" placeholderTextColor={palette.inkMuted} autoCapitalize="characters" autoCorrect={false} style={styles.input}/><Pressable disabled={!available || busy || code.length < 6} onPress={() => void accept()} style={[styles.primary, (!available || busy || code.length < 6) && styles.disabled]}><Text style={styles.primaryText}>Accept coach access</Text></Pressable></Surface>

    {athletes.length ? <><SectionTitle>Plans I coach</SectionTitle>{athletes.map((grant) => { const expired = new Date(grant.expiresAt).getTime() <= Date.now(); return <ActionCard key={grant.id} icon="↗" title={grant.athleteDisplayName} body={expired ? `Access expired ${formatDate(grant.expiresAt)}. The athlete must renew it before you can view or propose changes.` : `Propose future strength changes for athlete approval. Access expires ${formatDate(grant.expiresAt)}.`} onPress={() => expired ? setMessage('This coach grant has expired. Ask the athlete to renew it from Coach Access.') : router.push({ pathname: '/coach-plan', params: { athleteId: grant.athleteId, athleteName: grant.athleteDisplayName } } as never)} badge={expired ? 'EXPIRED' : 'PROPOSALS'}/>})}</> : null}
    {message ? <Surface><Text style={styles.message}>{message}</Text></Surface> : null}
  </AppScreen>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }

function makeStyles(palette: AppPalette) { return StyleSheet.create({
  notice:{gap:8},privacy:{gap:7,backgroundColor:palette.mint},title:{fontSize:16,fontWeight:'900',color:palette.ink},body:{...typography.small,color:palette.inkMuted},
  primary:{backgroundColor:palette.forest,borderRadius:15,padding:15,alignItems:'center'},primaryText:{color:palette.white,fontWeight:'900'},secondary:{borderWidth:1,borderColor:palette.forest,borderRadius:14,padding:13,alignItems:'center'},secondaryText:{color:palette.forest,fontWeight:'900'},disabled:{opacity:.4},
  codeCard:{alignItems:'center',gap:7},codeLabel:{...typography.eyebrow,color:palette.inkMuted},code:{fontSize:34,fontWeight:'900',letterSpacing:5,color:palette.forest},list:{gap:8},row:{flexDirection:'row',alignItems:'center',gap:12},danger:{color:palette.danger,fontWeight:'900'},empty:{...typography.small,color:palette.inkMuted},
  input:{backgroundColor:palette.canvas,borderWidth:1,borderColor:palette.border,borderRadius:14,padding:14,color:palette.ink,fontWeight:'800',letterSpacing:2,marginBottom:10},message:{color:palette.ink,fontWeight:'700'},inlineActions:{flexDirection:'row',gap:18,marginTop:8},link:{color:palette.forest,fontWeight:'900'},
});}
