import { useMemo, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/state/theme-context';
import type { AppPalette } from '@/theme';
import { V23BrandHeader } from '@/components/v23-ui';

export const v22 = {
  navy: '#062B5C',
  forest: '#0D513D',
  sage: '#E5F1E8',
  sky: '#EAF4FA',
  blush: '#FDF0E9',
  lilac: '#F3ECF8',
  sand: '#FBF4E7',
  ink: '#102A4B',
  muted: '#5C6B66',
  white: '#FFFFFF',
  canvas: '#E4EBE3',
  surfaceSoft: '#DCE7DF',
  line: '#D1DAD3',
  lineStrong: '#9AAFA3',
  red: '#C94E38',
  orange: '#D79A2D',
  blue: '#2F79A7',
  purple: '#855CA7',
} as const;


type V22IconName = 'bell' | 'info' | 'settings' | 'home' | 'plan' | 'train' | 'insights' | 'profile' | 'chevron' | 'play' | 'adjust' | 'clock' | 'equipment' | 'heart' | 'log' | 'search' | 'goal';
const ICONS: Record<V22IconName, { ios: string; android: string; web: string; fallback: string }> = {
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
  adjust: { ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync', fallback: '↔' },
  clock: { ios: 'clock.arrow.circlepath', android: 'schedule', web: 'schedule', fallback: '↘' },
  equipment: { ios: 'dumbbell', android: 'fitness_center', web: 'fitness_center', fallback: 'DB' },
  heart: { ios: 'heart.fill', android: 'favorite', web: 'favorite', fallback: '♥' },
  log: { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note', fallback: '□' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search', fallback: '⌕' },
  goal: { ios: 'flag', android: 'flag', web: 'flag', fallback: '△' },
};

export function V22Icon({ name, color = v22.navy, size = 17 }: { name: V22IconName; color?: string; size?: number }) {
  const icon = ICONS[name];
  return <SymbolView name={{ ios: icon.ios, android: icon.android, web: icon.web } as never} size={size} tintColor={color} fallback={<Text style={{ color, fontSize: Math.max(10, size - 2), fontWeight: '700' }}>{icon.fallback}</Text>} />;
}

export function V22BrandMasthead() {
  return <V23BrandHeader />;
}

export function V22Screen({ children, scroll = true, contentStyle }: { children: ReactNode; scroll?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  const { palette } = useTheme();
  const styles = useMemo(() => makeScreenStyles(palette), [palette]);
  if (!scroll) return <View style={[styles.screen, styles.content, contentStyle]}>{children}</View>;
  return <View style={styles.screen}><ScrollView style={styles.screen} contentContainerStyle={[styles.content, contentStyle]} showsVerticalScrollIndicator={false}>{children}</ScrollView></View>;
}

export function V22SectionLabel({ children, detail }: { children: ReactNode; detail?: string }) {
  return <View style={uiStyles.sectionHeader}><Text style={uiStyles.sectionLabel}>{children}</Text>{detail ? <Text style={uiStyles.sectionDetail}>{detail}</Text> : null}</View>;
}

export function V22Surface({ children, style, elevated = false }: { children: ReactNode; style?: StyleProp<ViewStyle>; elevated?: boolean }) {
  return <View style={[uiStyles.surface, elevated && uiStyles.surfaceElevated, style]}>{children}</View>;
}

export function V22MenuGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[uiStyles.menuGroup, style]}>{children}</View>;
}

export function MiniChip({ children, tone = 'sage' }: { children: ReactNode; tone?: 'sage' | 'sky' | 'sand' | 'neutral' }) {
  return <View style={[uiStyles.chip, tone === 'sky' && uiStyles.chipSky, tone === 'sand' && uiStyles.chipSand, tone === 'neutral' && uiStyles.chipNeutral]}><Text style={uiStyles.chipText}>{children}</Text></View>;
}

export function PrimaryButton({ children, onPress, icon = 'chevron' }: { children: ReactNode; onPress: () => void; icon?: V22IconName | '' }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [uiStyles.primaryButton, pressed && uiStyles.pressed]}><Text style={uiStyles.primaryButtonText}>{children}</Text>{icon ? <V22Icon name={icon} color={v22.white} size={17} /> : null}</Pressable>;
}

