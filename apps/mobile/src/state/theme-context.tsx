import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useAuth } from '@/state/auth-context';
import {
  getDesignTokens,
  getThemePalette,
  type AppPalette,
  type AppearanceMode,
  type DesignTokens,
  type ThemeId,
} from '@/theme';

interface ThemePreview {
  themeId: ThemeId;
  appearance: AppearanceMode;
}

interface ThemeContextValue {
  themeId: ThemeId;
  appearance: AppearanceMode;
  isDark: boolean;
  palette: AppPalette;
  tokens: DesignTokens;
  previewing: boolean;
  previewTheme(themeId: ThemeId, appearance?: AppearanceMode): void;
  clearPreview(): void;
  applyTheme(themeId: ThemeId, appearance: AppearanceMode): Promise<void>;
}

interface ThemeMigrationStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const CLASSIC_THEME_ID: ThemeId = 'forest';
const CLASSIC_THEME_MIGRATION_VERSION = 'neutral-navy-v1';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function migrationStore(): ThemeMigrationStore | null {
  return (globalThis as typeof globalThis & { localStorage?: ThemeMigrationStore }).localStorage ?? null;
}

function migrationKey(userId: string): string {
  return `circuit.theme-migration.${CLASSIC_THEME_MIGRATION_VERSION}.${userId}`;
}

function needsClassicThemeMigration(userId?: string): boolean {
  if (!userId) return false;
  try {
    return migrationStore()?.getItem(migrationKey(userId)) !== 'done';
  } catch {
    return false;
  }
}

function markClassicThemeMigration(userId: string): void {
  try {
    migrationStore()?.setItem(migrationKey(userId), 'done');
  } catch {
    // Theme migration is cosmetic; storage failure must never block the app.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, updateProfile } = useAuth();
  const systemScheme = useColorScheme();
  const [preview, setPreview] = useState<ThemePreview | null>(null);
  const migrateToClassic = needsClassicThemeMigration(user?.id);
  const savedTheme = migrateToClassic ? CLASSIC_THEME_ID : user?.themeId ?? CLASSIC_THEME_ID;
  const savedAppearance = user?.appearance ?? 'system';
  const themeId = preview?.themeId ?? savedTheme;
  const appearance = preview?.appearance ?? savedAppearance;
  const isDark = appearance === 'dark' || (appearance === 'system' && systemScheme === 'dark');
  const palette = useMemo(() => getThemePalette(themeId, isDark), [themeId, isDark]);
  const tokens = useMemo(() => getDesignTokens(themeId, isDark), [themeId, isDark]);

  useEffect(() => {
    if (!user || !migrateToClassic) return;
    // Existing beta profiles may still point at an older green environment.
    // Render Classic immediately, persist it once, then respect future user choices.
    markClassicThemeMigration(user.id);
    void updateProfile({ themeId: CLASSIC_THEME_ID }).catch(() => undefined);
  }, [migrateToClassic, updateProfile, user]);

  const previewTheme = useCallback((nextTheme: ThemeId, nextAppearance?: AppearanceMode) => {
    setPreview({ themeId: nextTheme, appearance: nextAppearance ?? appearance });
  }, [appearance]);
  const clearPreview = useCallback(() => setPreview(null), []);
  const applyTheme = useCallback(async (nextTheme: ThemeId, nextAppearance: AppearanceMode) => {
    await updateProfile({ themeId: nextTheme, appearance: nextAppearance });
    setPreview(null);
  }, [updateProfile]);

  const value = useMemo<ThemeContextValue>(() => ({
    themeId,
    appearance,
    isDark,
    palette,
    tokens,
    previewing: Boolean(preview),
    previewTheme,
    clearPreview,
    applyTheme,
  }), [themeId, appearance, isDark, palette, tokens, preview, previewTheme, clearPreview, applyTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider.');
  return value;
}
