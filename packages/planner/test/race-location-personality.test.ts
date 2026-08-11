import { describe, expect, it } from 'vitest';
import {
  deriveRaceLocationPersonality,
  raceLocationFromGoalName,
} from '../../../apps/mobile/src/services/race-location-personality';

describe('race location personality', () => {
  it('uses arbitrary athlete-entered locations without a race-specific lookup table', () => {
    expect(deriveRaceLocationPersonality('Nice, France')).toMatchObject({
      placeLabel: 'Nice',
      locality: 'Nice',
      country: 'France',
    });
    expect(deriveRaceLocationPersonality('Oceanside, CA')).toMatchObject({
      placeLabel: 'Oceanside',
      locality: 'Oceanside',
      country: 'CA',
    });
  });

  it('detects generic environmental clues and accepts future factual enrichment', () => {
    expect(deriveRaceLocationPersonality('Lake Placid, NY')?.environmentTags).toContain('lake');
    expect(deriveRaceLocationPersonality('Boulder, CO', {
      environmentTags: ['mountain', 'high_altitude'],
      cultureTags: ['foothills'],
    })).toMatchObject({
      placeLabel: 'Boulder',
      environmentTags: ['mountain', 'high_altitude'],
      cultureTags: ['foothills'],
    });
  });

  it('round-trips the optional location stored in the existing goal-name persistence shape', () => {
    expect(raceLocationFromGoalName('Ironman 70.3 · Nice, France · 2026-10-29')).toBe('Nice, France');
    expect(raceLocationFromGoalName('Ironman 70.3 · 2026-10-29')).toBeUndefined();
  });
});
