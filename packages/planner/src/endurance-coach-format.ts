import type {
  EndurancePrescriptionBlock,
  EnduranceSessionPrescription,
} from './endurance-prescription';

export interface EnduranceCoachLine {
  text: string;
  secondary?: string;
}

/**
 * Athlete-facing formatting for a quantitative endurance prescription.
 *
 * The planner remains the source of truth for duration, distance, repeats,
 * recovery, RPE, and pace targets. This layer only turns those values into the
 * compact workout language athletes and coaches actually use.
 */
export function enduranceCoachLines(
  prescription: EnduranceSessionPrescription,
  block: EndurancePrescriptionBlock,
): EnduranceCoachLine[] {
  if (prescription.discipline === 'swim' && block.distanceUnit) {
    return swimCoachLines(prescription, block);
  }
  if (prescription.discipline === 'run') {
    return runCoachLines(prescription, block);
  }
  return [];
}

function swimCoachLines(
  prescription: EnduranceSessionPrescription,
  block: EndurancePrescriptionBlock,
): EnduranceCoachLine[] {
  const unit = block.distanceUnit ?? prescription.distanceUnit ?? 'yd';
  const distance = block.totalDistance ?? 0;

  if (block.id === 'warmup') return swimWarmup(distance, unit, prescription.workoutType);
  if (block.id === 'cooldown') return swimCooldown(distance, unit, prescription.workoutType);

  if (block.kind === 'drill' && block.repeats && block.repeatDistance) {
    return [{
      text: `${block.repeats} × ${block.repeatDistance} ${unit} as drill / swim by 25`,
      secondary: joinSecondary(restLabel(block.restSeconds), 'Rotate familiar drills; keep this form-first.'),
    }];
  }

  if ((block.id === 'main' || block.id === 'secondary') && block.repeats && block.repeatDistance) {
    return swimRepeatLines(prescription, block, unit);
  }

  if (distance > 0) {
    return [{ text: `${distance} ${unit} smooth` }];
  }
  return [];
}

function swimWarmup(
  distance: number,
  unit: string,
  workoutType: EnduranceSessionPrescription['workoutType'],
): EnduranceCoachLine[] {
  const quality = workoutType === 'swim_quality';
  if (distance >= 400) {
    return [
      { text: `200 ${unit} easy choice` },
      {
        text: `4 × 50 ${unit} ${quality ? 'build within each 50' : 'as 25 drill / 25 swim'}`,
        secondary: quality ? '20 sec rest' : '15 sec rest',
      },
      ...(distance > 400 ? [{ text: `${distance - 400} ${unit} relaxed and smooth` }] : []),
    ];
  }
  if (distance >= 300) {
    return [
      { text: `100 ${unit} easy choice` },
      { text: `4 × 50 ${unit} as 25 drill / 25 swim`, secondary: '15 sec rest' },
      ...(distance > 300 ? [{ text: `${distance - 300} ${unit} relaxed and smooth` }] : []),
    ];
  }
  if (distance >= 200) {
    return [
      { text: `100 ${unit} easy choice` },
      { text: `4 × 25 ${unit} ${quality ? 'build to strong' : 'relaxed build'}`, secondary: '20 sec rest' },
      ...(distance > 200 ? [{ text: `${distance - 200} ${unit} relaxed and smooth` }] : []),
    ];
  }
  return distance > 0 ? [{ text: `${distance} ${unit} easy choice` }] : [];
}

function swimCooldown(
  distance: number,
  unit: string,
  workoutType: EnduranceSessionPrescription['workoutType'],
): EnduranceCoachLine[] {
  const nonFreeCue = workoutType === 'swim_quality' ? 'easy choice / non-free' : 'easy choice';
  if (distance === 200) return [{ text: `4 × 50 ${unit} ${nonFreeCue}`, secondary: '20 sec rest' }];
  if (distance === 300) return [{ text: `3 × 100 ${unit} ${nonFreeCue}`, secondary: '20 sec rest' }];
  if (distance >= 400) {
    return [
      { text: `200 ${unit} easy pull or choice` },
      { text: `4 × 50 ${unit} ${nonFreeCue}`, secondary: '20 sec rest' },
      ...(distance > 400 ? [{ text: `${distance - 400} ${unit} very easy` }] : []),
    ];
  }
  return distance > 0 ? [{ text: `${distance} ${unit} very easy` }] : [];
}

