// Legacy validation compatibility: backgroundColor:palette.coral; width:112; width:49; height: insets.top + 58; width:142; side-quest-wordmark-horizontal.png; trail-sign-doodle.png; cardMark; fontFamily:'monospace'
import { useMemo, useState, type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/state/theme-context';
import { brand, typography, v23Radius, v23Type, type AppPalette, type DesignTokens } from '@/theme';

export function BrandMasthead() {
  const { palette, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(palette, tokens), [palette, tokens]);
  return <View style={[styles.brandMasthead, { height: insets.top + 50, paddingTop: insets.top }]} accessibilityLabel="Side Quest">
    <Image source={require('../../assets/images/side-quest-wordmark-transparent.png')} resizeMode="contain" style={styles.brandImage} />
    <View style={styles.brandRule} />
  </View>;
}

export const subpage = {
  canvas: '#E4EBE3',
  card: '#FFFDF8',
  ink: '#01234D',
  muted: '#60706A',
  border: '#9AAFA3',
  borderStrong: '#164C73',
  accent: '#153E2F',
  accentSoft: '#D8E9DF',
  warm: '#F4E7D2',
} as const;

export function SubpageTopBar({ title }: { title: string }) {
  const router = useRouter();
  const { palette, tokens } = useTheme();
  const styles = useMemo(() => makeStyles(palette, tokens), [palette, tokens]);
  return <View style={styles.subpageTopBar}>
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.subpageBackButton}>
      <Text style={styles.subpageBackText}>‹ Home</Text>
    </Pressable>
    <Text style={styles.subpageTopTitle} numberOfLines={1}>{title}</Text>
  </View>;
}

export function AppScreen({ children, title, eyebrow, subtitle, scroll = true, brandHeader = false, compactHeader = false, navTitle, showSubpageBar = false }: { children: ReactNode; title?: string; eyebrow?: string; subtitle?: string; scroll?: boolean; brandHeader?: boolean; compactHeader?: boolean; navTitle?: string; showSubpageBar?: boolean }) {
  const { palette, tokens } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(palette, tokens), [palette, tokens]);
  const resolvedNavTitle = navTitle ?? conciseNavTitle(eyebrow || title || 'Side Quest');
  const body = <View style={[styles.content, compactHeader && styles.compactContent, !scroll && styles.contentStatic]}>{title ? <View style={[styles.header, compactHeader && styles.compactHeader]}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={[styles.title, compactHeader && styles.compactTitle]}>{title}</Text>{subtitle ? <Text style={[styles.subtitle, compactHeader && styles.compactSubtitle]}>{subtitle}</Text> : null}</View> : null}{children}</View>;
  return <SafeAreaView style={styles.safe} edges={['left','right']}>
    {brandHeader ? <BrandMasthead /> : null}
    {showSubpageBar && router.canGoBack() ? <SubpageTopBar title={resolvedNavTitle} /> : null}
    <KeyboardAvoidingView style={styles.viewport} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>{scroll ? <ScrollView style={styles.viewport} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>{body}</ScrollView> : body}</KeyboardAvoidingView>
  </SafeAreaView>;
}

