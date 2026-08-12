import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  enduranceEffortBody,
  enduranceHeroPresentation,
  mainSetCoachCue,
} from '../../../apps/mobile/src/services/endurance-detail-copy';

const ROOT = resolve(__dirname, '../../..');
const source = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf8');

function bikePrescription(title: string, shapeId: string, low: number, high: number) {
  return {
    discipline: 'bike' as const,
    workoutType: 'bike_quality_intervals',
    title,
    objective: 'Controlled quality work',
    blocks: [
      {
        id: 'warmup',
        label: 'Warm-up',
        kind: 'continuous',
        totalMinutes: 15,
        instruction: 'Easy spin.',
        target: { low: 2, high: 3, cue: 'Easy' },
      },
      {
        id: 'main',
        label: 'Main set',
        kind: 'intervals',
        shapeId,
        totalMinutes: 44,
        repeats: 6,
        workMinutes: 4,
        recoveryMinutes: 4,
        instruction: 'Ride 6 × 4 min hard at RPE 8–9 with 4 min easy between. Do not sprint the first rep; aim to keep power and cadence from fading across the set. The separately listed aerobic finish completes the approved ride time.',
        target: { low, high, cue: 'Hard, controlled, repeatable' },
      },
    ],
  };
}

describe('workout-detail content polish', () => {
  it('describes VO2 by the adaptation and exact repeatable dose', () => {
    const copy = enduranceHeroPresentation(
      bikePrescription('VO2 · 6 × 4', 'bike-vo2-6x4', 8, 9),
    );
    expect(copy.objective).toBe(
      'Raise aerobic power with 6 repeatable 4-minute efforts while keeping the final rep controlled.',
    );
    expect(copy.effortLabel).toBe('WORK RPE');
    expect(copy.effortValue).toBe('RPE 8–9');
  });

  it('does not summarize a quality workout as the warm-up-to-workout RPE range', () => {
    const copy = enduranceHeroPresentation(
      bikePrescription('Threshold · Cruise Control', 'bike-threshold-4x10', 6, 7),
    );
    expect(copy.effortValue).toBe('RPE 6–7');
    expect(copy.effortValue).not.toBe('RPE 1–7');
  });

  it('gives long fueling and hills rides purpose-specific language', () => {
    const fueling = enduranceHeroPresentation({
      discipline: 'bike',
      workoutType: 'bike_long_aerobic',
      title: 'Long Ride · Fueling Practice',
      objective: 'Aerobic durability',
      blocks: [{
        id: 'main',
        label: 'Main set',
        kind: 'continuous',
        totalMinutes: 180,
        instruction: 'Fuel consistently.',
        target: { low: 3, high: 5, cue: 'Aerobic + fueling practice' },
      }],
    });
    const hills = enduranceHeroPresentation({
      discipline: 'bike',
      workoutType: 'bike_long_aerobic',
      title: 'Long Ride · Hills + Rolling Terrain',
      objective: 'Aerobic durability',
      blocks: [{
        id: 'main',
        label: 'Main set',
        kind: 'continuous',
        totalMinutes: 190,
        instruction: 'Keep climbs controlled.',
        target: { low: 3, high: 5, cue: 'Even effort over terrain' },
      }],
    });
    expect(fueling.objective).toContain('fueling and hydration timing');
    expect(fueling.effortLabel).toBe('RIDE RPE');
    expect(hills.objective).toContain('hills and rolling terrain');
  });

  it('surfaces planner-authored main-set coaching while removing internal accounting language', () => {
    const prescription = bikePrescription('VO2 · 6 × 4', 'bike-vo2-6x4', 8, 9);
    const cue = mainSetCoachCue(prescription.blocks[1]!);
    expect(cue).toContain('Do not sprint the first rep');
    expect(cue).not.toContain('approved ride time');
  });

  it('makes the effort explanation session-specific', () => {
    const body = enduranceEffortBody(
      bikePrescription('VO2 · 6 × 4', 'bike-vo2-6x4', 8, 9),
    );
    expect(body).toContain('work intervals');
    expect(body).toContain('Recoveries should feel genuinely easy');
  });

  it('wires the athlete-facing copy into the actual endurance detail screen', () => {
    const screen = source('apps/mobile/src/app/endurance-preview.tsx');
    expect(screen).toContain('const heroPresentation = enduranceHeroPresentation(prescription)');
    expect(screen).toContain('{heroPresentation.objective}');
    expect(screen).toContain("{isSwim ? 'SETUP' : heroPresentation.effortLabel}");
    expect(screen).toContain('const coachCue = mainSetCoachCue(block)');
    expect(screen).toContain('COACH CUE');
    expect(screen).toContain('enduranceEffortBody(prescription)');
    expect(screen).not.toContain('function overallEffort(');
  });
});
