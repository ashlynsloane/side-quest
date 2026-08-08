import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProductDisclosure } from '@/components/product-ui';
import { V23Icon, V23Screen } from '@/components/v23-ui';
import { YouModeSwitch } from '@/components/you-mode-switch';
import {
  getActiveTrainingCheckIn,
  getDefaultEquipmentProfile,
  getLatestPTProfile,
  getLatestTrainingBlock,
} from '@/services/database';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

interface CoachingContextSummary {
  goalName: string;
  eventDate?: string;
  equipmentName: string;
  safeguardLabel: string;
}

export default function ProfileTab() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [context, setContext] = useState<CoachingContextSummary | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    void Promise.all([
      getLatestTrainingBlock(),
      getDefaultEquipmentProfile(),
      getLatestPTProfile(),
      getActiveTrainingCheckIn(),
    ]).then(([saved, equipment, pt, checkIn]) => {
      if (!live) return;
      const block = saved?.block;
      setContext({
        goalName: block?.goal.name ?? 'No active training goal',
        eventDate: block?.goal.eventDate,
        equipmentName: equipment?.name ?? 'No default location',
        safeguardLabel: checkIn?.active
          ? 'Today’s check-in is shaping training'
          : pt?.active
            ? 'Saved training safeguards are active'
            : 'No active restriction profile',
      });
    });
    return () => { live = false; };
  }, []));

  return <V23Screen contentStyle={styles.page}>
    <YouModeSwitch active="profile" />

    <View style={styles.header}>
      <Text style={styles.eyebrow}>YOU</Text>
      <Text style={styles.title}>The context Side Quest coaches from.</Text>
      <Text style={styles.subtitle}>Your goals, available equipment, safeguards, integrations, and sharing choices live here.</Text>
    </View>

    <Pressable accessibilityRole="button" onPress={() => router.push('/more' as Href)} style={({ pressed }) => [styles.account, pressed && styles.pressed]}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{user?.initials ?? 'A'}</Text></View>
      <View style={styles.accountCopy}>
        <Text style={styles.name}>{user?.displayName ?? 'Athlete'}</Text>
        {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
      </View>
      <V23Icon name="chevron" color={tokens.textMuted} size={16} />
    </Pressable>

    <View style={styles.contextCard}>
      <Text style={styles.contextEyebrow}>CURRENT COACHING CONTEXT</Text>
      <Text style={styles.contextTitle}>{context?.goalName ?? 'Loading active training context…'}</Text>
      {context?.eventDate ? <Text style={styles.contextDate}>{formatDate(context.eventDate)}</Text> : null}
      <View style={styles.contextRows}>
        <ContextRow icon="equipment" label="Default location" value={context?.equipmentName ?? 'Loading…'} styles={styles} tokens={tokens} />
        <ContextRow icon="insights" label="Safeguards" value={context?.safeguardLabel ?? 'Loading…'} styles={styles} tokens={tokens} />
      </View>
    </View>

    <View style={styles.sectionHeading}>
      <Text style={styles.sectionEyebrow}>COACHING INPUTS</Text>
      <Text style={styles.sectionTitle}>Change what the planner is allowed to assume.</Text>
    </View>

    <View style={styles.actionStack}>
      <ActionRow icon="plan" title="Goals and capacity" body="Goal, availability, experience, sport profile, and race priorities." onPress={() => router.push('/goal-catalog' as Href)} styles={styles} tokens={tokens} />
      <ActionRow icon="equipment" title="Equipment locations" body="Home, gym, work, hotel, and travel setups used during generation." onPress={() => router.push('/equipment-profiles' as Href)} styles={styles} tokens={tokens} />
      <ActionRow icon="insights" title="Restrictions and symptoms" body="PT context and current safeguards that constrain training decisions." onPress={() => router.push('/pt-profile' as Href)} styles={styles} tokens={tokens} />
      <ActionRow icon="log" title="Training intelligence" body="Control how recent endurance training may influence upcoming strength." onPress={() => router.push('/training-intelligence' as Href)} styles={styles} tokens={tokens} />
    </View>

    <ProductDisclosure
      title="Connections"
      summary="Calendar, Strava, human coach access, friends, and Workout Together."
      expanded={connectionsOpen}
      onPress={() => setConnectionsOpen((value) => !value)}
    >
      <View style={styles.disclosureRows}>
        <CompactRow title="Apps and devices" body="Calendar, Strava, and connected services." onPress={() => router.push('/calendar-sync' as Href)} styles={styles} tokens={tokens} />
        <CompactRow title="Human Coach Access" body="Time-limited plan review with your approval." onPress={() => router.push('/coach-access' as Href)} styles={styles} tokens={tokens} />
        <CompactRow title="Friends and Workout Together" body="Invitations, sharing, and blocking." onPress={() => router.push('/friends' as Href)} styles={styles} tokens={tokens} />
      </View>
    </ProductDisclosure>

    <ProductDisclosure
      title="Privacy and display"
      summary="Preview sharing, export or delete data, and change appearance."
      expanded={privacyOpen}
      onPress={() => setPrivacyOpen((value) => !value)}
    >
      <View style={styles.disclosureRows}>
        <CompactRow title="Sharing center" body="Preview exactly what leaves Side Quest." onPress={() => router.push('/share-center' as Href)} styles={styles} tokens={tokens} />
        <CompactRow title="Data and privacy" body="Export, sharing defaults, and deletion." onPress={() => router.push('/privacy-data' as Href)} styles={styles} tokens={tokens} />
        <CompactRow title="Appearance" body="Training environment and display preferences." onPress={() => router.push('/appearance' as Href)} styles={styles} tokens={tokens} />
      </View>
    </ProductDisclosure>

    <ProductDisclosure
      title="Support and beta tools"
      summary="Setup guide, feedback, and development-only diagnostics."
      expanded={supportOpen}
      onPress={() => setSupportOpen((value) => !value)}
    >
      <View style={styles.disclosureRows}>
        <CompactRow title="Setup guide" body="Review goals, safeguards, and integrations." onPress={() => router.push('/onboarding' as Href)} styles={styles} tokens={tokens} />
        <CompactRow title="Send beta feedback" body="Report a bug or confusing recommendation." onPress={() => router.push('/beta-feedback' as Href)} styles={styles} tokens={tokens} />
        {__DEV__ ? <CompactRow title="Developer tools" body="Product scenarios, visual QA, and diagnostics." onPress={() => router.push('/developer-tools' as Href)} styles={styles} tokens={tokens} /> : null}
      </View>
    </ProductDisclosure>

    <Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
      <Text style={styles.signOutText}>Sign out</Text>
    </Pressable>
  </V23Screen>;
}

