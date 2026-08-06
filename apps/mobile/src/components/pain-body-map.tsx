import type { PainAreaSelection, RegionProtectionMode } from '@circuit/domain';
import { useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PAIN_AREAS, createPainAreaSelection, painAreaById, type PainBodyView } from '@/content/pain-areas';
import { useAuth } from '@/state/auth-context';
import { useTheme } from '@/state/theme-context';
import type { DesignTokens } from '@/theme';

const BODY_SIZE = { width: 248, height: 496 };
const PROTECTION_OPTIONS: Array<{ value: RegionProtectionMode; label: string; detail: string }> = [
  { value: 'direct_only', label: 'Avoid direct loading', detail: 'Keep unrelated movements available.' },
  { value: 'keep_light', label: 'Keep it light', detail: 'Avoid high loading and prefer easier variations.' },
  { value: 'avoid', label: 'Avoid this area', detail: 'Use the most conservative filter for today.' },
];

export function PainBodyMap({ selections, onChange }: { selections: PainAreaSelection[]; onChange: (next: PainAreaSelection[]) => void }) {
  const { tokens } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [view, setView] = useState<PainBodyView>('back');
  const [query, setQuery] = useState('');
  const selectedIds = useMemo(() => new Set(selections.map((selection) => selection.areaId)), [selections]);
  const visibleAreas = useMemo(() => PAIN_AREAS.filter((area) => area.view === view), [view]);
  const results = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return [];
    return PAIN_AREAS.filter((area) => `${area.label} ${area.shortLabel} ${area.plainLanguage} ${area.searchTerms.join(' ')}`.toLowerCase().includes(clean)).slice(0, 8);
  }, [query]);

  function toggleArea(areaId: string) {
    const area = painAreaById(areaId);
    if (!area) return;
    if (selectedIds.has(areaId)) onChange(selections.filter((selection) => selection.areaId !== areaId));
    else onChange([...selections, createPainAreaSelection(area)]);
  }

  function selectSearchResult(areaId: string) {
    const area = painAreaById(areaId);
    if (!area) return;
    setView(area.view);
    if (!selectedIds.has(areaId)) onChange([...selections, createPainAreaSelection(area)]);
    setQuery('');
  }

  function updateProtection(areaId: string, protection: RegionProtectionMode) {
    onChange(selections.map((selection) => selection.areaId === areaId ? { ...selection, protection } : selection));
  }

  return <View style={styles.wrapper}>
    <View style={styles.viewToggle}>
      {(['front', 'back'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: view === value }} onPress={() => setView(value)} style={[styles.viewButton, view === value && styles.viewButtonSelected]}>
        <Text style={[styles.viewButtonText, view === value && styles.viewButtonTextSelected]}>{value === 'front' ? 'Front' : 'Back'}</Text>
      </Pressable>)}
    </View>

    <Text style={styles.mapHint}>Tap the closest area. Pinch to zoom on iPhone, or search by a word such as “rhomboid,” “hip flexor,” or “Achilles.”</Text>

    <View style={styles.mapFrame}>
      <ScrollView
        contentContainerStyle={styles.zoomContent}
        maximumZoomScale={2.8}
        minimumZoomScale={1}
        bouncesZoom
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={styles.bodyCanvas}>
          <Image
            source={user?.anatomyFigure === 'man'
              ? (view === 'front' ? require('../../assets/anatomy-v3/man_average_front_base.png') : require('../../assets/anatomy-v3/man_average_back_base.png'))
              : (view === 'front' ? require('../../assets/anatomy-v3/woman_average_front_base.png') : require('../../assets/anatomy-v3/woman_average_back_base.png'))}
            resizeMode="contain"
            style={styles.bodyImage}
            accessibilityIgnoresInvertColors
          />
          {visibleAreas.map((area) => {
            const selected = selectedIds.has(area.id);
            return <Pressable
              key={area.id}
              accessibilityRole="button"
              accessibilityLabel={`${selected ? 'Remove' : 'Select'} ${area.label}`}
              accessibilityState={{ selected }}
              onPress={() => toggleArea(area.id)}
              hitSlop={3}
              style={[
                styles.hotspot,
                {
                  left: `${area.x}%`,
                  top: `${area.y}%`,
                  width: `${area.width}%`,
                  height: `${area.height}%`,
                },
                selected && styles.hotspotSelected,
              ]}
            />;
          })}
        </View>
      </ScrollView>
    </View>

    <View style={styles.searchWrap}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search an area in plain language"
        placeholderTextColor={tokens.textMuted}
        returnKeyType="search"
        style={styles.searchInput}
      />
      {results.length ? <View style={styles.searchResults}>{results.map((area, index) => <Pressable key={area.id} onPress={() => selectSearchResult(area.id)} style={[styles.searchResult, index === results.length - 1 && styles.searchResultLast]}>
        <View style={styles.searchCopy}><Text style={styles.searchTitle}>{area.label}</Text><Text style={styles.searchDetail}>{area.plainLanguage}</Text></View>
        <Text style={styles.searchSide}>{area.view === 'front' ? 'FRONT' : 'BACK'}</Text>
      </Pressable>)}</View> : null}
    </View>

    {selections.length ? <View style={styles.selectedList}>
      <Text style={styles.selectedHeading}>Selected areas</Text>
      {selections.map((selection) => {
        const area = painAreaById(selection.areaId);
        if (!area) return null;
        return <View key={selection.areaId} style={styles.selectionCard}>
          <View style={styles.selectionHeader}>
            <View style={styles.selectionCopy}><Text style={styles.selectionTitle}>{area.label}</Text><Text style={styles.selectionDetail}>{area.plainLanguage}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${area.label}`} onPress={() => toggleArea(area.id)} style={styles.removeButton}><Text style={styles.removeText}>Remove</Text></Pressable>
          </View>
          <Text style={styles.protectionLabel}>How should Side Quest handle it?</Text>
          <View style={styles.protectionList}>{PROTECTION_OPTIONS.map((option) => {
            const selected = selection.protection === option.value;
            return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => updateProtection(area.id, option.value)} style={[styles.protectionOption, selected && styles.protectionOptionSelected]}>
              <View style={[styles.radio, selected && styles.radioSelected]} />
              <View style={styles.protectionCopy}><Text style={styles.protectionTitle}>{option.label}</Text><Text style={styles.protectionDetail}>{option.detail}</Text></View>
            </Pressable>;
          })}</View>
        </View>;
      })}
    </View> : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No area selected</Text><Text style={styles.emptyBody}>The rest of the workout stays available until you identify an area or movement to protect.</Text></View>}

    {Platform.OS !== 'ios' ? <Text style={styles.platformNote}>Pinch zoom depends on the device. Search remains available on every platform.</Text> : null}
  </View>;
}

function makeStyles(tokens: DesignTokens) { return StyleSheet.create({
  wrapper: { gap: 12 },
  viewToggle: { flexDirection: 'row', alignSelf: 'center', gap: 6, backgroundColor: tokens.surfaceMuted, borderRadius: 999, padding: 4, borderWidth: 1, borderColor: tokens.border },
  viewButton: { minWidth: 92, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center' },
  viewButtonSelected: { backgroundColor: tokens.accent }, viewButtonText: { color: tokens.textMuted, fontSize: 14, fontWeight: '700' }, viewButtonTextSelected: { color: '#FFFFFF' },
  mapHint: { color: tokens.textMuted, fontSize: 13, lineHeight: 19 },
  mapFrame: { height: 520, borderRadius: 20, borderWidth: 1, borderColor: tokens.border, backgroundColor: tokens.surfaceMuted, overflow: 'hidden' },
  zoomContent: { minWidth: '100%', minHeight: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  bodyCanvas: { width: BODY_SIZE.width, height: BODY_SIZE.height, position: 'relative' }, bodyImage: { width: BODY_SIZE.width, height: BODY_SIZE.height },
  hotspot: { position: 'absolute', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(20,70,60,0.22)', backgroundColor: 'rgba(255,255,255,0.08)' },
  hotspotSelected: { borderWidth: 2, borderColor: tokens.accent, backgroundColor: tokens.isDark ? 'rgba(94,190,158,0.56)' : 'rgba(39,139,106,0.42)' },
  searchWrap: { gap: 0 }, searchInput: { minHeight: 48, borderWidth: 1, borderColor: tokens.border, borderRadius: 15, paddingHorizontal: 14, color: tokens.text, backgroundColor: tokens.surface, fontSize: 15 },
  searchResults: { marginTop: 7, borderWidth: 1, borderColor: tokens.border, borderRadius: 16, backgroundColor: tokens.surface, overflow: 'hidden' },
  searchResult: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.border }, searchResultLast: { borderBottomWidth: 0 },
  searchCopy: { flex: 1 }, searchTitle: { color: tokens.text, fontSize: 14.5, fontWeight: '700' }, searchDetail: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 2 }, searchSide: { color: tokens.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  selectedList: { gap: 10 }, selectedHeading: { color: tokens.text, fontSize: 16, fontWeight: '800' }, selectionCard: { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.border, borderRadius: 18, padding: 14, gap: 12 },
  selectionHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, selectionCopy: { flex: 1 }, selectionTitle: { color: tokens.text, fontSize: 16, lineHeight: 21, fontWeight: '800' }, selectionDetail: { color: tokens.textMuted, fontSize: 13, lineHeight: 18, marginTop: 2 }, removeButton: { paddingVertical: 4, paddingLeft: 8 }, removeText: { color: '#A04444', fontSize: 12.5, fontWeight: '700' },
  protectionLabel: { color: tokens.text, fontSize: 13, fontWeight: '700' }, protectionList: { gap: 7 }, protectionOption: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: tokens.border, borderRadius: 14, padding: 11, backgroundColor: tokens.surface }, protectionOptionSelected: { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }, radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: tokens.border, backgroundColor: tokens.surface }, radioSelected: { borderWidth: 6, borderColor: tokens.accent }, protectionCopy: { flex: 1 }, protectionTitle: { color: tokens.text, fontSize: 13.5, fontWeight: '700' }, protectionDetail: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, marginTop: 1 },
  emptyCard: { backgroundColor: tokens.surfaceMuted, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: tokens.border }, emptyTitle: { color: tokens.text, fontSize: 14.5, fontWeight: '700' }, emptyBody: { color: tokens.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  platformNote: { color: tokens.textMuted, fontSize: 11.5, lineHeight: 16 },
}); }
