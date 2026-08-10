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

  it('keeps activity environments visually distinct instead of collapsing them into one hue family', () => {
    const theme = source('apps/mobile/src/theme/index.ts');
    expect(theme).toContain("trail: { light: '#173C31'");
    expect(theme).toContain("summit: { light: '#344F68'");
    expect(theme).toContain("race_day: { light: '#0D2F4F'");
    expect(theme).toContain("ocean: { light: '#05495D'");
    expect(theme).toContain("alpine: { light: '#356F77'");
    expect(theme).toContain("ember: { light: '#7A2E31'");
    expect(theme).toContain("indigo: { light: '#071E2F'");
    expect(theme).toContain("slate: { light: '#51382D'");
    expect(theme).toContain("forest: '#E4572E', forest2: '#B83E1E'");
    expect(theme).toContain("forest: '#087D9A', forest2: '#05536A'");
    expect(theme).toContain("forest: '#3A8C89', forest2: '#286462'");
    expect(theme).toContain("forest: '#B4463C', forest2: '#7A2E31'");
    expect(theme).toContain("forest: '#007E9D', forest2: '#07506C'");
    expect(theme).toContain("forest: '#8D4A30', forest2: '#58392D'");
  });
});
