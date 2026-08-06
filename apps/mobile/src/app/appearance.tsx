import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScreen, SectionTitle, Surface } from '@/components/v12-ui';
import { useTheme } from '@/state/theme-context';
import { getDesignTokens, getThemeDefinition, themeDefinitions, type AppearanceMode, type ThemeId } from '@/theme';

const categoryOrder = ['General', 'Run', 'Swim', 'Bike'] as const;

export default function AppearanceScreen() {
  const router = useRouter();
  const { tokens, themeId, appearance, previewTheme, clearPreview, applyTheme, isDark } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(themeId);
  const [selectedAppearance, setSelectedAppearance] = useState<AppearanceMode>(appearance);
  const [saved, setSaved] = useState(false);
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const definition = getThemeDefinition(selectedTheme);
  const previewTokens = getDesignTokens(selectedTheme, isDark);

  useEffect(() => () => clearPreview(), [clearPreview]);

  function chooseTheme(id: ThemeId) { setSelectedTheme(id); setSaved(false); previewTheme(id, selectedAppearance); }
  function chooseAppearance(mode: AppearanceMode) { setSelectedAppearance(mode); setSaved(false); previewTheme(selectedTheme, mode); }
  async function apply() { await applyTheme(selectedTheme, selectedAppearance); setSaved(true); }

  return <AppScreen eyebrow="APPEARANCE" title="Choose a training environment" subtitle="The environment changes the canvas, header, accents, cards, and selected states throughout Side Quest. Safety and review colors stay consistent.">
    <Surface style={styles.preview}>
      <View style={styles.previewHeader}><View style={styles.previewCopy}><Text style={styles.previewLabel}>Preview</Text><Text style={styles.previewTitle}>{definition.label}</Text><Text style={styles.previewBody}>{definition.sport}</Text></View><View style={[styles.modeBadge, { backgroundColor: previewTokens.surfaceMuted }]}><Text style={[styles.modeBadgeText, { color: previewTokens.text }]}>{isDark ? 'Dark' : 'Light'}</Text></View></View>
      <View style={[styles.previewCanvas, { backgroundColor: previewTokens.canvas }]}>
        <View style={[styles.previewHeaderBar, { backgroundColor: previewTokens.header }]} />
        <View style={[styles.previewCard, { backgroundColor: previewTokens.surface, borderColor: previewTokens.border }]}><View style={[styles.previewAccent, { backgroundColor: previewTokens.accent }]} /><View style={styles.previewLines}><View style={[styles.previewLineStrong, { backgroundColor: previewTokens.text }]} /><View style={[styles.previewLine, { backgroundColor: previewTokens.textMuted }]} /></View></View>
        <View style={[styles.previewCard, styles.previewCardSmall, { backgroundColor: previewTokens.accentSoft, borderColor: previewTokens.border }]} />
      </View>
    </Surface>

    <SectionTitle detail="Tap to preview">Training environment</SectionTitle>
    <View style={styles.themeGrid}>{categoryOrder.map((category) => <View key={category} style={styles.themeGroup}>
      <Text style={styles.themeGroupLabel}>{category}</Text>
      <View style={styles.themeGroupCards}>{themeDefinitions.filter((theme) => theme.category === category).map((theme) => {
        const selected = theme.id === selectedTheme;
        return <Pressable key={theme.id} onPress={() => chooseTheme(theme.id)} style={[styles.themeCard, selected && styles.themeCardSelected]}>
          <View style={styles.roleSwatches}>{([
            ['ACTION', theme.light.forest],
            ['CANVAS', theme.light.canvas],
            ['CARD', theme.light.surface],
            ['ACCENT', theme.light.coral],
          ] as const).map(([role, color]) => <View key={`${theme.id}-${role}`} style={styles.roleSwatchRow}><View style={[styles.roleSwatch, { backgroundColor: color }]} /><Text style={styles.roleLabel}>{role}</Text></View>)}</View>
          <View style={styles.themeCopy}><Text style={styles.themeName}>{theme.label}</Text><Text style={styles.themeSport}>{theme.sport}</Text><Text style={styles.themeDescription}>{theme.description}</Text></View>
          <View style={[styles.selection, selected && styles.selectionActive]}>{selected ? <Text style={styles.selectionText}>✓</Text> : null}</View>
        </Pressable>;
      })}</View>
    </View>)}</View>

    <SectionTitle>Appearance mode</SectionTitle>
    <View style={styles.modeRow}>{(['system','light','dark'] as const).map((mode) => <Pressable key={mode} onPress={() => chooseAppearance(mode)} style={[styles.modeButton, selectedAppearance === mode && styles.modeButtonSelected]}><Text style={[styles.modeText, selectedAppearance === mode && styles.modeTextSelected]}>{mode === 'system' ? 'Follow phone' : mode[0]!.toUpperCase() + mode.slice(1)}</Text></Pressable>)}</View>
    <Text style={styles.note}>Accent appears in hero underlines and small highlights. The environment changes the interface roles shown above; warning, injury, and review meanings do not change.</Text>

    <View style={styles.actions}><Pressable onPress={() => { clearPreview(); router.back(); }} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable><Pressable onPress={() => void apply()} style={styles.primary}><Text style={styles.primaryText}>{saved ? 'Applied' : 'Apply environment'}</Text></Pressable></View>
  </AppScreen>;
}