export function OutlineButton({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [uiStyles.outlineButton, pressed && uiStyles.pressed]}><Text style={uiStyles.outlineButtonText}>{children}</Text></Pressable>;
}

export function V22MenuRow({ title, detail, icon, onPress, trailing, last = false }: { title: string; detail?: string; icon?: ReactNode; onPress: () => void; trailing?: ReactNode; last?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [uiStyles.menuRow, last && uiStyles.menuRowLast, pressed && uiStyles.pressed]}>
    {icon ? <View style={uiStyles.menuIcon}>{icon}</View> : null}
    <View style={uiStyles.menuCopy}><Text style={uiStyles.menuTitle}>{title}</Text>{detail ? <Text style={uiStyles.menuDetail} numberOfLines={2}>{detail}</Text> : null}</View>
    {trailing ?? <V22Icon name="chevron" color="#7A8580" size={15} />}
  </Pressable>;
}

export function ContextCard({ title, body, icon, tone = 'sage', onPress, featured = false }: { title: string; body: string; icon: ReactNode; tone?: 'sage' | 'sky' | 'blush' | 'lilac' | 'sand'; onPress?: () => void; featured?: boolean }) {
  const content = <><View style={[uiStyles.contextIcon, tone === 'sky' && uiStyles.contextIconSky, tone === 'blush' && uiStyles.contextIconBlush, tone === 'lilac' && uiStyles.contextIconLilac, tone === 'sand' && uiStyles.contextIconSand]}>{icon}</View><View style={uiStyles.contextCopy}><Text style={uiStyles.contextTitle}>{title}</Text><Text style={uiStyles.contextBody} numberOfLines={3}>{body}</Text></View>{onPress ? <V22Icon name="chevron" color="#75817B" size={15} /> : null}</>;
  const style = [uiStyles.contextCard, tone === 'sky' && uiStyles.contextSky, tone === 'blush' && uiStyles.contextBlush, tone === 'lilac' && uiStyles.contextLilac, tone === 'sand' && uiStyles.contextSand];
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, featured && uiStyles.contextFeatured, pressed && uiStyles.pressed]}>{content}</Pressable> : <View style={[style, featured && uiStyles.contextFeatured]}>{content}</View>;
}

export function ScenicBanner({ variant = 'morning' }: { variant?: 'morning' | 'goal' | 'strength' }) {
  if (variant === 'strength') return <StrengthScene />;
  return <View style={[sceneStyles.scene, variant === 'goal' && sceneStyles.goalScene]} accessibilityElementsHidden>
    <View style={sceneStyles.sun} /><View style={[sceneStyles.cloud, sceneStyles.cloudOne]} /><View style={[sceneStyles.cloud, sceneStyles.cloudTwo]} />
    <View style={[sceneStyles.mountain, sceneStyles.mountainBack]} /><View style={[sceneStyles.mountain, sceneStyles.mountainFront]} /><View style={sceneStyles.path} />
    <Tree left="5%" bottom={5} scale={0.72} /><Tree left="13%" bottom={0} scale={0.95} /><Tree left="76%" bottom={3} scale={0.82} /><Tree left="88%" bottom={-1} scale={1.0} />
    {variant === 'goal' ? <><View style={sceneStyles.flagPole} /><View style={sceneStyles.flag} /></> : null}
  </View>;
}

