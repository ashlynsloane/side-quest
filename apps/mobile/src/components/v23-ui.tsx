import { useMemo, type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/state/theme-context';
import { v23Radius, v23Type, type DesignTokens } from '@/theme';
import { SportIcon, type SportIconKind } from '@/components/sport-icon';

const TAB_PATHS = new Set(['/', '/plan', '/train', '/coach', '/profile']);

export type V23IconName = 'bell' | 'info' | 'settings' | 'home' | 'plan' | 'train' | 'insights' | 'profile' | 'chevron' | 'play' | 'pause' | 'swap' | 'adjust' | 'clock' | 'equipment' | 'heart' | 'log' | 'search' | 'goal' | 'back' | 'more' | 'check';
const ICONS: Record<V23IconName, { ios: string; android: string; web: string; fallback: string }> = {
  bell: { ios: 'bell', android: 'notifications_none', web: 'notifications_none', fallback: '○' },
  info: { ios: 'info.circle', android: 'info_outline', web: 'info_outline', fallback: 'i' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings', fallback: '⚙' },
  home: { ios: 'house', android: 'home', web: 'home', fallback: '⌂' },
  plan: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month', fallback: '□' },
  train: { ios: 'dumbbell', android: 'fitness_center', web: 'fitness_center', fallback: 'H' },
  insights: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart', fallback: '▥' },
  profile: { ios: 'person', android: 'person_outline', web: 'person_outline', fallback: '○' },
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right', fallback: '›' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow', fallback: '▶' },
  pause: { ios: 'pause.fill', android: 'pause', web: 'pause', fallback: 'Ⅱ' },
  swap: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz', fallback: '↔' },
  adjust: { ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync', fallback: '↔' },
  clock: { ios: 'clock.arrow.circlepath', android: 'schedule', web: 'schedule', fallback: '↘' },
  equipment: { ios: 'dumbbell', android: 'fitness_center', web: 'fitness_center', fallback: 'DB' },
  heart: { ios: 'heart.fill', android: 'favorite', web: 'favorite', fallback: '♥' },
  log: { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note', fallback: '□' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search', fallback: '⌕' },
  goal: { ios: 'flag', android: 'flag', web: 'flag', fallback: '△' },
  back: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left', fallback: '‹' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz', fallback: '•••' },
  check: { ios: 'checkmark', android: 'check', web: 'check', fallback: '✓' },
};

export function V23Icon({ name, color, size = 18 }: { name: V23IconName; color?: string; size?: number }) {
  const { tokens } = useTheme();
  const icon = ICONS[name];
  const tint = color ?? tokens.accent;
  return <SymbolView name={{ ios: icon.ios, android: icon.android, web: icon.web } as never} size={size} tintColor={tint} fallback={<Text style={{ color: tint, fontSize: Math.max(10, size - 2), fontWeight: '700' }}>{icon.fallback}</Text>} />;
}

export function V23BrandHeader() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeHeaderStyles(tokens), [tokens]);
  const primary = TAB_PATHS.has(pathname);
  const action: V23IconName = pathname === '/' ? 'bell' : pathname === '/coach' ? 'info' : 'settings';
  const actionRoute: Href = pathname === '/' ? '/readiness' : pathname === '/coach' ? '/training-intelligence' : '/appearance';
  const canBack = !primary && router.canGoBack();

  return <View style={[styles.shell, primary ? styles.primaryShell : styles.compactShell, { height: insets.top + (primary ? 48 : 36), paddingTop: insets.top }]}>
    <View style={styles.leftCluster}>
      {canBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}><V23Icon name="back" color="#FFFFFF" size={21} /></Pressable> : null}
      <Image source={require('../../assets/images/side-quest-wordmark-transparent.png')} resizeMode="contain" style={[styles.wordmark, !primary && styles.compactWordmark]} accessibilityLabel="Side Quest" />
    </View>
    {primary ? <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={() => router.push(actionRoute)} style={styles.actionButton}><V23Icon name={action} color="#FFFFFF" size={19} /></Pressable> : <View style={styles.actionButton} />}
  </View>;
}

export function V23Screen({ children, scroll = true, contentStyle }: { children: ReactNode; scroll?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeScreenStyles(tokens), [tokens]);
  if (!scroll) return <View style={[styles.screen, styles.content, contentStyle]}>{children}</View>;
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}><ScrollView style={styles.screen} contentContainerStyle={[styles.content, contentStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets>{children}</ScrollView></KeyboardAvoidingView>;
}

export function V23PageIntro({ label, title, body, compact = false }: { label?: string; title: string; body?: string; compact?: boolean }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeUiStyles(tokens), [tokens]);
  return <View style={[styles.intro, compact && styles.introCompact]}>{label ? <Text style={styles.label}>{label}</Text> : null}<Text style={[styles.pageTitle, compact && styles.pageTitleCompact]}>{title}</Text>{body ? <Text style={styles.pageBody}>{body}</Text> : null}</View>;
}

