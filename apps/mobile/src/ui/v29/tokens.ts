/** V29 shared visual constants. Screen implementations should consume these rather than inventing local spacing. */
export const sideQuestV29Tokens = {
  spacing: { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32 },
  radius: { chip: 999, control: 14, card: 22, hero: 28 },
  type: {
    pageTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
    cardTitle: { fontSize: 20, lineHeight: 25, fontWeight: '700' as const },
    body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
    secondary: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
    label: { fontSize: 13, lineHeight: 17, fontWeight: '600' as const },
  },
  layout: {
    outerGutter: 18,
    mastheadHeight: 60,
    bottomNavigationHeight: 76,
    minimumTapTarget: 44,
  },
} as const;