function StrengthScene() {
  return <View style={[sceneStyles.scene, sceneStyles.strengthScene]} accessibilityElementsHidden>
    <View style={sceneStyles.floor} />
    <View style={sceneStyles.plant}><View style={[sceneStyles.leaf, { transform: [{ rotate: '-30deg' }] }]} /><View style={[sceneStyles.leaf, { left: 8, transform: [{ rotate: '27deg' }] }]} /><View style={sceneStyles.plantPot} /></View>
    <View style={sceneStyles.bar}><View style={[sceneStyles.plate, sceneStyles.plateLeftOuter]} /><View style={[sceneStyles.plate, sceneStyles.plateLeftInner]} /><View style={[sceneStyles.plate, sceneStyles.plateRightInner]} /><View style={[sceneStyles.plate, sceneStyles.plateRightOuter]} /></View>
    <View style={sceneStyles.floorPlate}><View style={sceneStyles.floorPlateHole} /></View>
    <View style={sceneStyles.dumbbell}><View style={sceneStyles.dumbbellHandle} /><View style={[sceneStyles.dumbbellEnd, sceneStyles.dumbbellEndLeft]} /><View style={[sceneStyles.dumbbellEnd, sceneStyles.dumbbellEndRight]} /></View>
    <View style={sceneStyles.bench}><View style={sceneStyles.benchTop} /><View style={sceneStyles.benchLeg} /></View>
  </View>;
}

function Tree({ left, bottom, scale }: { left: `${number}%`; bottom: number; scale: number }) {
  return <View style={[sceneStyles.tree, { left, bottom, transform: [{ scale }] }]}><View style={sceneStyles.treeTop} /><View style={sceneStyles.treeMiddle} /><View style={sceneStyles.treeTrunk} /></View>;
}

export function GoalChoiceRow({ title, description, disciplines, selected, onPress }: { title: string; description: string; disciplines: Array<'swim' | 'bike' | 'run'>; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [uiStyles.goalRow, selected && uiStyles.goalRowSelected, pressed && uiStyles.pressed]}>
    <View style={uiStyles.disciplineColumn}><Text style={[uiStyles.disciplineGlyph, selected && uiStyles.goalTextSelected]}>{disciplines.includes('swim') ? '≈' : ''}</Text><Text style={[uiStyles.disciplineGlyph, selected && uiStyles.goalTextSelected]}>{disciplines.includes('bike') ? '◌' : disciplines.includes('run') ? '⌁' : ''}</Text></View>
    <View style={uiStyles.menuCopy}><Text style={[uiStyles.goalTitle, selected && uiStyles.goalTextSelected]}>{title}</Text><Text style={[uiStyles.goalDescription, selected && uiStyles.goalDescriptionSelected]} numberOfLines={2}>{description}</Text></View>
    {selected ? <View style={uiStyles.selectedCircle}><Text style={uiStyles.selectedCheck}>✓</Text></View> : <V22Icon name="chevron" color="#78837E" size={14} />}
  </Pressable>;
}