function swimRepeatLines(
  prescription: EnduranceSessionPrescription,
  block: EndurancePrescriptionBlock,
  unit: string,
): EnduranceCoachLine[] {
  const repeats = block.repeats ?? 1;
  const distance = block.repeatDistance ?? block.totalDistance ?? 0;
  const recovery = restLabel(block.restSeconds);
  const type = prescription.workoutType;

  if (block.id === 'secondary') {
    if (block.target.high <= 3) {
      return [{ text: `${repeats} × ${distance} ${unit} easy reset`, secondary: recovery }];
    }
    return [{ text: `${repeats} × ${distance} ${unit} smooth aerobic`, secondary: recovery }];
  }

  if (type === 'swim_quality') {
    if (repeats >= 6 && distance <= 200) {
      const first = Math.ceil(repeats / 2);
      const second = repeats - first;
      return [
        { text: `${first} × ${distance} ${unit} fast and smooth`, secondary: recovery },
        ...(second ? [{ text: `${second} × ${distance} ${unit} strong second half`, secondary: recovery }] : []),
      ];
    }
    if (distance >= 300) {
      return [{ text: `${repeats} × ${distance} ${unit} as controlled start / strong finish`, secondary: recovery }];
    }
    return [{ text: `${repeats} × ${distance} ${unit} fast and smooth`, secondary: recovery }];
  }

  if (type === 'swim_endurance') {
    if (repeats >= 5 && distance >= 200) {
      const first = Math.ceil(repeats / 2);
      const second = repeats - first;
      return [
        { text: `${first} × ${distance} ${unit} descending`, secondary: recovery },
        ...(second ? [{ text: `${second} × ${distance} ${unit} negative split`, secondary: recovery }] : []),
      ];
    }
    if (distance === 300) {
      return [{ text: `${repeats} × 300 ${unit} descending 1–${repeats}`, secondary: recovery }];
    }
    if (distance === 200) {
      return [{ text: `${repeats} × 200 ${unit} negative split`, secondary: recovery }];
    }
    return [{ text: `${repeats} × ${distance} ${unit} steady, finish each repeat stronger`, secondary: recovery }];
  }

  if (type === 'swim_technique') {
    return [{
      text: `${repeats} × ${distance} ${unit} negative split with clean mechanics`,
      secondary: joinSecondary(recovery, 'Form before speed.'),
    }];
  }

  if (distance === 300) {
    return [{ text: `${repeats} × 300 ${unit} as 100 smooth / 100 moderate / 100 smooth`, secondary: recovery }];
  }
  if (distance >= 400) {
    return [{ text: `${repeats} × ${distance} ${unit} smooth aerobic, build the final quarter`, secondary: recovery }];
  }
  return [{ text: `${repeats} × ${distance} ${unit} relaxed and smooth`, secondary: recovery }];
}

function runCoachLines(
  prescription: EnduranceSessionPrescription,
  block: EndurancePrescriptionBlock,
): EnduranceCoachLine[] {
  if (prescription.workoutType === 'run_return_to_run') {
    if (block.kind === 'walk_run' && block.repeats && block.workMinutes) {
      return [{
        text: `${block.repeats} × ${block.workMinutes} min easy run`,
        secondary: `${block.recoveryMinutes ?? 1} min ${block.recoveryLabel ?? 'walk'} between`,
      }];
    }
    if (block.workLabel === 'walk') return [{ text: `${block.totalMinutes} min walk` }];
    return [];
  }

  if (block.id === 'warmup') {
    if (prescription.workoutType === 'run_quality_intervals') {
      return [
        { text: `${block.totalMinutes} min easy running` },
        { text: 'Finish with activation + mobility and 4–6 relaxed strides', secondary: 'Full reset between strides' },
      ];
    }
    return [{ text: `${block.totalMinutes} min easy running` }];
  }

  if (block.id === 'main' && block.kind === 'intervals' && block.repeats && block.workMinutes) {
    const tempo = /tempo|threshold|10k/i.test(prescription.title);
    return [{
      text: `${block.repeats} × ${block.workMinutes} min ${tempo ? 'tempo / 10K-like effort' : 'controlled quality'}`,
      secondary: `${block.recoveryMinutes ?? 1} min easy jog between reps`,
    }];
  }

  if (block.id === 'cooldown') return [{ text: `${block.totalMinutes} min easy cool-down` }];
  if (block.id === 'aerobic-finish') return [{ text: `${block.totalMinutes} min easy aerobic finish` }];
  if (block.kind === 'continuous') return [{ text: `${block.totalMinutes} min continuous`, secondary: block.target.cue }];
  return [];
}

function restLabel(seconds: number | undefined): string | undefined {
  return seconds ? `${seconds} sec rest` : undefined;
}

function joinSecondary(...values: Array<string | undefined>): string | undefined {
  const cleaned = values.filter((value): value is string => Boolean(value));
  return cleaned.length ? cleaned.join(' · ') : undefined;
}