export function V23SectionHeader({ children, detail }: { children: ReactNode; detail?: string }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeUiStyles(tokens), [tokens]);
  return <View style={styles.sectionHeader}><Text style={styles.sectionLabel}>{children}</Text>{detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}</View>;
}

export function V23Card({ children, tone = 'standard', elevated = false, style }: { children: ReactNode; tone?: 'standard' | 'muted' | 'accent'; elevated?: boolean; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeUiStyles(tokens), [tokens]);
  return <View style={[styles.card, tone === 'muted' && styles.cardMuted, tone === 'accent' && styles.cardAccent, elevated && styles.elevated, style]}>{children}</View>;
}

export function V23GroupedList({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeUiStyles(tokens), [tokens]);
  return <View style={[styles.group, style]}>{children}</View>;
}

export function V23Row({ title, detail, icon, onPress, trailing, last = false, badge }: { title: string; detail?: string; icon?: ReactNode; onPress: () => void; trailing?: ReactNode; last?: boolean; badge?: string }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeUiStyles(tokens), [tokens]);
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.pressed]}>
    {icon ? <View style={styles.rowIcon}>{icon}</View> : null}
    <View style={styles.rowCopy}><View style={styles.rowTitleLine}><Text style={styles.rowTitle}>{title}</Text>{badge ? <Text style={styles.badge}>{badge}</Text> : null}</View>{detail ? <Text style={styles.rowDetail} numberOfLines={3}>{detail}</Text> : null}</View>
    {trailing ?? <V23Icon name="chevron" color={tokens.textMuted} size={16} />}
  </Pressable>;
}

export function V23StatusCard({ title, body, icon, tone = 'accent', onPress, featured = false }: { title: string; body: string; icon: ReactNode; tone?: 'accent' | 'review' | 'info' | 'recovery' | 'warm'; onPress?: () => void; featured?: boolean }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeUiStyles(tokens), [tokens]);
  const content = <><View style={[styles.statusIcon, tone === 'review' && styles.statusIconReview, tone === 'info' && styles.statusIconInfo, tone === 'recovery' && styles.statusIconRecovery, tone === 'warm' && styles.statusIconWarm]}>{icon}</View><View style={styles.statusCopy}><Text style={styles.statusTitle}>{title}</Text><Text style={styles.statusBody}>{body}</Text></View>{onPress ? <V23Icon name="chevron" color={tokens.textMuted} size={16} /> : null}</>;
  const cardStyle = [styles.statusCard, tone === 'review' && styles.statusReview, tone === 'info' && styles.statusInfo, tone === 'recovery' && styles.statusRecovery, tone === 'warm' && styles.statusWarm, featured && styles.elevated];
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [cardStyle, pressed && styles.pressed]}>{content}</Pressable> : <View style={cardStyle}>{content}</View>;
}

export function V23Chip({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'neutral' | 'warm' | 'info' }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeUiStyles(tokens), [tokens]);
  return <View style={[styles.chip, tone === 'neutral' && styles.chipNeutral, tone === 'warm' && styles.chipWarm, tone === 'info' && styles.chipInfo]}><Text style={styles.chipText}>{children}</Text></View>;
}

export function V23PrimaryButton({ children, onPress, icon = 'chevron' }: { children: ReactNode; onPress: () => void; icon?: V23IconName | '' }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeUiStyles(tokens), [tokens]);
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{children}</Text>{icon ? <V23Icon name={icon} color="#FFFFFF" size={18} /> : null}</Pressable>;
}

export function V23OutlineButton({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeUiStyles(tokens), [tokens]);
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]}><Text style={styles.outlineButtonText}>{children}</Text></Pressable>;
}

export function V23SportPill({ kind, color, backgroundColor }: { kind: SportIconKind; color?: string; backgroundColor?: string }) {
  const { palette, tokens } = useTheme();
  const resolvedColor = color ?? (kind === 'swim' ? '#267BA6' : kind === 'bike' ? '#C58322' : kind === 'run' ? '#526E9A' : kind === 'strength' || kind === 'hiit' ? tokens.accent : tokens.textMuted);
  const resolvedBackground = backgroundColor ?? (tokens.isDark ? (kind === 'swim' ? '#183744' : kind === 'bike' ? '#42351F' : kind === 'run' ? '#293149' : kind === 'strength' || kind === 'hiit' ? tokens.accentSoft : palette.surfaceMuted) : (kind === 'swim' ? '#E4F2F8' : kind === 'bike' ? '#FBF0DB' : kind === 'run' ? '#E9EDF6' : kind === 'strength' || kind === 'hiit' ? tokens.accentSoft : palette.surfaceMuted));
  return <SportIcon kind={kind} color={resolvedColor} backgroundColor={resolvedBackground} size={19} />;
}