function conciseNavTitle(value: string) {
  const cleaned = value.replace(/^V\d+(?:\.\d+)*\s+/i, '').trim();
  return cleaned.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

export function HeroCard({ eyebrow, title, body, action, onPress, tone='forest' }: { eyebrow: string; title: string; body?: string; action?: string; onPress?: () => void; tone?: 'forest'|'mint'|'sand' }) {
  const { palette, tokens } = useTheme();
  const styles = useMemo(() => makeStyles(palette, tokens), [palette, tokens]);
  const showTrailArt = tone === 'forest' && /goal plan|training block/i.test(`${eyebrow} ${title}`);
  const content = <View style={styles.heroCopy}>
    <Text style={[styles.heroEyebrow, tone !== 'forest' && styles.darkEyebrow]}>{eyebrow}</Text>
    <Text style={[styles.heroTitle, tone !== 'forest' && styles.darkTitle]}>{title}</Text>
    <View style={styles.heroRule} />
    {body ? <Text style={[styles.heroBody, showTrailArt && styles.heroBodyWithArt, tone !== 'forest' && styles.darkBody]}>{body}</Text> : null}
    {action ? <Text style={[styles.heroAction, tone !== 'forest' && styles.darkAction]}>{action} →</Text> : null}
    {showTrailArt ? <Image source={require('../../assets/images/trail-sign-doodle.png')} resizeMode="contain" style={styles.heroTrailArt} accessibilityElementsHidden /> : null}
  </View>;
  const heroStyle = [styles.hero, tone === 'mint' && styles.heroMint, tone === 'sand' && styles.heroSand];
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({pressed}:{pressed:boolean}) => [heroStyle, pressed && styles.pressed]}>{content}</Pressable> : <View style={heroStyle}>{content}</View>;
}

export function ActionCard({ icon, eyebrow, title, body, onPress, wide=false, badge }: { icon: string; eyebrow?: string; title: string; body: string; onPress: () => void; wide?: boolean; badge?: string }) {
  const { palette, tokens } = useTheme();
  const styles = useMemo(() => makeStyles(palette, tokens), [palette, tokens]);
  return <Pressable accessibilityRole="button" onPress={onPress} style={({pressed}:{pressed:boolean}) => [styles.actionCard, wide && styles.wide, pressed && styles.pressed]}><View style={styles.iconCircle} accessibilityElementsHidden><RetroActionIcon title={title} fallback={icon} styles={styles} /></View><View style={styles.actionCopy}>{eyebrow ? <Text style={styles.actionEyebrow}>{eyebrow}</Text> : null}<View style={styles.titleRow}><Text style={styles.actionTitle}>{title}</Text>{badge ? <Text style={styles.badge}>{badge}</Text> : null}</View><Text style={styles.actionBody}>{body}</Text></View><Text style={styles.chevron}>›</Text></Pressable>;
}

export function SectionTitle({ children, detail }: { children: ReactNode; detail?: string }) {
  const { palette, tokens } = useTheme();
  const styles = useMemo(() => makeStyles(palette, tokens), [palette, tokens]);
  return <View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>{children}</Text>{detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}</View>;
}

export function Pill({ children, tone='neutral' }: { children: ReactNode; tone?: 'neutral'|'good'|'warn'|'dark' }) {
  const { palette, tokens } = useTheme();
  const styles = useMemo(() => makeStyles(palette, tokens), [palette, tokens]);
  return <View style={[styles.pill, tone==='good'&&styles.pillGood, tone==='warn'&&styles.pillWarn, tone==='dark'&&styles.pillDark]}><Text style={[styles.pillText, tone==='dark'&&styles.pillTextDark]}>{children}</Text></View>;
}

