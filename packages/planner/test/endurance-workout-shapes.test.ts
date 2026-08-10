import { describe, expect, it } from 'vitest';
import {
  listSwimPoolWorkoutShapes,
  listTimedQualityShapes,
  selectSwimPoolWorkoutShape,
  selectTimedQualityShape,
  swimPoolWorkoutShapeDistance,
  timedQualityShapeMinutes,
} from '../src/endurance-workout-shapes';

describe('endurance workout shape library', () => {
  it('keeps timed interval shapes on human five-minute block totals', () => {
    for (const shape of listTimedQualityShapes()) {
      expect(timedQualityShapeMinutes(shape) % 5, shape.id).toBe(0);
      expect(shape.repeats).toBeGreaterThanOrEqual(2);
      expect(shape.workMinutes).toBeGreaterThanOrEqual(4);
      expect(shape.recoveryMinutes).toBeGreaterThanOrEqual(1);
    }
  });

  it('prefers sustained reps when a tempo or threshold cue is explicit', () => {
    expect(selectTimedQualityShape('run', 30, 'Run quality')?.id).toBe('run-4x6-r2');
    expect(selectTimedQualityShape('run', 30, 'Tempo run')?.id).toBe('run-3x8-r3');
    expect(selectTimedQualityShape('bike', 40, 'Bike quality')?.id).toBe('bike-3x10-r5');
    expect(selectTimedQualityShape('bike', 40, 'Threshold bike')?.id).toBe('bike-3x12-r2');
  });

  it('uses complete registered pool workouts rather than remainder-generated sets', () => {
    for (const shape of listSwimPoolWorkoutShapes()) {
      const total = swimPoolWorkoutShapeDistance(shape);
      expect(total % 100, shape.id).toBe(0);
      expect(shape.main.repeats).toBeGreaterThanOrEqual(2);
      expect(shape.main.repeatDistance % 50, shape.id).toBe(0);
      if (shape.drill) {
        expect([4, 6, 8]).toContain(shape.drill.repeats);
        expect(shape.drill.repeatDistance).toBe(50);
      }
    }
  });

  it('selects recognizable pool shapes near the requested training dose', () => {
    const technique = selectSwimPoolWorkoutShape('swim_technique', 1370);
    expect(technique.id).toBe('swim-technique-1400');
    expect(technique.drill?.repeats).toBe(6);
    expect(technique.main.repeats).toBe(3);
    expect(technique.main.repeatDistance).toBe(200);

    const quality = selectSwimPoolWorkoutShape('swim_quality', 3380);
    expect(quality.id).toBe('swim-quality-3200');
    expect(quality.main.repeats).toBe(6);
    expect(quality.main.repeatDistance).toBe(300);
    expect(quality.secondary?.purpose).toBe('aerobic');
  });
});