export function V23ScenicBanner({ variant = 'morning' }: { variant?: 'morning' | 'goal' | 'strength' }) {
  const { tokens, palette } = useTheme();
  const styles = useMemo(() => makeSceneStyles(tokens), [tokens]);
  if (variant === 'strength') return <View style={[styles.scene, styles.strengthScene]} accessibilityElementsHidden>
    <View style={styles.floor} />
    <View style={styles.plant}><View style={[styles.leaf, { transform: [{ rotate: '-30deg' }] }]} /><View style={[styles.leaf, { left: 8, transform: [{ rotate: '27deg' }] }]} /><View style={styles.plantPot} /></View>
    <View style={styles.bar}><View style={[styles.plate, styles.plateLeftOuter]} /><View style={[styles.plate, styles.plateLeftInner]} /><View style={[styles.plate, styles.plateRightInner]} /><View style={[styles.plate, styles.plateRightOuter]} /></View>
    <View style={styles.dumbbell}><View style={styles.dumbbellHandle} /><View style={[styles.dumbbellEnd, styles.dumbbellEndLeft]} /><View style={[styles.dumbbellEnd, styles.dumbbellEndRight]} /></View>
    <View style={styles.bench}><View style={styles.benchTop} /><View style={styles.benchLeg} /></View>
  </View>;
  return <View style={[styles.scene, variant === 'goal' && styles.goalScene]} accessibilityElementsHidden>
    <View style={styles.sun} /><View style={[styles.cloud, styles.cloudOne]} /><View style={[styles.cloud, styles.cloudTwo]} />
    <View style={[styles.mountain, styles.mountainBack]} /><View style={[styles.mountain, styles.mountainFront]} /><View style={styles.path} />
    <Tree styles={styles} left="5%" bottom={5} scale={0.72} color={palette.moss} /><Tree styles={styles} left="13%" bottom={0} scale={0.95} color={tokens.accent} /><Tree styles={styles} left="76%" bottom={3} scale={0.82} color={palette.moss} /><Tree styles={styles} left="88%" bottom={-1} scale={1} color={tokens.accent} />
    {variant === 'goal' ? <><View style={styles.flagPole} /><View style={styles.flag} /></> : null}
  </View>;
}

function Tree({ styles, left, bottom, scale, color }: { styles: ReturnType<typeof makeSceneStyles>; left: string; bottom: number; scale: number; color: string }) {
  return <View style={[styles.tree, { left: left as never, bottom, transform: [{ scale }] }]}><View style={[styles.treeTop, { borderBottomColor: color }]} /><View style={[styles.treeMiddle, { borderBottomColor: color }]} /><View style={styles.treeTrunk} /></View>;
}

export function V23GoalChoiceRow({ title, description, disciplines, selected, onPress }: { title: string; description: string; disciplines: Array<'swim' | 'bike' | 'run'>; selected: boolean; onPress: () => void }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeUiStyles(tokens), [tokens]);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.goalRow, selected && styles.goalRowSelected, pressed && styles.pressed]}>
    <View style={styles.goalSports}>{disciplines.length ? disciplines.map((kind) => <SportIcon key={kind} kind={kind} color={selected ? '#FFFFFF' : tokens.accent} backgroundColor="transparent" size={13} />) : <V23Icon name="train" color={selected ? '#FFFFFF' : tokens.accent} size={17} />}</View>
    <View style={styles.rowCopy}><Text style={[styles.goalTitle, selected && styles.goalTextSelected]}>{title}</Text><Text style={[styles.goalDescription, selected && styles.goalDescriptionSelected]} numberOfLines={2}>{description}</Text></View>
    {selected ? <View style={styles.selectedCircle}><V23Icon name="check" color={tokens.accent} size={12} /></View> : <V23Icon name="chevron" color={tokens.textMuted} size={15} />}
  </Pressable>;
}

function makeHeaderStyles(tokens: DesignTokens) { return StyleSheet.create({
  shell: { backgroundColor: tokens.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.header },
  primaryShell: {}, compactShell: { paddingHorizontal: 12 }, leftCluster: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  wordmark: { width: 112, height: 30 }, compactWordmark: { width: 78, height: 21 },
  actionButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  backButton: { width: 34, height: 34, alignItems: 'flex-start', justifyContent: 'center', marginRight: 2 },
}); }

