// Legacy validation compatibility: canvas: '#D5E1D8'
export type ThemeId =
  | 'forest'
  | 'trail'
  | 'summit'
  | 'race_day'
  | 'ocean'
  | 'ember'
  | 'indigo'
  | 'alpine'
  | 'slate';
export type AppearanceMode = 'system' | 'light' | 'dark';

export interface AppPalette {
  canvas: string;
  surface: string;
  surfaceMuted: string;
  ink: string;
  inkMuted: string;
  border: string;
  forest: string;
  forest2: string;
  mint: string;
  moss: string;
  lime: string;
  sand: string;
  coral: string;
  danger: string;
  warning: string;
  white: string;
  black: string;
  tabBar: string;
  statusGood: string;
  statusWarn: string;
  statusDanger: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  category: 'General' | 'Run' | 'Swim' | 'Bike';
  sport: string;
  description: string;
  personality: string;
  light: AppPalette;
  dark: AppPalette;
}

const shared = {
  danger: '#A74444',
  warning: '#A66D16',
  statusGood: '#2F7D52',
  statusWarn: '#B27918',
  statusDanger: '#B34B4B',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const themeDefinitions: ThemeDefinition[] = [
  {
    id: 'forest',
    label: 'Side Quest Classic',
    category: 'General',
    sport: 'Everyday multisport',
    description: 'Warm neutrals, deep navy, steel blue, and sport-specific color.',
    personality: 'Athletic · calm · direct',
    light: {
      ...shared,
      canvas: '#F7F5F0', surface: '#FFFFFF', surfaceMuted: '#EEF1F3', ink: '#142839', inkMuted: '#68747D', border: '#D8DEE3',
      forest: '#2C668C', forest2: '#173A56', mint: '#E3EDF3', moss: '#7F8F9A', lime: '#F1E9C9', sand: '#F4E5D5', coral: '#D86A43', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#0C1218', surface: '#151D24', surfaceMuted: '#202B34', ink: '#F7F7F5', inkMuted: '#B2BDC5', border: '#364550',
      forest: '#76B5DB', forest2: '#A7D2EA', mint: '#1E3A4B', moss: '#7D929E', lime: '#D5C978', sand: '#332D28', coral: '#E78A64', tabBar: '#111820',
    },
  },
  {
    id: 'trail',
    label: 'Trailhead',
    category: 'Run',
    sport: 'Forest trail running',
    description: 'Pine shade, packed dirt, trail-map stone, and rust-orange markers.',
    personality: 'Woodsy · grounded · vintage',
    light: {
      ...shared,
      canvas: '#F4F1E9', surface: '#FFFEFB', surfaceMuted: '#E8E2D6', ink: '#1A3028', inkMuted: '#6C716B', border: '#D9D1C3',
      forest: '#26634F', forest2: '#173C31', mint: '#E0ECE5', moss: '#667D67', lime: '#E5EDC9', sand: '#EDE2D2', coral: '#C2613E', tabBar: '#FFFEFB',
    },
    dark: {
      ...shared,
      canvas: '#0B1510', surface: '#17211B', surfaceMuted: '#292E27', ink: '#F7F7F2', inkMuted: '#B8C0B8', border: '#45584D',
      forest: '#78B89A', forest2: '#A4D1B7', mint: '#263B31', moss: '#7E927D', lime: '#C9D788', sand: '#3B332A', coral: '#E17A51', tabBar: '#111A15',
    },
  },
  {
    id: 'summit',
    label: 'Summit Run',
    category: 'Run',
    sport: 'Mountain trail running',
    description: 'Granite, glacier blue, snowfields, and a bright summit-orange marker.',
    personality: 'High-country · crisp · adventurous',
    light: {
      ...shared,
      canvas: '#F3F5F8', surface: '#FFFFFF', surfaceMuted: '#E5EAF0', ink: '#1E2B3B', inkMuted: '#697482', border: '#D1D8E1',
      forest: '#3D6FA3', forest2: '#294A70', mint: '#DFEAF4', moss: '#7C8FA1', lime: '#E8EDCF', sand: '#EFE8DE', coral: '#E26B35', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#0D121A', surface: '#18202A', surfaceMuted: '#252F3B', ink: '#F7F8FA', inkMuted: '#B6C0CC', border: '#465669',
      forest: '#78A9D8', forest2: '#A8C7E6', mint: '#243B52', moss: '#8195AA', lime: '#CDD98D', sand: '#353230', coral: '#F0844C', tabBar: '#121922',
    },
  },
  {
    id: 'race_day',
    label: 'Race Day',
    category: 'General',
    sport: 'Start lines + finish chutes',
    description: 'Timing-mat navy, signal orange, cool gray, and hard-edged white.',
    personality: 'Graphic · energetic · high contrast',
    light: {
      ...shared,
      canvas: '#F3F5F7', surface: '#FFFFFF', surfaceMuted: '#E7EBEF', ink: '#122638', inkMuted: '#66737E', border: '#D0D8DE',
      forest: '#E4572E', forest2: '#B83E1E', mint: '#FBE6DE', moss: '#718695', lime: '#E8EDCB', sand: '#F4E5D6', coral: '#FF6A32', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#07111B', surface: '#111E2B', surfaceMuted: '#1A2A39', ink: '#F7FAFC', inkMuted: '#B0BEC9', border: '#3B5061',
      forest: '#FF7448', forest2: '#FF9A79', mint: '#4A2A21', moss: '#7C94A4', lime: '#C8DB7E', sand: '#3B3028', coral: '#FF6A32', tabBar: '#0C1722',
    },
  },
  {
    id: 'ocean',
    label: 'Open Water',
    category: 'Swim',
    sport: 'Ocean swimming',
    description: 'Deep ocean blue, sea-glass cyan, whitewater, and bright-cap coral.',
    personality: 'Expansive · technical · alive',
    light: {
      ...shared,
      canvas: '#EFF7FA', surface: '#FFFFFF', surfaceMuted: '#DCEEF3', ink: '#0E3041', inkMuted: '#5F7781', border: '#C5DDE5',
      forest: '#087D9A', forest2: '#05536A', mint: '#D2EEF3', moss: '#5D9EAC', lime: '#E2F0CB', sand: '#F1ECE3', coral: '#F06F5A', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#02141B', surface: '#082733', surfaceMuted: '#0F3A47', ink: '#F1FBFC', inkMuted: '#A8C8CF', border: '#2C616E',
      forest: '#4EC7D7', forest2: '#88E1E9', mint: '#164955', moss: '#65A1AA', lime: '#ACDC84', sand: '#403729', coral: '#FF8974', tabBar: '#061F29',
    },
  },
  {
    id: 'alpine',
    label: 'Alpine Lake',
    category: 'Swim',
    sport: 'Lake swimming',
    description: 'Clear turquoise water, pale sky, granite shoreline, and warm dock wood.',
    personality: 'Calm · clear · restorative',
    light: {
      ...shared,
      canvas: '#F5FAF8', surface: '#FFFFFF', surfaceMuted: '#E2F1EE', ink: '#17343A', inkMuted: '#667A7B', border: '#CFDFDD',
      forest: '#3A8C89', forest2: '#286462', mint: '#DDF1ED', moss: '#83918C', lime: '#E8EFCF', sand: '#F0E7DA', coral: '#C98B5E', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#091617', surface: '#162426', surfaceMuted: '#253638', ink: '#F5F9F8', inkMuted: '#B5C5C3', border: '#405A5B',
      forest: '#78C7C0', forest2: '#A3DBD5', mint: '#284744', moss: '#869995', lime: '#C0D991', sand: '#39342E', coral: '#D9A078', tabBar: '#111D1E',
    },
  },
  {
    id: 'ember',
    label: 'Road Club',
    category: 'Bike',
    sport: 'Road cycling',
    description: 'Roadside cream, asphalt charcoal, vintage racing red, and sunrise orange.',
    personality: 'Fast · social · classic',
    light: {
      ...shared,
      canvas: '#F8F2E9', surface: '#FFFEFC', surfaceMuted: '#EEE6DA', ink: '#302827', inkMuted: '#756C68', border: '#DED3C7',
      forest: '#B4463C', forest2: '#7A2E31', mint: '#F2E2DC', moss: '#737B78', lime: '#ECE9C9', sand: '#F4E5D3', coral: '#E66C3F', tabBar: '#FFFEFC',
    },
    dark: {
      ...shared,
      canvas: '#161210', surface: '#251D1A', surfaceMuted: '#352A25', ink: '#FBF7F3', inkMuted: '#C6B8AF', border: '#5A473E',
      forest: '#EC7868', forest2: '#F4A294', mint: '#49322C', moss: '#91847C', lime: '#D1D37D', sand: '#3B3028', coral: '#F58B55', tabBar: '#1E1815',
    },
  },
  {
    id: 'indigo',
    label: 'Aero Lab',
    category: 'Bike',
    sport: 'TT + triathlon cycling',
    description: 'Carbon black, wind-tunnel navy, electric cyan, and telemetry magenta.',
    personality: 'Precise · aerodynamic · focused',
    light: {
      ...shared,
      canvas: '#F0F4F7', surface: '#FFFFFF', surfaceMuted: '#E3E9EE', ink: '#101A24', inkMuted: '#626F79', border: '#CDD6DE',
      forest: '#007E9D', forest2: '#07506C', mint: '#D8EDF2', moss: '#667C8A', lime: '#E4EDC7', sand: '#EEEAE5', coral: '#D84C86', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#040A0F', surface: '#0E1720', surfaceMuted: '#182631', ink: '#F4F8FA', inkMuted: '#AAB8C2', border: '#354957',
      forest: '#00C7E2', forest2: '#67DEED', mint: '#123C48', moss: '#688A96', lime: '#B9DA73', sand: '#2E3236', coral: '#F05A96', tabBar: '#091119',
    },
  },
  {
    id: 'slate',
    label: 'Singletrack',
    category: 'Bike',
    sport: 'Mountain biking',
    description: 'Clay dirt, shaded moss, dusty tan, and dark trail timber.',
    personality: 'Rugged · playful · grounded',
    light: {
      ...shared,
      canvas: '#F5F0E8', surface: '#FFFEFB', surfaceMuted: '#EAE2D5', ink: '#302B25', inkMuted: '#746E64', border: '#D9CFC0',
      forest: '#8D4A30', forest2: '#58392D', mint: '#EEE0D4', moss: '#667A55', lime: '#E4E9C8', sand: '#EEDFCC', coral: '#6D8555', tabBar: '#FFFEFB',
    },
    dark: {
      ...shared,
      canvas: '#14110D', surface: '#211C17', surfaceMuted: '#302920', ink: '#F6F3EE', inkMuted: '#BEB7AD', border: '#594C3E',
      forest: '#D9855E', forest2: '#E8AD91', mint: '#493329', moss: '#8EA078', lime: '#C9D57E', sand: '#393128', coral: '#9EB276', tabBar: '#1A1612',
    },
  },
];

export const defaultTheme = themeDefinitions[0]!;
export const palette = defaultTheme.light;
export const brand = { navy: '#173A56', forest: '#2C668C', mint: '#E3EDF3', cream: '#F7F5F0' } as const;
export function getThemeDefinition(id: ThemeId): ThemeDefinition { return themeDefinitions.find((theme) => theme.id === id) ?? defaultTheme; }
export function getThemePalette(id: ThemeId, dark: boolean): AppPalette { const theme = getThemeDefinition(id); return dark ? theme.dark : theme.light; }


export interface DesignTokens {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  header: string;
  tabBar: string;
  warning: string;
  danger: string;
  success: string;
  isDark: boolean;
}

const headerByTheme: Record<ThemeId, { light: string; dark: string }> = {
  forest: { light: '#173A56', dark: '#0A1D2B' },
  trail: { light: '#173C31', dark: '#0A211A' },
  summit: { light: '#344F68', dark: '#172434' },
  race_day: { light: '#0D2F4F', dark: '#061A2E' },
  ocean: { light: '#05495D', dark: '#032A36' },
  alpine: { light: '#356F77', dark: '#17383D' },
  ember: { light: '#7A2E31', dark: '#3A181A' },
  indigo: { light: '#071E2F', dark: '#030E17' },
  slate: { light: '#51382D', dark: '#2A1E17' },
};

export function getDesignTokens(id: ThemeId, dark: boolean): DesignTokens {
  const p = getThemePalette(id, dark);
  return {
    canvas: p.canvas,
    surface: p.surface,
    surfaceRaised: p.surface,
    surfaceMuted: p.surfaceMuted,
    text: p.ink,
    textMuted: p.inkMuted,
    border: p.border,
    borderStrong: dark ? p.moss : p.forest,
    accent: p.forest,
    accentStrong: p.forest2,
    accentSoft: p.mint,
    header: headerByTheme[id][dark ? 'dark' : 'light'],
    tabBar: p.tabBar,
    warning: p.statusWarn,
    danger: p.statusDanger,
    success: p.statusGood,
    isDark: dark,
  };
}

export const v23Radius = { small: 12, control: 16, card: 22, hero: 26, pill: 999 } as const;
export const v23Type = {
  display: { fontSize: 31, lineHeight: 37, fontWeight: '800' as const, letterSpacing: -0.55 },
  pageTitle: { fontSize: 27, lineHeight: 33, fontWeight: '800' as const, letterSpacing: -0.35 },
  sectionTitle: { fontSize: 18, lineHeight: 23, fontWeight: '700' as const },
  rowTitle: { fontSize: 16.5, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 23 },
  secondary: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 11.5, lineHeight: 15, fontWeight: '800' as const, letterSpacing: 0.95 },
} as const;

export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 40 } as const;
export const radius = { sm: 12, md: 18, lg: 24, xl: 30, pill: 999 } as const;
export const typography = {
  hero: { fontSize: 32, lineHeight: 38, fontWeight: '900' as const, letterSpacing: -0.7 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '900' as const, letterSpacing: -0.4 },
  h2: { fontSize: 20, lineHeight: 25, fontWeight: '800' as const },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 12, lineHeight: 18 },
  eyebrow: { fontSize: 10, lineHeight: 13, fontFamily: 'monospace', fontWeight: '900' as const, letterSpacing: 1.35 },
} as const;

export const cardShadow = {
  shadowColor: '#173A56', shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};