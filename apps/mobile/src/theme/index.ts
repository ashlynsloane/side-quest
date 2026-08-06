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
    description: 'A clean white training workspace with navy identity and restrained mint accents.',
    personality: 'Retro · athletic · straightforward',
    light: {
      ...shared,
      canvas: '#F7F1E6', surface: '#FFFCF6', surfaceMuted: '#E9F1EC', ink: '#102B48', inkMuted: '#66756F', border: '#D9D3C7',
      forest: '#267C6B', forest2: '#102B48', mint: '#DCEDE7', moss: '#7B9A8D', lime: '#E8EECF', sand: '#F1E2C8', coral: '#D97755', tabBar: '#FFFCF6',
    },
    dark: {
      ...shared,
      canvas: '#0C1510', surface: '#18211B', surfaceMuted: '#263029', ink: '#F8F6F0', inkMuted: '#B2BDB5', border: '#3A4D42',
      forest: '#72C99B', forest2: '#9CDEB8', mint: '#203B2D', moss: '#6D917A', lime: '#B9D970', sand: '#34312B', coral: '#DF9172', tabBar: '#111B15',
    },
  },
  {
    id: 'trail',
    label: 'Trailhead',
    category: 'Run',
    sport: 'Forest trail running',
    description: 'Deep pine, trail-map gray, weathered blue, and a flash of rust.',
    personality: 'Woodsy · grounded · vintage',
    light: {
      ...shared,
      canvas: '#F5F3EE', surface: '#FFFEFB', surfaceMuted: '#EAE8DF', ink: '#183129', inkMuted: '#67716B', border: '#D9D4C9',
      forest: '#285B48', forest2: '#183C33', mint: '#DCE9E2', moss: '#718D76', lime: '#E1EDC5', sand: '#EFE8DB', coral: '#B95C3C', tabBar: '#FFFEFB',
    },
    dark: {
      ...shared,
      canvas: '#0A1711', surface: '#18221C', surfaceMuted: '#29342D', ink: '#F6F8F3', inkMuted: '#B6C1B9', border: '#486154',
      forest: '#82BED4', forest2: '#7BC29C', mint: '#263F47', moss: '#809B80', lime: '#CAD987', sand: '#34342E', coral: '#E07852', tabBar: '#121C16',
    },
  },
  {
    id: 'summit',
    label: 'Summit Run',
    category: 'Run',
    sport: 'Mountain trail running',
    description: 'Granite, alpine sky, snowfields, and a small hit of summit orange.',
    personality: 'High-country · crisp · adventurous',
    light: {
      ...shared,
      canvas: '#F2F4F7', surface: '#FFFFFF', surfaceMuted: '#E8ECF2', ink: '#202C42', inkMuted: '#687181', border: '#D3D9E2',
      forest: '#415C80', forest2: '#243B63', mint: '#DCE8F0', moss: '#8792AA', lime: '#E3EBC7', sand: '#F1ECE4', coral: '#D96B3F', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#10131C', surface: '#1B1F2A', surfaceMuted: '#292E3B', ink: '#F6F7FA', inkMuted: '#B8BDCA', border: '#4D5670',
      forest: '#A7B5EF', forest2: '#C1CBF5', mint: '#303B55', moss: '#858FAA', lime: '#C5D98A', sand: '#34343A', coral: '#F08054', tabBar: '#171B25',
    },
  },
  {
    id: 'race_day',
    label: 'Race Day',
    category: 'General',
    sport: 'Start lines + finish chutes',
    description: 'Timing mats, navy kits, signal orange, cool gray, and sharp white.',
    personality: 'Graphic · energetic · high contrast',
    light: {
      ...shared,
      canvas: '#F4F6F8', surface: '#FFFFFF', surfaceMuted: '#E8EDF1', ink: '#102A43', inkMuted: '#637482', border: '#D1DAE2',
      forest: '#0B3F6F', forest2: '#082E56', mint: '#DCEEEE', moss: '#7698A6', lime: '#E3EDC7', sand: '#F4E7D7', coral: '#EF6238', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#07131E', surface: '#102436', surfaceMuted: '#193248', ink: '#F6FAFC', inkMuted: '#AEC0CC', border: '#3B5D74',
      forest: '#74CED1', forest2: '#99E0E1', mint: '#1D4A50', moss: '#77A4AF', lime: '#C8E27D', sand: '#453626', coral: '#FF6D3D', tabBar: '#0B1B2A',
    },
  },
  {
    id: 'ocean',
    label: 'Open Water',
    category: 'Swim',
    sport: 'Ocean swimming',
    description: 'Deep water, sea glass, bright caps, and sunlit whitewater.',
    personality: 'Expansive · technical · alive',
    light: {
      ...shared,
      canvas: '#F1F7F9', surface: '#FFFFFF', surfaceMuted: '#E1F0F4', ink: '#103244', inkMuted: '#617781', border: '#C9DDE4',
      forest: '#0A6480', forest2: '#06435F', mint: '#D7EEF1', moss: '#5B9CAD', lime: '#E1F0CD', sand: '#F2ECE2', coral: '#EE715E', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#03151C', surface: '#092A35', surfaceMuted: '#103A46', ink: '#F2FBFC', inkMuted: '#A9C7CC', border: '#2D606B',
      forest: '#5CC7D3', forest2: '#87DBE3', mint: '#174854', moss: '#659DA6', lime: '#A9DB85', sand: '#403727', coral: '#FF886B', tabBar: '#06212B',
    },
  },
  {
    id: 'alpine',
    label: 'Alpine Lake',
    category: 'Swim',
    sport: 'Lake swimming',
    description: 'Clear lake teal, weathered docks, pale sky, and quiet morning light.',
    personality: 'Calm · clear · restorative',
    light: {
      ...shared,
      canvas: '#F3F7F5', surface: '#FFFFFF', surfaceMuted: '#E5EFEB', ink: '#193630', inkMuted: '#64766F', border: '#D0DDD7',
      forest: '#2B6D60', forest2: '#1D4E46', mint: '#DCECE6', moss: '#72917F', lime: '#E4EECF', sand: '#F1EDE4', coral: '#C9826B', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#0B1714', surface: '#18231F', surfaceMuted: '#28342F', ink: '#F5F8F5', inkMuted: '#B4C3BD', border: '#425C53',
      forest: '#87CCBC', forest2: '#A7DBCF', mint: '#294940', moss: '#78998A', lime: '#BAD78F', sand: '#353630', coral: '#D8957D', tabBar: '#121D19',
    },
  },
  {
    id: 'ember',
    label: 'Road Club',
    category: 'Bike',
    sport: 'Road cycling',
    description: 'Asphalt gray, vintage jerseys, roadside cream, and sunrise red.',
    personality: 'Fast · social · classic',
    light: {
      ...shared,
      canvas: '#F7F4F2', surface: '#FFFFFF', surfaceMuted: '#EEE9E6', ink: '#2D2729', inkMuted: '#71676A', border: '#DED5D2',
      forest: '#963A4E', forest2: '#692637', mint: '#E8E4E1', moss: '#7B8E89', lime: '#ECEBCF', sand: '#F3ECE5', coral: '#D85868', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#151315', surface: '#241D20', surfaceMuted: '#33292D', ink: '#FAF7F8', inkMuted: '#C4B7BB', border: '#58464E',
      forest: '#F07891', forest2: '#F99AAF', mint: '#3B3034', moss: '#8F7D83', lime: '#CDD67E', sand: '#383332', coral: '#FF6982', tabBar: '#1D181A',
    },
  },
  {
    id: 'indigo',
    label: 'Aero Lab',
    category: 'Bike',
    sport: 'TT + triathlon cycling',
    description: 'Carbon black, wind-tunnel navy, electric cyan, and cool silver.',
    personality: 'Precise · aerodynamic · focused',
    light: {
      ...shared,
      canvas: '#F2F5F8', surface: '#FFFFFF', surfaceMuted: '#E7ECF1', ink: '#111C2B', inkMuted: '#63717E', border: '#D1DAE3',
      forest: '#173A63', forest2: '#0A2444', mint: '#DCECF1', moss: '#667E91', lime: '#E3EFC8', sand: '#F0ECE6', coral: '#DF4F7D', tabBar: '#FFFFFF',
    },
    dark: {
      ...shared,
      canvas: '#050B11', surface: '#111A24', surfaceMuted: '#1B2935', ink: '#F5F8FA', inkMuted: '#ABB9C3', border: '#3B4B5B',
      forest: '#00C5DF', forest2: '#66DDEC', mint: '#163B47', moss: '#668E9B', lime: '#B7DC72', sand: '#30343A', coral: '#F15B91', tabBar: '#0B121A',
    },
  },
  {
    id: 'slate',
    label: 'Singletrack',
    category: 'Bike',
    sport: 'Mountain biking',
    description: 'Dirt, moss, trail dust, clay, and shaded evergreen.',
    personality: 'Rugged · playful · grounded',
    light: {
      ...shared,
      canvas: '#F5F3EF', surface: '#FFFEFB', surfaceMuted: '#EBE9E2', ink: '#2B3028', inkMuted: '#6D7469', border: '#D9D5CA',
      forest: '#8A4A34', forest2: '#35543A', mint: '#E9E1D8', moss: '#6F805C', lime: '#E6EBCB', sand: '#F1EBE2', coral: '#B85C3D', tabBar: '#FFFEFB',
    },
    dark: {
      ...shared,
      canvas: '#121510', surface: '#1E241D', surfaceMuted: '#2D352B', ink: '#F4F7F2', inkMuted: '#B8C1B5', border: '#4D5C48',
      forest: '#E18A63', forest2: '#93BF83', mint: '#49362D', moss: '#82936E', lime: '#CAD77E', sand: '#34342E', coral: '#D77B50', tabBar: '#181D17',
    },
  },
];

export const defaultTheme = themeDefinitions[0]!;
export const palette = defaultTheme.light;
export const brand = { navy: '#01234D', forest: '#153E2F', mint: '#A8E6CC', cream: '#FBF7EC' } as const;
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
  forest: { light: '#102B48', dark: '#071B31' },
  trail: { light: '#183C33', dark: '#0B241C' },
  summit: { light: '#243B63', dark: '#161E32' },
  race_day: { light: '#082E56', dark: '#061A2E' },
  ocean: { light: '#06435F', dark: '#042734' },
  alpine: { light: '#1D4E46', dark: '#0D2B26' },
  ember: { light: '#692637', dark: '#32151D' },
  indigo: { light: '#0A2444', dark: '#071525' },
  slate: { light: '#35543A', dark: '#1D2D20' },
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
  shadowColor: '#01234D', shadowOpacity: 0.04, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};