function makeScreenStyles(tokens: DesignTokens) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.canvas },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 104, gap: 18 },
}); }

function makeUiStyles(tokens: DesignTokens) { return StyleSheet.create({
  intro: { gap: 6, marginBottom: 2 }, introCompact: { gap: 4 }, label: { ...v23Type.label, color: tokens.accent, textTransform: 'uppercase' }, pageTitle: { ...v23Type.pageTitle, color: tokens.text }, pageTitleCompact: { fontSize: 23, lineHeight: 29 }, pageBody: { ...v23Type.body, color: tokens.textMuted },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 4 }, sectionLabel: { ...v23Type.label, color: tokens.accent, textTransform: 'uppercase' }, sectionDetail: { ...v23Type.secondary, color: tokens.textMuted },
  card: { backgroundColor: tokens.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, borderRadius: v23Radius.card, padding: 18 }, cardMuted: { backgroundColor: tokens.surfaceMuted }, cardAccent: { backgroundColor: tokens.accentSoft, borderColor: tokens.border }, elevated: { shadowColor: tokens.text, shadowOpacity: tokens.isDark ? 0.18 : 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  group: { backgroundColor: tokens.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border, borderRadius: v23Radius.card, overflow: 'hidden' },
  row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: tokens.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border }, rowLast: { borderBottomWidth: 0 }, rowIcon: { width: 42, height: 42, borderRadius: v23Radius.small, backgroundColor: tokens.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, rowCopy: { flex: 1, minWidth: 0 }, rowTitleLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, rowTitle: { ...v23Type.rowTitle, color: tokens.text }, rowDetail: { ...v23Type.secondary, color: tokens.textMuted, marginTop: 2 }, badge: { fontSize: 10, lineHeight: 13, fontWeight: '800', color: tokens.accent, backgroundColor: tokens.accentSoft, borderRadius: v23Radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
  statusCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 15, paddingVertical: 14, borderWidth: 1, borderRadius: v23Radius.card, backgroundColor: tokens.accentSoft, borderColor: tokens.border }, statusReview: { backgroundColor: tokens.isDark ? '#45251F' : '#FBE9E1', borderColor: tokens.isDark ? '#744137' : '#F0D0C3' }, statusInfo: { backgroundColor: tokens.isDark ? '#183441' : '#E3F1F7', borderColor: tokens.isDark ? '#2A596B' : '#CBE3ED' }, statusRecovery: { backgroundColor: tokens.isDark ? '#352640' : '#EFE7F5', borderColor: tokens.isDark ? '#5C4270' : '#DFD1E9' }, statusWarm: { backgroundColor: tokens.isDark ? '#41331F' : '#F8EEDC', borderColor: tokens.isDark ? '#6E5836' : '#EADBBF' },
  statusIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: tokens.accent, alignItems: 'center', justifyContent: 'center' }, statusIconReview: { backgroundColor: '#D3543B' }, statusIconInfo: { backgroundColor: '#2F80AA' }, statusIconRecovery: { backgroundColor: '#875FB0' }, statusIconWarm: { backgroundColor: '#B37A25' }, statusCopy: { flex: 1, minWidth: 0 }, statusTitle: { ...v23Type.rowTitle, color: tokens.text }, statusBody: { ...v23Type.secondary, color: tokens.textMuted, marginTop: 3 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: v23Radius.pill, backgroundColor: tokens.accentSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border }, chipNeutral: { backgroundColor: tokens.surfaceMuted }, chipWarm: { backgroundColor: tokens.isDark ? '#41331F' : '#F8EEDC', borderColor: tokens.isDark ? '#6E5836' : '#EADBBF' }, chipInfo: { backgroundColor: tokens.isDark ? '#183441' : '#E3F1F7', borderColor: tokens.isDark ? '#2A596B' : '#CBE3ED' }, chipText: { color: tokens.accent, fontSize: 11, lineHeight: 14, fontWeight: '700' },
  primaryButton: { minHeight: 50, paddingHorizontal: 18, borderRadius: v23Radius.control, backgroundColor: tokens.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, primaryButtonText: { color: '#FFFFFF', fontSize: 15.5, lineHeight: 20, fontWeight: '800' }, outlineButton: { minHeight: 50, paddingHorizontal: 16, borderRadius: v23Radius.control, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }, outlineButtonText: { color: tokens.text, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  goalRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: tokens.border, borderRadius: v23Radius.card, backgroundColor: tokens.surface }, goalRowSelected: { backgroundColor: tokens.accent, borderColor: tokens.accent }, goalSports: { width: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 1 }, goalTitle: { ...v23Type.rowTitle, color: tokens.text }, goalDescription: { ...v23Type.secondary, color: tokens.textMuted, marginTop: 2 }, goalTextSelected: { color: '#FFFFFF' }, goalDescriptionSelected: { color: 'rgba(255,255,255,0.82)' }, selectedCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, pressed: { opacity: 0.72 },
}); }