const headerStyles = StyleSheet.create({
  shell: { backgroundColor: v22.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#133A69' },
  leftCluster: { flexDirection: 'row', alignItems: 'center', flex: 1 }, wordmark: { width: 104, height: 28 },
  actionButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, backButton: { width: 32, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  backText: { color: v22.white, fontSize: 29, lineHeight: 29, fontWeight: '300' }, centerTitle: { color: v22.white, fontSize: 14, lineHeight: 18, fontWeight: '700' }, headerSpacer: { width: 32 },
});

function makeScreenStyles(_palette: AppPalette) { return StyleSheet.create({ screen: { flex: 1, backgroundColor: v22.canvas }, content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 96, gap: 14 } }); }

const uiStyles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, paddingHorizontal: 2 }, sectionLabel: { color: v22.forest, fontSize: 10.5, lineHeight: 14, fontWeight: '800', letterSpacing: 1.05 }, sectionDetail: { color: v22.muted, fontSize: 11.5, lineHeight: 15 },
  surface: { backgroundColor: v22.white, borderWidth: 1, borderColor: v22.lineStrong, borderRadius: 22, overflow: 'hidden' },
  surfaceElevated: { shadowColor: '#123129', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  menuGroup: { backgroundColor: v22.white, borderWidth: 1, borderColor: v22.lineStrong, borderRadius: 20, overflow: 'hidden', shadowColor: '#123129', shadowOpacity: 0.045, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  chip: { paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#DDEDE2', borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: '#CDE0D2' }, chipSky: { backgroundColor: '#E1F0F7', borderColor: '#CFE4EE' }, chipSand: { backgroundColor: '#F7ECD3', borderColor: '#EDDFC0' }, chipNeutral: { backgroundColor: '#EEF1EE', borderColor: '#DEE4DF' }, chipText: { color: v22.forest, fontSize: 10.5, lineHeight: 13, fontWeight: '700' },
  primaryButton: { minHeight: 48, paddingHorizontal: 17, borderRadius: 16, backgroundColor: v22.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: v22.navy, shadowOpacity: 0.14, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, primaryButtonText: { color: v22.white, fontSize: 15, lineHeight: 19, fontWeight: '800' },
  outlineButton: { minHeight: 48, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: v22.lineStrong, backgroundColor: v22.white, alignItems: 'center', justifyContent: 'center' }, outlineButtonText: { color: v22.navy, fontSize: 14.5, lineHeight: 18, fontWeight: '700' },
  menuRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E9E5', paddingVertical: 10, paddingHorizontal: 13, backgroundColor: v22.white }, menuRowLast: { borderBottomWidth: 0 }, menuIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: v22.surfaceSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: '#DFE5E0', alignItems: 'center', justifyContent: 'center' }, menuCopy: { flex: 1, minWidth: 0 }, menuTitle: { color: v22.ink, fontSize: 15.5, lineHeight: 20, fontWeight: '600' }, menuDetail: { color: v22.muted, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  contextCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: '#CADDD0', backgroundColor: '#E3F0E7', borderRadius: 22 }, contextFeatured: { shadowColor: '#123129', shadowOpacity: 0.09, shadowRadius: 11, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, contextSky: { backgroundColor: '#DDEEF7', borderColor: '#C8E1ED' }, contextBlush: { backgroundColor: '#FBE8DE', borderColor: '#F0CFC0' }, contextLilac: { backgroundColor: '#EDE3F4', borderColor: '#DDCDE8' }, contextSand: { backgroundColor: '#F8ECD5', borderColor: '#EAD9B7' },
  contextIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: v22.forest, alignItems: 'center', justifyContent: 'center' }, contextIconSky: { backgroundColor: v22.blue }, contextIconBlush: { backgroundColor: v22.red }, contextIconLilac: { backgroundColor: v22.purple }, contextIconSand: { backgroundColor: v22.orange }, contextCopy: { flex: 1, minWidth: 0 }, contextTitle: { color: v22.ink, fontSize: 15.5, lineHeight: 20, fontWeight: '700' }, contextBody: { color: v22.muted, fontSize: 12.5, lineHeight: 17.5, marginTop: 3 },
  goalRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: v22.lineStrong, borderRadius: 20, backgroundColor: v22.white, shadowColor: '#123129', shadowOpacity: 0.035, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }, goalRowSelected: { backgroundColor: v22.forest, borderColor: v22.forest, shadowOpacity: 0.12 }, disciplineColumn: { width: 27, alignItems: 'center' }, disciplineGlyph: { color: v22.navy, fontSize: 17, lineHeight: 17, fontWeight: '700' }, goalTitle: { color: v22.ink, fontSize: 15, lineHeight: 19, fontWeight: '700' }, goalDescription: { color: v22.muted, fontSize: 12.5, lineHeight: 17, marginTop: 2 }, goalTextSelected: { color: v22.white }, goalDescriptionSelected: { color: '#DBECE5' }, selectedCircle: { width: 21, height: 21, borderRadius: 11, backgroundColor: v22.white, alignItems: 'center', justifyContent: 'center' }, selectedCheck: { color: v22.forest, fontSize: 11, fontWeight: '800' }, pressed: { opacity: 0.7 },
});