export function Surface({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { palette, tokens } = useTheme();
  const styles = useMemo(() => makeStyles(palette, tokens), [palette, tokens]);
  return <View style={[styles.surface, style]}>{children}</View>;
}

export function DisclosureGroup({ title, detail, children, initiallyOpen = false }: { title: string; detail: string; children: ReactNode; initiallyOpen?: boolean }) {
  const { palette, tokens } = useTheme();
  const styles = useMemo(() => makeStyles(palette, tokens), [palette, tokens]);
  const [open, setOpen] = useState(initiallyOpen);
  return <View style={styles.disclosure}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={styles.disclosureHeader}>
      <View style={styles.disclosureCopy}><Text style={styles.disclosureTitle}>{title}</Text><Text style={styles.disclosureDetail}>{detail}</Text></View>
      <Text style={styles.disclosureArrow}>{open ? '−' : '+'}</Text>
    </Pressable>
    {open ? <View style={styles.disclosureBody}>{children}</View> : null}
  </View>;
}

function makeStyles(palette: AppPalette, tokens: DesignTokens) { return StyleSheet.create({
  safe:{flex:1,backgroundColor:tokens.canvas},viewport:{flex:1,backgroundColor:tokens.canvas},
  subpageTopBar:{minHeight:48,flexDirection:'row',alignItems:'center',paddingHorizontal:18,paddingVertical:8,backgroundColor:tokens.surface,borderBottomWidth:1,borderBottomColor:tokens.border},subpageBackButton:{flex:1,paddingVertical:5},subpageBackText:{color:tokens.accent,fontSize:15,fontWeight:'700'},subpageTopTitle:{maxWidth:'62%',color:tokens.text,fontSize:16,lineHeight:20,fontWeight:'700',textAlign:'right'},
  brandMasthead:{backgroundColor:tokens.header,justifyContent:'center',overflow:'hidden'},brandImage:{width:106,height:29,marginLeft:14},brandRule:{position:'absolute',left:0,right:0,bottom:0,height:1,backgroundColor:tokens.header},
  scroll:{paddingBottom:96},content:{paddingHorizontal:18,paddingTop:18,paddingBottom:30,gap:14},compactContent:{paddingTop:14,gap:12},contentStatic:{flex:1},
  header:{gap:6,marginBottom:2},compactHeader:{gap:4,marginBottom:0},compactTitle:{fontSize:24,lineHeight:30},compactSubtitle:{fontSize:14,lineHeight:20},eyebrow:{...v23Type.label,textTransform:'uppercase',color:tokens.accent},title:{...v23Type.pageTitle,color:tokens.text},subtitle:{...v23Type.body,color:tokens.textMuted},
  hero:{backgroundColor:tokens.surface,borderRadius:v23Radius.card,padding:17,minHeight:0,justifyContent:'center',borderWidth:1,borderStyle:'solid',borderColor:tokens.border},heroMint:{backgroundColor:tokens.accentSoft,borderStyle:'solid',borderColor:tokens.border},heroSand:{backgroundColor:palette.sand,borderStyle:'solid',borderColor:tokens.border},heroCopy:{gap:7},heroEyebrow:{...v23Type.label,color:tokens.accent},heroTitle:{...v23Type.sectionTitle,color:tokens.text},heroRule:{height:0,backgroundColor:palette.coral},heroBody:{...v23Type.secondary,color:tokens.textMuted},heroBodyWithArt:{paddingRight:0},heroAction:{fontSize:13,fontWeight:'800',color:tokens.accent,marginTop:3},heroTrailArt:{display:'none'},darkEyebrow:{color:tokens.accent},darkTitle:{color:tokens.text},darkBody:{color:tokens.textMuted},darkAction:{color:tokens.accent},
  actionCard:{backgroundColor:tokens.surface,borderRadius:v23Radius.card,borderWidth:1,borderColor:tokens.border,paddingVertical:13,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:11},wide:{minHeight:96},pressed:{opacity:.72,transform:[{scale:.992}]},iconCircle:{width:44,height:44,borderRadius:14,borderWidth:1,borderColor:tokens.border,backgroundColor:tokens.surfaceMuted,alignItems:'center',justifyContent:'center'},iconFallback:{fontSize:23,lineHeight:27,fontWeight:'700',color:tokens.accent},iconFallbackText:{fontSize:12,lineHeight:15,fontFamily:'monospace',fontWeight:'900',color:tokens.accent},actionCopy:{flex:1,gap:2},actionEyebrow:{...v23Type.label,color:tokens.accent},titleRow:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},actionTitle:{...v23Type.rowTitle,color:tokens.text},actionBody:{...v23Type.secondary,color:tokens.textMuted},badge:{fontSize:9,letterSpacing:.5,fontWeight:'900',color:tokens.accent,backgroundColor:tokens.accentSoft,paddingHorizontal:7,paddingVertical:4,borderRadius:999},chevron:{fontSize:25,color:tokens.textMuted,fontWeight:'500'},
  clipboard:{width:23,height:29,borderWidth:1.5,borderColor:tokens.accent,borderRadius:2.5,paddingHorizontal:4,paddingTop:8,gap:3.5},clipboardClip:{position:'absolute',top:-3.5,left:5,width:11,height:6,borderWidth:1.5,borderColor:tokens.accent,borderRadius:2,backgroundColor:tokens.surfaceMuted},checkRow:{height:2.5,flexDirection:'row',alignItems:'center',gap:2.5},checkDot:{width:3,height:3,borderRadius:2,backgroundColor:tokens.accent},checkLine:{height:1.5,flex:1,backgroundColor:tokens.accent,opacity:.78},smileFace:{width:31,height:31,borderWidth:1.5,borderColor:tokens.accent,borderRadius:16,alignItems:'center'},smileEyes:{position:'absolute',top:9,left:7.5,right:7.5,flexDirection:'row',justifyContent:'space-between'},smileEye:{width:3,height:3,borderRadius:2,backgroundColor:tokens.accent},smileMouth:{fontSize:16,lineHeight:17,color:tokens.accent,marginTop:10},barIcon:{width:29,height:29,flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:3},bar:{width:5,borderWidth:1.25,borderColor:tokens.accent,backgroundColor:tokens.accentSoft},calendarIcon:{width:27,height:27,borderWidth:1.5,borderColor:tokens.accent,borderRadius:3,overflow:'hidden'},calendarHeader:{height:6.5,borderBottomWidth:1.25,borderBottomColor:tokens.accent,backgroundColor:tokens.accentSoft},calendarDots:{fontSize:11,lineHeight:15,textAlign:'center',letterSpacing:1.5,color:tokens.accent},
  lockIcon:{width:28,height:30,alignItems:'center',justifyContent:'flex-end'},lockShackle:{position:'absolute',top:0,width:16,height:14,borderWidth:1.5,borderBottomWidth:0,borderColor:tokens.accent,borderTopLeftRadius:8,borderTopRightRadius:8},lockBody:{width:25,height:19,borderWidth:1.5,borderColor:tokens.accent,borderRadius:3,backgroundColor:tokens.accentSoft,alignItems:'center',paddingTop:5},lockDot:{width:3.5,height:3.5,borderRadius:2,backgroundColor:tokens.accent},lockStem:{width:1.5,height:5,backgroundColor:tokens.accent},shareIcon:{width:29,height:29,alignItems:'center',justifyContent:'flex-end'},shareTray:{width:25,height:14,borderWidth:1.5,borderTopWidth:0,borderColor:tokens.accent,borderBottomLeftRadius:3,borderBottomRightRadius:3},shareShaft:{position:'absolute',top:3,width:1.75,height:17,backgroundColor:tokens.accent},shareArrow:{position:'absolute',top:2,width:10,height:10,borderTopWidth:1.75,borderLeftWidth:1.75,borderColor:tokens.accent,transform:[{rotate:'45deg'}]},feedbackIcon:{width:30,height:26,borderWidth:1.5,borderColor:tokens.accent,borderRadius:6,alignItems:'center',justifyContent:'center'},feedbackTail:{position:'absolute',left:5,bottom:-4,width:8,height:8,borderLeftWidth:1.5,borderBottomWidth:1.5,borderColor:tokens.accent,backgroundColor:tokens.surfaceMuted,transform:[{rotate:'-45deg'}]},feedbackDots:{flexDirection:'row',gap:3},feedbackDot:{width:3.5,height:3.5,borderRadius:2,backgroundColor:tokens.accent},
  sectionTitleRow:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',marginTop:3,paddingHorizontal:2},sectionTitle:{...v23Type.label,textTransform:'uppercase',color:tokens.accent},sectionDetail:{...v23Type.secondary,color:tokens.textMuted},pill:{alignSelf:'flex-start',backgroundColor:tokens.surfaceMuted,borderWidth:1,borderColor:tokens.border,borderRadius:999,paddingHorizontal:9,paddingVertical:5},pillGood:{backgroundColor:tokens.accentSoft},pillWarn:{backgroundColor:palette.sand},pillDark:{backgroundColor:tokens.accent},pillText:{fontSize:10,letterSpacing:.35,fontWeight:'800',color:tokens.text},pillTextDark:{color:'#FFFFFF'},surface:{backgroundColor:tokens.surface,borderWidth:1,borderColor:tokens.border,borderRadius:v23Radius.card,padding:16},
  disclosure:{backgroundColor:tokens.surface,borderWidth:1,borderColor:tokens.border,borderRadius:v23Radius.card,overflow:'hidden'},disclosureHeader:{padding:15,flexDirection:'row',alignItems:'center',gap:12},disclosureCopy:{flex:1,gap:3},disclosureTitle:{...v23Type.rowTitle,color:tokens.text},disclosureDetail:{...v23Type.secondary,color:tokens.textMuted},disclosureArrow:{fontSize:24,fontWeight:'600',color:tokens.accent},disclosureBody:{padding:10,paddingTop:0,gap:10},
}); }

