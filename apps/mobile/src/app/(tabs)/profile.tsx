import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { V23GroupedList, V23Row, V23Screen, V23SectionHeader } from '@/components/v23-ui';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';

export default function ProfileTab() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  return <V23Screen>
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>YOU</Text>
      <Text style={styles.title}>Profile and settings</Text>
    </View>

    <Pressable onPress={() => router.push('/more' as Href)} style={({ pressed }) => [styles.account, pressed && styles.pressed]}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{user?.initials ?? 'A'}</Text></View>
      <View style={styles.accountCopy}><Text style={styles.name}>{user?.displayName ?? 'Athlete'}</Text><Text style={styles.email}>{user?.email}</Text></View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>

    <V23SectionHeader>Training</V23SectionHeader>
    <V23GroupedList>
      <V23Row title="Goals and capacity" detail="Goal, availability, experience, and sport profile" onPress={() => router.push('/goal-catalog' as Href)} />
      <V23Row title="Training spaces" detail="Home, gym, and the equipment you actually have access to" onPress={() => router.push('/training-spaces' as Href)} />
      <V23Row title="Restrictions and symptoms" detail="PT context and training safeguards" onPress={() => router.push('/pt-profile' as Href)} last={process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA !== 'true'} />
      {process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA === 'true' ? (
        <V23Row title="Rehabilitation history (beta)" detail="Track injuries, flares, daily symptoms, and progress" onPress={() => router.push('/rehab' as Href)} last />
      ) : null}
    </V23GroupedList>

    <V23SectionHeader>Connections</V23SectionHeader>
    <V23GroupedList>
      <V23Row title="Apps and devices" detail="Calendar, Strava, and connected services" onPress={() => router.push('/calendar-sync' as Href)} />
      <V23Row title="Human Coach Access" detail="Time-limited plan review with your approval" onPress={() => router.push('/coach-access' as Href)} />
      <V23Row title="Friends and Workout Together" detail="Invitations, sharing, and blocking" onPress={() => router.push('/friends' as Href)} last />
    </V23GroupedList>

    <V23SectionHeader>Privacy and display</V23SectionHeader>
    <V23GroupedList>
      <V23Row title="Sharing center" detail="Preview exactly what leaves Side Quest" onPress={() => router.push('/share-center' as Href)} />
      <V23Row title="Data and privacy" detail="Export, sharing defaults, and deletion" onPress={() => router.push('/privacy-data' as Href)} />
      <V23Row title="Appearance" detail="Training environment and display" onPress={() => router.push('/appearance' as Href)} last />
    </V23GroupedList>

    <V23SectionHeader>Support</V23SectionHeader>
    <V23GroupedList>
      <V23Row title="Setup guide" detail="Review goals, safeguards, and integrations" onPress={() => router.push('/onboarding' as Href)} />
      <V23Row title="Send beta feedback" detail="Report a bug or confusing recommendation" onPress={() => router.push('/beta-feedback' as Href)} last={!__DEV__} />
      {__DEV__ ? <V23Row title="Developer tools" detail="Product scenarios, visual QA, and diagnostics" onPress={() => router.push('/developer-tools' as Href)} last /> : null}
    </V23GroupedList>

    <Pressable onPress={() => void signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}><Text style={styles.signOutText}>Sign out</Text></Pressable>
  </V23Screen>;
}

function makeStyles(tokens: ReturnType<typeof useTheme>['tokens']) { return StyleSheet.create({
  intro: { gap: 5, marginBottom: 2 }, eyebrow: { color: tokens.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 }, title: { color: tokens.text, fontSize: 29, lineHeight: 34, fontWeight: '900' },
  account: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border }, avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' }, accountCopy: { flex: 1 }, name: { color: tokens.text, fontSize: 18, lineHeight: 22, fontWeight: '800' }, email: { color: tokens.textMuted, fontSize: 13, lineHeight: 17, marginTop: 2 }, chevron: { color: tokens.textMuted, fontSize: 21 },
  signOut: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 2, borderRadius: 14 }, signOutText: { color: tokens.danger, fontSize: 14, fontWeight: '700' }, pressed: { opacity: 0.7 },
}); }