const sceneStyles = StyleSheet.create({
  scene: { height: 104, borderRadius: 22, overflow: 'hidden', backgroundColor: v22.sand, position: 'relative', borderWidth: 1, borderColor: '#E9DEC8' }, goalScene: { height: 104, borderRadius: 0, marginHorizontal: -18 }, strengthScene: { height: 128, backgroundColor: '#F3F5F1', borderColor: '#DDE3DE' },
  sun: { position: 'absolute', width: 27, height: 27, borderRadius: 14, backgroundColor: '#F6D27B', left: '55%', top: 15 }, cloud: { position: 'absolute', height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.76)' }, cloudOne: { width: 46, left: '34%', top: 16 }, cloudTwo: { width: 34, left: '68%', top: 25 },
  mountain: { position: 'absolute', width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' }, mountainBack: { borderLeftWidth: 84, borderRightWidth: 84, borderBottomWidth: 57, borderBottomColor: '#D9E5D5', left: '24%', bottom: 12 }, mountainFront: { borderLeftWidth: 104, borderRightWidth: 104, borderBottomWidth: 65, borderBottomColor: '#C1D7C5', left: '47%', bottom: 1 }, path: { position: 'absolute', width: 146, height: 19, borderRadius: 14, backgroundColor: '#F6E5B9', left: '29%', bottom: -2, transform: [{ rotate: '-6deg' }] },
  tree: { position: 'absolute', width: 22, height: 50, alignItems: 'center' }, treeTop: { width: 0, height: 0, borderLeftWidth: 11, borderRightWidth: 11, borderBottomWidth: 24, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#4B7C61' }, treeMiddle: { width: 0, height: 0, borderLeftWidth: 14, borderRightWidth: 14, borderBottomWidth: 28, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#376C52', marginTop: -13 }, treeTrunk: { width: 4, height: 14, backgroundColor: '#7C684A', marginTop: -4 },
  flagPole: { position: 'absolute', right: 48, top: 11, width: 2, height: 30, backgroundColor: '#A47B3B' }, flag: { position: 'absolute', right: 36, top: 11, width: 13, height: 7, backgroundColor: '#E5983C', transform: [{ skewY: '-12deg' }] },
  floor: { position: 'absolute', left: 0, right: 0, height: 20, bottom: 0, backgroundColor: '#E8EAE6' }, bar: { position: 'absolute', width: 166, height: 4, borderRadius: 2, backgroundColor: '#485050', left: '29%', top: 39 }, plate: { position: 'absolute', top: -15, width: 13, height: 34, borderRadius: 4, backgroundColor: '#444D4D' }, plateLeftOuter: { left: -10 }, plateLeftInner: { left: 6, width: 7, height: 27, top: -11 }, plateRightInner: { right: 6, width: 7, height: 27, top: -11 }, plateRightOuter: { right: -10 },
  floorPlate: { position: 'absolute', left: '49%', bottom: 24, width: 36, height: 36, borderRadius: 18, borderWidth: 8, borderColor: '#355F50', opacity: 0.95 }, floorPlateHole: { flex: 1, margin: 5, borderRadius: 10, backgroundColor: '#F3F5F1' }, dumbbell: { position: 'absolute', left: '42%', bottom: 27, width: 62, height: 22, alignItems: 'center', justifyContent: 'center' }, dumbbellHandle: { width: 42, height: 6, borderRadius: 3, backgroundColor: '#6F7975' }, dumbbellEnd: { position: 'absolute', width: 12, height: 22, borderRadius: 4, backgroundColor: '#485050' }, dumbbellEndLeft: { left: 2 }, dumbbellEndRight: { right: 2 },
  bench: { position: 'absolute', right: 30, bottom: 21, width: 48, height: 34, alignItems: 'center' }, benchTop: { width: 47, height: 8, borderRadius: 3, backgroundColor: '#98A09D' }, benchLeg: { width: 4, height: 25, backgroundColor: '#7B8581' }, plant: { position: 'absolute', left: 22, bottom: 20, width: 28, height: 45 }, leaf: { position: 'absolute', top: 3, left: 1, width: 12, height: 24, borderRadius: 10, backgroundColor: '#B8CCB8' }, plantPot: { position: 'absolute', left: 4, bottom: 0, width: 21, height: 19, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, backgroundColor: '#B9B3A7' },
});