function makeStyles(tokens: ReturnType<typeof useTheme>['tokens']) { return StyleSheet.create({
  preview: { gap: 14 }, previewHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, previewCopy: { flex: 1 }, previewLabel: { color: tokens.accent, fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }, previewTitle: { color: tokens.text, fontSize: 20, lineHeight: 25, fontWeight: '800', marginTop: 3 }, previewBody: { color: tokens.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }, modeBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, modeBadgeText: { fontSize: 11, fontWeight: '800' },
  previewCanvas: { height: 150, borderRadius: 18, borderWidth: 1, borderColor: tokens.border, overflow: 'hidden', padding: 13, paddingTop: 28, gap: 10 }, previewHeaderBar: { position: 'absolute', left: 0, right: 0, top: 0, height: 18 }, previewCard: { minHeight: 57, borderRadius: 15, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, previewCardSmall: { minHeight: 38, width: '70%' }, previewAccent: { width: 30, height: 30, borderRadius: 15 }, previewLines: { flex: 1, gap: 6 }, previewLineStrong: { height: 7, borderRadius: 4, width: '62%' }, previewLine: { height: 5, borderRadius: 3, width: '84%', opacity: 0.45 },
  themeGrid: { gap: 18 }, themeGroup: { gap: 8 }, themeGroupLabel: { color: tokens.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }, themeGroupCards: { gap: 9 }, themeCard: { minHeight: 112, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, borderRadius: 18, padding: 13, flexDirection: 'row', gap: 13, alignItems: 'center' }, themeCardSelected: { borderColor: tokens.accent, borderWidth: 2 }, roleSwatches: { width: 70, gap: 4 }, roleSwatchRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, roleSwatch: { width: 24, height: 15, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,.14)' }, roleLabel: { color: tokens.textMuted, fontSize: 7.5, lineHeight: 10, fontWeight: '800' }, themeCopy: { flex: 1, gap: 2 }, themeName: { color: tokens.text, fontSize: 16, lineHeight: 20, fontWeight: '800' }, themeSport: { color: tokens.accent, fontSize: 11.5, lineHeight: 15, fontWeight: '700' }, themeDescription: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 }, selection: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: tokens.border, alignItems: 'center', justifyContent: 'center' }, selectionActive: { backgroundColor: tokens.accent, borderColor: tokens.accent }, selectionText: { color: '#FFFFFF', fontWeight: '900' },
  modeRow: { flexDirection: 'row', gap: 8 }, modeButton: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: tokens.border, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface }, modeButtonSelected: { backgroundColor: tokens.accent, borderColor: tokens.accent }, modeText: { color: tokens.text, fontSize: 12, fontWeight: '800' }, modeTextSelected: { color: '#FFFFFF' }, note: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18 }, actions: { flexDirection: 'row', gap: 10 }, secondary: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: tokens.border, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.surface }, secondaryText: { color: tokens.text, fontWeight: '800' }, primary: { flex: 1, minHeight: 48, backgroundColor: tokens.header, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontWeight: '800' },
}); }
