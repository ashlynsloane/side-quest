type Discipline = 'swim' | 'bike' | 'run';

export interface EnduranceDetailBlockLike {
  id: string;
  label: string;
  kind: string;
  shapeId?: string;
  totalMinutes: number;
  repeats?: number;
  workMinutes?: number;
  recoveryMinutes?: number;
  instruction: string;
  target: {
    low: number;
    high: number;
    cue: string;
  };
}

export interface EnduranceDetailPrescriptionLike {
  discipline: Discipline;
  workoutType: string;
  title: string;
  objective: string;
  blocks: readonly EnduranceDetailBlockLike[];
}

export interface EnduranceHeroPresentation {
  objective: string;
  effortLabel: 'WORK RPE' | 'RIDE RPE' | 'RUN RPE' | 'MAIN RPE';
  effortValue: string;
}

/**
 * Athlete-facing presentation only. The planner remains the source of truth
 * for dose, block structure, RPE ranges, and progression.
 */
export function enduranceHeroPresentation(
  prescription: EnduranceDetailPrescriptionLike,
): EnduranceHeroPresentation {
  const title = prescription.title.toLowerCase();
  const main = focusBlock(prescription.blocks);
  const effortValue = `RPE ${main?.target.low ?? 1}–${main?.target.high ?? 10}`;

  if (prescription.discipline === 'bike') {
    const intervalDose = main?.repeats && main.workMinutes
      ? `${main.repeats} repeatable ${main.workMinutes}-minute efforts`
      : 'repeatable work';

    if (/vo2/.test(title)) {
      return {
        objective: `Raise aerobic power with ${intervalDose} while keeping the final rep controlled.`,
        effortLabel: 'WORK RPE',
        effortValue,
      };
    }
    if (/over\s*\/\s*under|over.?under/.test(title)) {
      return {
        objective: 'Practice changing pressure without losing control: surge, settle, and return to sustainable work.',
        effortLabel: 'WORK RPE',
        effortValue,
      };
    }
    if (/threshold/.test(title)) {
      return {
        objective: `Build sustained threshold control with ${intervalDose} that stays repeatable from first rep to last.`,
        effortLabel: 'WORK RPE',
        effortValue,
      };
    }
    if (/tempo|aerobic strength/.test(title) && !/long ride/.test(title)) {
      return {
        objective: 'Build sustained aerobic strength and muscular endurance without turning the session into a threshold test.',
        effortLabel: main?.kind === 'intervals' ? 'WORK RPE' : 'RIDE RPE',
        effortValue,
      };
    }
    if (/race pace|full rehearsal|race position/.test(title)) {
      return {
        objective: 'Practice sustainable race-specific pressure, position, and fueling rhythm without turning the ride into a test.',
        effortLabel: main?.kind === 'intervals' ? 'WORK RPE' : 'RIDE RPE',
        effortValue,
      };
    }
    if (/fueling/.test(title) && /long ride/.test(title)) {
      return {
        objective: 'Build long-ride durability while making fueling and hydration timing repeatable.',
        effortLabel: 'RIDE RPE',
        effortValue,
      };
    }
    if (/hills \+ rolling terrain|rolling durability/.test(title)) {
      return {
        objective: 'Build aerobic durability over hills and rolling terrain while keeping climbs controlled.',
        effortLabel: 'RIDE RPE',
        effortValue,
      };
    }
    if (/reduced aerobic|recovery|aerobic reset|leg flush/.test(title)) {
      return {
        objective: 'Maintain movement quality and aerobic rhythm while letting fatigue come down.',
        effortLabel: 'RIDE RPE',
        effortValue,
      };
    }
    if (/cadence/.test(title)) {
      return {
        objective: 'Improve cadence economy and smoothness without adding meaningful fatigue.',
        effortLabel: 'RIDE RPE',
        effortValue,
      };
    }
    if (/long ride/.test(title)) {
      return {
        objective: 'Extend aerobic durability at a steady, sustainable effort.',
        effortLabel: 'RIDE RPE',
        effortValue,
      };
    }
    return {
      objective: prescription.objective,
      effortLabel: main?.kind === 'intervals' ? 'WORK RPE' : 'RIDE RPE',
      effortValue,
    };
  }

  if (prescription.discipline === 'run') {
    if (prescription.workoutType === 'run_return_to_run' || /return.?to.?run|run\s*\/\s*walk/.test(title)) {
      return {
        objective: 'Build impact tolerance with controlled run/walk exposure; duration progresses before speed.',
        effortLabel: 'RUN RPE',
        effortValue,
      };
    }
    if (/quality|interval|tempo|threshold/.test(prescription.workoutType) || /tempo|threshold|interval/.test(title)) {
      return {
        objective: 'Build repeatable run quality while keeping mechanics controlled from first effort to last.',
        effortLabel: 'WORK RPE',
        effortValue,
      };
    }
    if (/long/.test(prescription.workoutType) || /long/.test(title)) {
      return {
        objective: 'Build aerobic running durability at a sustainable effort.',
        effortLabel: 'RUN RPE',
        effortValue,
      };
    }
    if (/recovery/.test(prescription.workoutType) || /recovery/.test(title)) {
      return {
        objective: 'Promote recovery with easy running that leaves you fresher than you started.',
        effortLabel: 'RUN RPE',
        effortValue,
      };
    }
    return {
      objective: prescription.objective,
      effortLabel: 'RUN RPE',
      effortValue,
    };
  }

  // Swim keeps pool setup in the hero's second metric, but the objective still
  // benefits from discipline-specific language.
  if (/quality|threshold|fast|interval/.test(prescription.workoutType) || /threshold|fast|quality/.test(title)) {
    return {
      objective: 'Build repeatable speed while keeping stroke quality intact.',
      effortLabel: 'MAIN RPE',
      effortValue,
    };
  }
  if (/technique|drill/.test(prescription.workoutType) || /technique|drill/.test(title)) {
    return {
      objective: 'Improve stroke economy and feel for the water with low-cost technical work.',
      effortLabel: 'MAIN RPE',
      effortValue,
    };
  }
  if (/endurance|long/.test(prescription.workoutType) || /endurance|long/.test(title)) {
    return {
      objective: 'Build steady aerobic swim durability while keeping mechanics relaxed.',
      effortLabel: 'MAIN RPE',
      effortValue,
    };
  }
  return {
    objective: prescription.objective,
    effortLabel: 'MAIN RPE',
    effortValue,
  };
}

