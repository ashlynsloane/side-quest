import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { V23Chip, V23ScenicBanner } from '@/components/v23-ui';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

export default function SignInScreen() {
  const { cloudEnabled, requestOtp, verifyOtp, continueLocal } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [invite, setInvite] = useState(''); const [code, setCode] = useState('');
  const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function send() { setBusy(true); setError(null); try { const required = process.env.EXPO_PUBLIC_BETA_INVITE_CODE?.trim(); if (required && invite.trim() !== required) throw new Error('That beta invite code is not valid.'); await requestOtp(email); setSent(true); } catch (value) { setError(value instanceof Error ? value.message : String(value)); } finally { setBusy(false); } }
  async function verify() { setBusy(true); setError(null); try { await verifyOtp(email, code, name); } catch (value) { setError(value instanceof Error ? value.message : String(value)); } finally { setBusy(false); } }
  async function local() { setBusy(true); setError(null); try { await continueLocal({ email, displayName: name, inviteCode: invite }); } catch (value) { setError(value instanceof Error ? value.message : String(value)); } finally { setBusy(false); } }

  return <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <V23ScenicBanner />
      <View style={styles.intro}>
        <View style={styles.chips}><V23Chip>Adaptive</V23Chip><V23Chip tone="info">Strength-aware</V23Chip><V23Chip tone="warm">Athlete-first</V23Chip></View>
        <Text style={styles.title}>Stronger decisions. Built for real life.</Text>
        <Text style={styles.body}>Coordinate strength, endurance, recovery, and the schedule you actually have.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{cloudEnabled ? 'Sign in with email' : 'Create your beta profile'}</Text>
        <TextInput testID="sidequest-qa-athlete-name" accessibilityLabel="Athlete name" autoCapitalize="words" value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={tokens.textMuted} style={styles.input} />
        <TextInput testID="sidequest-qa-athlete-email" accessibilityLabel="Athlete email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={tokens.textMuted} style={styles.input} />
        {process.env.EXPO_PUBLIC_BETA_INVITE_CODE ? <TextInput autoCapitalize="characters" value={invite} onChangeText={setInvite} placeholder="Invite code" placeholderTextColor={tokens.textMuted} style={styles.input} /> : null}
        {cloudEnabled && sent ? <TextInput keyboardType="number-pad" value={code} onChangeText={setCode} placeholder="Email sign-in code" placeholderTextColor={tokens.textMuted} style={styles.input} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {cloudEnabled ? <Pressable disabled={busy || !email.trim()} onPress={() => void (sent ? verify() : send())} style={({ pressed }) => [styles.primary, (busy || !email.trim()) && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{busy ? 'Working…' : sent ? 'Verify code' : 'Email me a code'}</Text></Pressable> : <Pressable testID="sidequest-qa-enter-beta" accessibilityRole="button" disabled={busy || !email.trim()} onPress={() => void local()} style={({ pressed }) => [styles.primary, (busy || !email.trim()) && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{busy ? 'Creating…' : 'Enter beta'}</Text></Pressable>}
        <Text style={styles.note}>{cloudEnabled ? 'A one-time code creates or signs into your private beta account.' : 'Your profile and workouts stay on this device. Cloud features are only needed for cross-phone and social tools.'}</Text>
      </View>
      <Text style={styles.legal}>Side Quest organizes training. It does not provide medical diagnosis or clearance.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.canvas }, content: { padding: 18, paddingBottom: 42, gap: 16 }, intro: { gap: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, title: { color: tokens.text, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.45 }, body: { color: tokens.textMuted, fontSize: 14.5, lineHeight: 20 }, card: { gap: 11, borderWidth: 1, borderColor: tokens.border, borderRadius: 20, backgroundColor: tokens.surface, padding: 16 }, cardTitle: { color: tokens.text, fontSize: 18, lineHeight: 23, fontWeight: '800', marginBottom: 2 }, input: { minHeight: 49, borderWidth: 1, borderColor: tokens.border, borderRadius: 13, backgroundColor: tokens.canvas, paddingHorizontal: 13, color: tokens.text, fontSize: 14 }, primary: { minHeight: 49, borderRadius: 14, backgroundColor: tokens.header, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' }, note: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 }, error: { color: tokens.danger, fontSize: 12, fontWeight: '700' }, legal: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 15, textAlign: 'center', paddingHorizontal: 12 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.7 },
}); }