function ContextRow({ icon, label, value, styles, tokens }: {
  icon: Parameters<typeof V23Icon>[0]['name'];
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <View style={styles.contextRow}>
    <View style={styles.contextIcon}><V23Icon name={icon} color={tokens.accent} size={17} /></View>
    <View style={styles.contextCopy}><Text style={styles.contextLabel}>{label}</Text><Text style={styles.contextValue}>{value}</Text></View>
  </View>;
}

function ActionRow({ icon, title, body, onPress, styles, tokens }: {
  icon: Parameters<typeof V23Icon>[0]['name'];
  title: string;
  body: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
    <View style={styles.actionIcon}><V23Icon name={icon} color={tokens.accent} size={19} /></View>
    <View style={styles.actionCopy}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionBody}>{body}</Text></View>
    <V23Icon name="chevron" color={tokens.textMuted} size={15} />
  </Pressable>;
}

function CompactRow({ title, body, onPress, styles, tokens }: {
  title: string;
  body: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  tokens: DesignTokens;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.compactRow, pressed && styles.pressed]}>
    <View style={styles.actionCopy}><Text style={styles.compactTitle}>{title}</Text><Text style={styles.compactBody}>{body}</Text></View>
    <V23Icon name="chevron" color={tokens.textMuted} size={14} />
  </Pressable>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    page: { gap: 18, paddingTop: 14, paddingBottom: 38 },
    header: { gap: 5, paddingHorizontal: 2 },
    eyebrow: { color: tokens.accent, fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 1.05 },
    title: { color: tokens.text, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.55 },
    subtitle: { color: tokens.textMuted, fontSize: 13.5, lineHeight: 20 },

    account: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 2 },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
    accountCopy: { flex: 1, minWidth: 0 },
    name: { color: tokens.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
    email: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },

    contextCard: { borderRadius: 24, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, padding: 18, gap: 7 },
    contextEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    contextTitle: { color: tokens.text, fontSize: 22, lineHeight: 27, fontWeight: '900', letterSpacing: -0.25 },
    contextDate: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
    contextRows: { marginTop: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border },
    contextRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border, paddingVertical: 9 },
    contextIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    contextCopy: { flex: 1, minWidth: 0, gap: 1 },
    contextLabel: { color: tokens.textMuted, fontSize: 9.5, lineHeight: 13, fontWeight: '800' },
    contextValue: { color: tokens.text, fontSize: 12.5, lineHeight: 17, fontWeight: '800' },

    sectionHeading: { gap: 2, paddingHorizontal: 2 },
    sectionEyebrow: { color: tokens.accent, fontSize: 9.5, lineHeight: 12, fontWeight: '900', letterSpacing: 0.95 },
    sectionTitle: { color: tokens.text, fontSize: 19, lineHeight: 24, fontWeight: '900', letterSpacing: -0.2 },
    actionStack: { borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surface, overflow: 'hidden' },
    actionRow: { minHeight: 72, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border },
    actionIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    actionCopy: { flex: 1, minWidth: 0, gap: 2 },
    actionTitle: { color: tokens.text, fontSize: 13.5, lineHeight: 18, fontWeight: '900' },
    actionBody: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },

    disclosureRows: { gap: 0 },
    compactRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border, paddingVertical: 9 },
    compactTitle: { color: tokens.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    compactBody: { color: tokens.textMuted, fontSize: 11, lineHeight: 15 },
    signOut: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
    signOutText: { color: tokens.danger, fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    pressed: { opacity: 0.72 },
  });
}