function makeSceneStyles(tokens: DesignTokens) { return StyleSheet.create({
  scene: { height: 104, borderRadius: v23Radius.card, overflow: 'hidden', backgroundColor: tokens.surface, position: 'relative', borderWidth: 1, borderColor: tokens.border }, goalScene: { height: 104, borderRadius: 0, marginHorizontal: -18 }, strengthScene: { height: 132, backgroundColor: tokens.surfaceMuted },
  sun: { position: 'absolute', width: 27, height: 27, borderRadius: 14, backgroundColor: '#F4CC69', left: '56%', top: 16 }, cloud: { position: 'absolute', height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.84)' }, cloudOne: { width: 46, left: '34%', top: 17 }, cloudTwo: { width: 34, left: '69%', top: 26 },
  mountain: { position: 'absolute', width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' }, mountainBack: { borderLeftWidth: 84, borderRightWidth: 84, borderBottomWidth: 57, borderBottomColor: tokens.accentSoft, left: '24%', bottom: 12 }, mountainFront: { borderLeftWidth: 104, borderRightWidth: 104, borderBottomWidth: 65, borderBottomColor: tokens.surfaceMuted, left: '47%', bottom: 1 }, path: { position: 'absolute', width: 146, height: 19, borderRadius: 14, backgroundColor: '#F2DFAC', left: '29%', bottom: -2, transform: [{ rotate: '-6deg' }] },
  tree: { position: 'absolute', width: 22, height: 50, alignItems: 'center' }, treeTop: { width: 0, height: 0, borderLeftWidth: 11, borderRightWidth: 11, borderBottomWidth: 24, borderLeftColor: 'transparent', borderRightColor: 'transparent' }, treeMiddle: { width: 0, height: 0, borderLeftWidth: 14, borderRightWidth: 14, borderBottomWidth: 28, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -13 }, treeTrunk: { width: 4, height: 14, backgroundColor: '#7C684A', marginTop: -4 },
  flagPole: { position: 'absolute', right: 48, top: 11, width: 2, height: 30, backgroundColor: '#A47B3B' }, flag: { position: 'absolute', right: 36, top: 11, width: 13, height: 7, backgroundColor: '#E5983C', transform: [{ skewY: '-12deg' }] },
  floor: { position: 'absolute', left: 0, right: 0, height: 24, bottom: 0, backgroundColor: tokens.border }, bar: { position: 'absolute', width: 176, height: 5, borderRadius: 3, backgroundColor: '#485050', left: '27%', top: 41 }, plate: { position: 'absolute', top: -16, width: 14, height: 37, borderRadius: 5, backgroundColor: '#444D4D' }, plateLeftOuter: { left: -10 }, plateLeftInner: { left: 7, width: 7, height: 29, top: -12 }, plateRightInner: { right: 7, width: 7, height: 29, top: -12 }, plateRightOuter: { right: -10 },
  dumbbell: { position: 'absolute', left: '42%', bottom: 30, width: 66, height: 24, alignItems: 'center', justifyContent: 'center' }, dumbbellHandle: { width: 46, height: 6, borderRadius: 3, backgroundColor: '#6F7975' }, dumbbellEnd: { position: 'absolute', width: 13, height: 24, borderRadius: 4, backgroundColor: tokens.accent }, dumbbellEndLeft: { left: 2 }, dumbbellEndRight: { right: 2 },
  bench: { position: 'absolute', right: 28, bottom: 24, width: 52, height: 38, alignItems: 'center' }, benchTop: { width: 51, height: 9, borderRadius: 4, backgroundColor: '#98A09D' }, benchLeg: { width: 4, height: 29, backgroundColor: '#7B8581' }, plant: { position: 'absolute', left: 22, bottom: 23, width: 28, height: 45 }, leaf: { position: 'absolute', top: 3, left: 1, width: 12, height: 24, borderRadius: 10, backgroundColor: tokens.accentSoft }, plantPot: { position: 'absolute', left: 4, bottom: 0, width: 21, height: 19, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: '#B9B3A7' },
}); }