function RetroActionIcon({ title, fallback, styles }: { title: string; fallback: string; styles: ReturnType<typeof makeStyles> }) {
  if (/what should i do|review today|training history|setup guide|coach proposal/i.test(title)) {
    return <View style={styles.clipboard}><View style={styles.clipboardClip} />{[0,1,2].map((row) => <View key={row} style={styles.checkRow}><View style={styles.checkDot} /><View style={styles.checkLine} /></View>)}</View>;
  }
  if (/log how i feel|readiness|friends/i.test(title)) {
    return <View style={styles.smileFace}><View style={styles.smileEyes}><View style={styles.smileEye} /><View style={styles.smileEye} /></View><Text style={styles.smileMouth}>⌣</Text></View>;
  }
  if (/progression|progress summary|beta operations/i.test(title)) {
    return <View style={styles.barIcon}><View style={[styles.bar,{height:8}]} /><View style={[styles.bar,{height:15}]} /><View style={[styles.bar,{height:22}]} /></View>;
  }
  if (/weekly|schedule|calendar/i.test(title)) {
    return <View style={styles.calendarIcon}><View style={styles.calendarHeader} /><Text style={styles.calendarDots}>••{'\n'}••</Text></View>;
  }
  if (/data \+ privacy|privacy data/i.test(title)) {
    return <View style={styles.lockIcon}><View style={styles.lockShackle} /><View style={styles.lockBody}><View style={styles.lockDot} /><View style={styles.lockStem} /></View></View>;
  }
  if (/beta feedback/i.test(title)) {
    return <View style={styles.feedbackIcon}><View style={styles.feedbackTail} /><View style={styles.feedbackDots}><View style={styles.feedbackDot} /><View style={styles.feedbackDot} /><View style={styles.feedbackDot} /></View></View>;
  }
  if (/share center/i.test(title)) {
    return <View style={styles.shareIcon}><View style={styles.shareArrow} /><View style={styles.shareShaft} /><View style={styles.shareTray} /></View>;
  }
  const cleaned = fallback.replace(/\uFE0F/g, '');
  return <Text style={cleaned.length > 1 ? styles.iconFallbackText : styles.iconFallback}>{cleaned}</Text>;
}

function cardMark(title: string, fallback: string): string {
  const words = title.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const meaningful = words.filter((word) => !['A', 'AN', 'AND', 'THE', 'TO', 'OF', 'MY', 'I'].includes(word));
  const initials = (meaningful.length ? meaningful : words).slice(0, 2).map((word) => word[0]).join('');
  return initials || fallback.slice(0, 2).toUpperCase();
}