/**
 * Surfaces the useful planner-authored execution cue that was previously hidden
 * whenever the formatted set lines were present.
 */
export function mainSetCoachCue(
  block: EnduranceDetailBlockLike,
): string | null {
  if (block.id !== 'main') return null;

  let text = block.instruction.trim();
  if (!text) return null;

  // Internal accounting language is useful to tests, not to an athlete
  // standing beside a bike or pool.
  text = text
    .replace(/\s*The separately listed aerobic finish completes the approved ride time\.?/gi, '')
    .replace(/\s*the separately listed aerobic finish completes the approved ride time\.?/gi, '')
    .trim();

  return text || null;
}

export function enduranceEffortBody(
  prescription: EnduranceDetailPrescriptionLike,
): string {
  const title = prescription.title.toLowerCase();

  if (prescription.discipline === 'bike' && /vo2|threshold|tempo|over\s*\/\s*under|race pace/.test(title)) {
    return 'Use RPE on the work intervals, not the whole ride. Start at the lower end of the target range and only press higher if cadence, position, and repeatability stay intact. Recoveries should feel genuinely easy.';
  }
  if (prescription.discipline === 'bike' && /long ride/.test(title)) {
    return 'Use RPE to cap climbs, surges, and the temptation to chase average speed. The goal is durable execution across the whole ride; position and fueling practice count as part of the workout.';
  }
  if (prescription.discipline === 'bike') {
    return 'Keep the intended stimulus in its lane. Support riding should finish with enough reserve that it does not compete with the week’s key bike session.';
  }
  if (prescription.discipline === 'run' && prescription.workoutType === 'run_return_to_run') {
    return 'Treat impact tolerance as the target. Keep the running controlled and follow the prescribed run/walk structure rather than using pace to make the session harder.';
  }
  if (prescription.discipline === 'run') {
    return 'Use the written RPE as the primary target. Keep mechanics controlled and avoid turning a repeatable session into an all-out test.';
  }
  return 'Use the written RPE as the primary target. Side Quest only adds numeric pace targets when athlete-specific data supports them.';
}

function focusBlock(
  blocks: readonly EnduranceDetailBlockLike[],
): EnduranceDetailBlockLike | undefined {
  return blocks.find((block) => block.id === 'main')
    ?? blocks
      .filter((block) => !/warm.?up|cool.?down/i.test(block.label))
      .sort((left, right) => right.totalMinutes - left.totalMinutes)[0]
    ?? blocks[0];
}
