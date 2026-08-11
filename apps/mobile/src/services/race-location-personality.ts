export type RaceLocationEnvironment =
  | 'coastal'
  | 'mountain'
  | 'lake'
  | 'river'
  | 'desert'
  | 'forest'
  | 'island'
  | 'urban'
  | 'high_altitude';

export interface RaceLocationEnrichment {
  locality?: string;
  region?: string;
  country?: string;
  environmentTags?: readonly RaceLocationEnvironment[];
  cultureTags?: readonly string[];
}

export interface RaceLocationPersonality {
  raw: string;
  placeLabel: string;
  locality?: string;
  region?: string;
  country?: string;
  environmentTags: readonly RaceLocationEnvironment[];
  cultureTags: readonly string[];
}

const ENVIRONMENT_PATTERNS: Array<[RaceLocationEnvironment, RegExp]> = [
  ['coastal', /\b(coast|coastal|ocean|beach|bay|shore|seaside|pacific|atlantic|mediterranean|gulf|harbor|harbour)\b/i],
  ['mountain', /\b(mountain|mountains|alpine|summit|foothill|foothills|canyon|ridge|pass)\b/i],
  ['lake', /\b(lake|lakeside|reservoir)\b/i],
  ['river', /\b(river|riverside|creek)\b/i],
  ['desert', /\b(desert|mesa|cactus|dune|dunes)\b/i],
  ['forest', /\b(forest|woods|woodland|pine|trailhead)\b/i],
  ['island', /\b(island|isle|key|keys)\b/i],
  ['urban', /\b(city|downtown|metro|metropolitan)\b/i],
  ['high_altitude', /\b(altitude|high altitude|elevation)\b/i],
];

/**
 * Builds a deterministic location personality from athlete-entered race text.
 * This deliberately does not require a network lookup. Future geocoder/LLM
 * enrichment can supply factual environment/culture tags through `enrichment`
 * without changing the naming selector contract.
 */
export function deriveRaceLocationPersonality(
  rawLocation: string | undefined,
  enrichment: RaceLocationEnrichment = {},
): RaceLocationPersonality | undefined {
  const raw = clean(rawLocation ?? '');
  if (!raw && !enrichment.locality) return undefined;

  const parts = raw.split(',').map(clean).filter(Boolean);
  const locality = clean(enrichment.locality ?? parts[0] ?? '');
  const country = clean(enrichment.country ?? (parts.length >= 2 ? parts.at(-1) ?? '' : ''));
  const region = clean(enrichment.region ?? (parts.length >= 3 ? parts.slice(1, -1).join(', ') : ''));
  const placeLabel = locality || raw;
  const searchable = [raw, locality, region, country, ...(enrichment.cultureTags ?? [])].filter(Boolean).join(' ');
  const environmentTags = unique<RaceLocationEnvironment>([
    ...ENVIRONMENT_PATTERNS.filter(([, pattern]) => pattern.test(searchable)).map(([tag]) => tag),
    ...(enrichment.environmentTags ?? []),
  ]);
  const cultureTags = unique((enrichment.cultureTags ?? []).map(clean).filter(Boolean));

  return {
    raw: raw || locality,
    placeLabel,
    locality: locality || undefined,
    region: region || undefined,
    country: country || undefined,
    environmentTags,
    cultureTags,
  };
}

/**
 * Goal Setup stores the optional race location in the human-readable goal name:
 * `Ironman 70.3 · Nice, France · 2026-10-29`. This keeps existing persistence
 * compatible while giving the naming layer a stable location value.
 */
export function raceLocationFromGoalName(goalName?: string): string | undefined {
  if (!goalName) return undefined;
  const parts = goalName.split(' · ').map(clean).filter(Boolean);
  if (parts.length < 3) return undefined;
  const tail = parts.at(-1) ?? '';
  const end = /^\d{4}-\d{2}-\d{2}$/.test(tail) ? parts.length - 1 : parts.length;
  const candidate = parts.slice(1, end).join(' · ').trim();
  return candidate || undefined;
}

export function raceLocationIdentity(personality: RaceLocationPersonality): string {
  return [
    personality.locality,
    personality.region,
    personality.country,
    ...personality.environmentTags,
    ...personality.cultureTags,
  ].filter(Boolean).join('|').toLowerCase();
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
