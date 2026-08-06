import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
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

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, updateProfile } = useAuth();
  const systemScheme = useColorScheme();
  const [preview, setPreview] = useState<ThemePreview | null>(null);
  const savedTheme = user?.themeId ?? 'forest';
  const savedAppearance = user?.appearance ?? 'system';
  const themeId = preview?.themeId ?? savedTheme;
  const appearance = preview?.appearance ?? savedAppearance;
  const isDark = appearance === 'dark' || (appearance === 'system' && systemScheme === 'dark');
  const palette = useMemo(() => getThemePalette(themeId, isDark), [themeId, isDark]);
  const tokens = useMemo(() => getDesignTokens(themeId, isDark), [themeId, isDark]);

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
