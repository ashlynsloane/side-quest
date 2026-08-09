import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Side Quest Classic theme migration', () => {
  it('moves existing beta profiles to the neutral/navy Classic experience once per user', () => {
    const themeContext = source('apps/mobile/src/state/theme-context.tsx');
    expect(themeContext).toContain("const CLASSIC_THEME_ID: ThemeId = 'forest'");
    expect(themeContext).toContain("CLASSIC_THEME_MIGRATION_VERSION = 'neutral-navy-v1'");
    expect(themeContext).toContain('needsClassicThemeMigration(user?.id)');
    expect(themeContext).toContain("updateProfile({ themeId: CLASSIC_THEME_ID })");
    expect(themeContext).toContain('markClassicThemeMigration(user.id)');
  });

  it('keeps alternate environments available after the one-time migration', () => {
    const appearance = source('apps/mobile/src/app/appearance.tsx');
    const themeContext = source('apps/mobile/src/state/theme-context.tsx');
    expect(appearance).toContain('themeDefinitions.filter');
    expect(appearance).toContain('Apply environment');
    expect(themeContext).toContain('const applyTheme = useCallback(async (nextTheme');
    expect(themeContext).toContain('updateProfile({ themeId: nextTheme, appearance: nextAppearance })');
  });

  it('uses neutral shared selection surfaces instead of filling them with the accent tint', () => {
    const ui = source('apps/mobile/src/components/product-ui.tsx');
    expect(ui).toContain('choiceSelected: { borderColor: tokens.accent, backgroundColor: tokens.surface }');
    expect(ui).toContain('choiceIconSelected: { backgroundColor: tokens.surfaceMuted }');
    expect(ui).toContain('metricEmphasis: { backgroundColor: tokens.surfaceMuted');
  });
});
