import type { PlannedMultisportSession } from './multisport';
import {
  buildEndurancePrescription as buildBaseEndurancePrescription,
  type EndurancePrescriptionBlock,
  type EndurancePrescriptionContext,
  type EnduranceSessionPrescription,
} from './endurance-prescription';

export * from './endurance-prescription';

/**
 * Materializes the workout-family names assigned by the block-rhythm planner.
 * Safety/load remain owned by the base prescription. This layer changes only
 * workout structure inside that already-approved dose.
 */
export function buildEndurancePrescription(
  session: PlannedMultisportSession,
  context: EndurancePrescriptionContext = {},
): EnduranceSessionPrescription | null {
  const base = buildBaseEndurancePrescription(session, context);
  if (!base) return null;
  const title = session.title.toLowerCase();

  let blocks = base.blocks;
  if (session.discipline === 'swim') {
    if (title.includes('change of pace') || title.includes('fartlek')) blocks = swimFartlek(blocks);
    else if (title.includes('descending ladder')) blocks = tagMain(blocks, 'swim-descending-ladder');
    else if (title.includes('fast & smooth')) blocks = tagMain(blocks, 'swim-fast-smooth');
    else if (title.includes('broken tempo')) blocks = tagMain(blocks, 'swim-broken-tempo');
    else if (title.includes('ladder day')) blocks = tagMain(blocks, 'swim-threshold-ladder');
  } else if (session.discipline === 'bike') {
    // Race-horizon long/support roles are materialized before generic family
    // matching so a purposeful long ride cannot collapse into a generic ride.
    if (title.includes('long ride · fueling practice')) blocks = bikeLongFuelingPractice(blocks);
    else if (title.includes('long ride · fueling rehearsal')) blocks = bikeLongFuelingRehearsal(blocks);
    else if (title.includes('long ride · race pace blocks')) blocks = bikeLongRacePaceBlocks(blocks);
    else if (title.includes('long ride · full rehearsal')) blocks = bikeLongFullRehearsal(blocks);
    else if (title.includes('long ride · race position durability')) blocks = bikeLongRacePosition(blocks);
    else if (title.includes('long ride · tempo inserts')) blocks = bikeLongTempoInserts(blocks);
    else if (title.includes('long ride · hills + rolling terrain') || title.includes('long ride · rolling durability')) blocks = bikeLongRollingDurability(blocks);
    else if (title.includes('long ride · progressive finish')) blocks = bikeLongProgressiveFinish(blocks);
    else if (title.includes('long ride · strong finish')) blocks = bikeLongStrongFinish(blocks);
    else if (title.includes('long ride · reduced specific')) blocks = bikeLongReducedSpecific(blocks);
    else if (title.includes('long ride · reduced aerobic')) blocks = bikeLongReducedAerobic(blocks);
    else if (title.includes('long ride · aerobic durability')) blocks = bikeLongAerobicDurability(blocks);
    else if (title.includes('low cadence')) blocks = bikeLowCadenceAerobicStrength(blocks);
    else if (title.includes('tempo inserts · controlled')) blocks = bikeSupportTempoInserts(blocks);
    else if (title.includes('tempo inserts · short')) blocks = bikeSupportShortTempo(blocks);
    else if (title.includes('cadence economy')) blocks = bikeCadenceEconomy(blocks);
    else if (title.includes('race cadence')) blocks = bikeRaceCadence(blocks);
    else if (title.includes('race position')) blocks = bikeRacePosition(blocks);
    else if (title.includes('rolling economy')) blocks = bikeRollingEconomy(blocks);
    else if (title.includes('progressive build')) blocks = bikeProgressiveAerobic(blocks);
    // Specific quality families MUST be checked before generic "fartlek".
    // "Fartlek · Over / Under" previously fell into bikeFartlek() here.
    else if (title.includes('6 × 4')) blocks = bikeVo2SixByFour(blocks);
    else if (title.includes('8 × 2')) blocks = bikeVo2EightByTwo(blocks);
    else if (title.includes('5 × 5')) blocks = bikeVo2FiveByFive(blocks);
    else if (title.includes('6 × 3')) blocks = bikeVo2SixByThree(blocks);
    else if (title.includes('aerobic strength')) blocks = bikeTempoAerobicStrength(blocks);
    else if (title.includes('over / under') && title.includes('4 × 10')) blocks = bikeOverUnderFourByTen(blocks);
    else if (title.includes('over / under') && title.includes('3 × 12')) blocks = bikeOverUnderThreeByTwelve(blocks);
    else if (title.includes('long repeats')) blocks = bikeThresholdThreeByTwelve(blocks);
    else if (title.includes('threshold · 3 × 10')) blocks = bikeThresholdThreeByTen(blocks);
    else if (title.includes('cruise control') && session.intensity === 'hard') blocks = bikeCruiseControl(blocks);
    else if (title.includes('race pace + surges')) blocks = bikeRacePaceSurges(blocks);
    else if (title.includes('race pace · 3 × 15')) blocks = bikeRacePaceThreeByFifteen(blocks);
    else if (title.includes('cadence change-up') || title.includes('fartlek')) blocks = bikeFartlek(blocks);
    else if (title.includes('progressive finish')) blocks = tagMain(blocks, 'bike-progressive-thirds');
    else if (title.includes('rolling endurance')) blocks = tagMain(blocks, 'bike-rolling-endurance');
    else if (title.includes('strong finish')) blocks = tagMain(blocks, 'bike-strong-finish');
  } else if (session.discipline === 'run' && !title.includes('return-to-run')) {
    if (title.includes('change of pace') || title.includes('fartlek')) blocks = runFartlek(blocks);
    else if (title.includes('negative split')) blocks = tagMain(blocks, 'run-negative-split');
    else if (title.includes('rolling rhythm')) blocks = tagMain(blocks, 'run-rolling-rhythm');
    else if (title.includes('fast finish')) blocks = tagMain(blocks, 'run-fast-finish');
  }

  if (session.discipline === 'bike') blocks = reconcileBikeIntervalTime(blocks);

  const mainShapeId = blocks.find((block) => block.id === 'main')?.shapeId;

  return {
    ...base,
    ...(mainShapeId ? { workoutShapeId: mainShapeId } : {}),
    blocks,
    steps: blocks.map((block) => ({
      label: block.label,
      minutes: block.totalMinutes,
      effort: `RPE ${block.target.low}–${block.target.high}`,
      instruction: block.instruction,
    })),
  };
}

function reconcileBikeIntervalTime(
  blocks: EndurancePrescriptionBlock[],
): EndurancePrescriptionBlock[] {
  const mainIndex = blocks.findIndex((block) => block.id === 'main');
  if (mainIndex < 0) return blocks;

  const main = blocks[mainIndex]!;
  const shapeId = main.shapeId ?? '';
  const explicitRecoveryShape = /^bike-(?:vo2|tempo|threshold|over-under|race-pace|long-(?:tempo|race-pace|reduced-specific)|support-(?:low-cadence|tempo|short-tempo))/.test(shapeId);
  if (!explicitRecoveryShape) return blocks;
  if (!main.repeats || !main.workMinutes || main.recoveryMinutes === undefined) return blocks;

  const occupiedMinutes = main.repeats * main.workMinutes
    + Math.max(0, main.repeats - 1) * main.recoveryMinutes;
  const oldMainMinutes = main.totalMinutes;
  const delta = oldMainMinutes - occupiedMinutes;
  if (delta === 0 || occupiedMinutes <= 0) return blocks;

  const finishIndex = blocks.findIndex((block) => /aerobic finish/i.test(block.label));

  // Quality-bike templates already contain an aerobic-finish block. Move any
  // unused main-set minutes there so every interval/recovery minute is explicit.
  if (finishIndex >= 0) {
    const finish = blocks[finishIndex]!;
    const nextFinishMinutes = finish.totalMinutes + delta;
    if (nextFinishMinutes < 0) return blocks;

    return blocks.map((block, index) => {
      if (index === mainIndex) return { ...block, totalMinutes: occupiedMinutes };
      if (index === finishIndex) return {
        ...block,
        totalMinutes: nextFinishMinutes,
        instruction: `${nextFinishMinutes} min continuous. Ride steadily at an easy aerobic effort with smooth cadence.`,
      };
      return block;
    });
  }

  // Long-ride templates are commonly warm-up + one large main set + cooldown
  // and therefore have no aerobic-finish block to resize. When the explicit
  // interval structure occupies less than that main set, create a visible
  // aerobic-fill block instead of hiding the remainder inside `main`.
  if (delta <= 0) return blocks;

  const aerobicFinish: EndurancePrescriptionBlock = {
    ...main,
    id: 'aerobic_finish',
    label: 'Aerobic finish',
    kind: 'continuous',
    shapeId: 'bike-aerobic-fill',
    totalMinutes: delta,
    repeats: undefined,
    workMinutes: undefined,
    recoveryMinutes: undefined,
    workLabel: undefined,
    recoveryLabel: undefined,
    target: { low: 2, high: 4, cue: 'Easy aerobic fill' },
    instruction: `${delta} min continuous. Ride steadily at an easy aerobic effort with smooth cadence.`,
  };

  const reconciled = blocks.map((block, index) =>
    index === mainIndex ? { ...block, totalMinutes: occupiedMinutes } : block);
  const cooldownIndex = reconciled.findIndex((block) => /cool.?down/i.test(block.label));
  const insertAt = cooldownIndex >= 0 ? cooldownIndex : reconciled.length;
  return [
    ...reconciled.slice(0, insertAt),
    aerobicFinish,
    ...reconciled.slice(insertAt),
  ];
}

function swimFartlek(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return blocks.map((block) => {
    if (block.id !== 'main') return block;
    const distance = block.totalDistance ?? 0;
    const repeats = Math.max(1, Math.floor(distance / 100));
    return {
      ...block,
      kind: 'swim_set',
      shapeId: 'swim-fartlek-50-25-25',
      repeats,
      repeatDistance: 100,
      restSeconds: undefined,
      target: { low: 3, high: 6, cue: 'Change gears, stay smooth' },
      instruction: `Swim ${repeats} × [50 steady + 25 fast + 25 easy] continuously. There is no wall rest; the easy 25 is the reset. Keep the fast 25 crisp rather than all-out.`,
    };
  });
}

function bikeFartlek(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return blocks.map((block) => {
    if (block.id !== 'main') return block;
    const repeats = Math.max(1, Math.floor(block.totalMinutes / 5));
    return {
      ...block,
      kind: 'intervals',
      shapeId: 'bike-fartlek-4-1',
      repeats,
      workMinutes: 4,
      recoveryMinutes: 1,
      workLabel: 'steady',
      recoveryLabel: 'brisk cadence',
      target: { low: 2, high: 5, cue: 'Aerobic with cadence changes' },
      instruction: `Ride ${repeats} × [4 min steady + 1 min brisk/high cadence] continuously. The 1-minute change is not a sprint; keep the whole set aerobic.`,
    };
  });
}

function bikeContinuousMain(
  blocks: EndurancePrescriptionBlock[],
  shapeId: string,
  low: number,
  high: number,
  cue: string,
  instruction: string,
): EndurancePrescriptionBlock[] {
  return blocks.map((block) => block.id !== 'main' ? block : {
    ...block,
    shapeId,
    target: { low, high, cue },
    instruction,
  });
}

function bikeLongAerobicDurability(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-long-aerobic-durability', 3, 5, 'Durable aerobic pressure', 'Ride the main set continuously at easy-to-steady aerobic pressure. Keep cadence, posture, and fueling routine stable enough that the final hour looks like the first.');
}

function bikeLongFuelingPractice(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-long-fueling-practice', 3, 5, 'Aerobic + fueling practice', 'Keep the main set aerobic. Begin the fueling/hydration routine early, keep the timing consistent across the ride, and note comfort and GI tolerance. Use the athlete’s existing fueling plan rather than inventing intake targets here; the training objective is repeatable execution under duration.');
}

function bikeLongFuelingRehearsal(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-long-fueling-rehearsal', 3, 5, 'Race-habit rehearsal', 'Ride continuously at sustainable aerobic pressure while rehearsing the athlete’s planned fueling/hydration timing, race position, and equipment habits. Practice the sequence exactly enough to expose practical problems without turning the ride into a race.');
}

function bikeLongRollingDurability(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-long-rolling-durability', 3, 5, 'Even effort over terrain', 'Choose a hilly or rolling route, or simulate elevation with changing resistance. Climb with controlled pressure, keep most climbs at RPE 3–5, and re-settle into aerobic effort within about 30–60 seconds after each crest. Speed can vary; effort should not become a threshold session.');
}

function bikeLongProgressiveFinish(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-long-progressive-finish', 3, 5, 'Easy first, firm aerobic finish', 'Ride most of the main set easy aerobic, then gradually lift the final 30–45 minutes toward firm aerobic pressure. Finish controlled, not depleted.');
}

function bikeLongStrongFinish(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-long-strong-finish', 3, 6, 'Durability + controlled finish', 'Keep the majority of the ride aerobic, then ride the final 40–50 minutes at controlled race-adjacent pressure (RPE 5–6). The finish should be strong but still repeatable.');
}

function bikeLongFullRehearsal(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-long-full-rehearsal', 3, 6, 'Full execution rehearsal', 'Treat the main set as an execution rehearsal: race position, sustainable pressure, planned fueling/hydration, equipment, and pacing discipline. Do not race the training ride.');
}

function bikeLongRacePosition(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-long-race-position', 3, 5, 'Sustainable race position', 'Accumulate long, comfortable stretches in intended race position at aerobic pressure. Sit up briefly as needed to preserve quality rather than forcing poor mechanics.');
}

function bikeLongTempoInserts(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-long-tempo-3x20-r10', repeats: 3, workMinutes: 20, recoveryMinutes: 10,
    workLabel: 'controlled tempo', low: 5, high: 6, cue: 'Tempo inside a long aerobic ride',
    instruction: 'Complete 3 × 20 min at RPE 5–6 with 10 min easy between. Preserve fueling and position throughout; the separately listed aerobic finish contains the rest of the approved long-ride time.',
  });
}

function bikeLongRacePaceBlocks(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-long-race-pace-3x30-r10', repeats: 3, workMinutes: 30, recoveryMinutes: 10,
    workLabel: '70.3 race pressure', low: 5, high: 6, cue: 'Sustainable race-specific pressure',
    instruction: 'Ride 3 × 30 min at sustainable 70.3-specific pressure with 10 min easy between. Execute fueling as planned; the separately listed aerobic finish contains the rest of the approved long-ride time.',
  });
}

function bikeLongReducedAerobic(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-long-reduced-aerobic', 2, 4, 'Reduced aerobic durability', 'Keep the main set entirely easy aerobic. This is a recovery-week durability touch: shorten the ride, fuel normally, and finish fresher than you started.');
}

function bikeLongReducedSpecific(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-long-reduced-specific-2x20-r10', repeats: 2, workMinutes: 20, recoveryMinutes: 10,
    workLabel: 'race-specific touch', low: 5, high: 6, cue: 'Small specific dose, low fatigue',
    instruction: 'Ride 2 × 20 min at controlled race pressure with 10 min easy between. Keep everything else relaxed; the purpose is race feel without carrying fatigue forward.',
  });
}

function bikeLowCadenceAerobicStrength(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-support-low-cadence-5x5-r3', repeats: 5, workMinutes: 5, recoveryMinutes: 3,
    workLabel: 'low-cadence aerobic strength', low: 4, high: 5, cue: 'Firm torque, aerobic effort',
    instruction: 'Ride 5 × 5 min at controlled low cadence and RPE 4–5 with 3 min normal easy spinning between. Keep hips stable and avoid grinding.',
  });
}

function bikeSupportTempoInserts(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-support-tempo-3x10-r5', repeats: 3, workMinutes: 10, recoveryMinutes: 5,
    workLabel: 'tempo', low: 5, high: 6, cue: 'Small tempo dose inside aerobic support',
    instruction: 'Ride 3 × 10 min at RPE 5–6 with 5 min easy between. The separately listed aerobic finish stays easy; this is support work, not another key session.',
  });
}

function bikeSupportShortTempo(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-support-short-tempo-4x5-r5', repeats: 4, workMinutes: 5, recoveryMinutes: 5,
    workLabel: 'short tempo', low: 5, high: 6, cue: 'Race-relevant pressure, low cost',
    instruction: 'Ride 4 × 5 min at RPE 5–6 with 5 min easy between. Keep the separately listed aerobic finish relaxed so this supports rather than competes with the key workout.',
  });
}

function bikeCadenceEconomy(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return blocks.map((block) => {
    if (block.id !== 'main') return block;
    const repeats = Math.max(1, Math.floor(block.totalMinutes / 6));
    return {
      ...block, kind: 'intervals', shapeId: 'bike-support-cadence-economy', repeats,
      workMinutes: 5, recoveryMinutes: 1, workLabel: 'steady aerobic', recoveryLabel: 'quick cadence',
      target: { low: 2, high: 5, cue: 'Smooth cadence changes, no sprinting' },
      instruction: `Ride ${repeats} × [5 min steady aerobic + 1 min quick relaxed cadence]. Keep power controlled; the cadence minute is technique, not intensity.`,
    };
  });
}

function bikeRaceCadence(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-support-race-cadence', 2, 4, 'Lock in intended race cadence', 'Ride aerobically while spending long stretches at the cadence and position you expect to use on race day. Keep effort easy enough that technique stays automatic.');
}

function bikeRacePosition(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-support-race-position', 2, 4, 'Comfortable race position', 'Use the main set to accumulate comfortable time in race position at easy aerobic effort. Prioritize relaxed shoulders, stable hips, and smooth power.');
}

function bikeRollingEconomy(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-support-rolling-economy', 2, 5, 'Even aerobic effort', 'Ride over rolling terrain or changing resistance while keeping effort even. Let cadence and speed vary naturally without creating threshold surges.');
}

function bikeProgressiveAerobic(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeContinuousMain(blocks, 'bike-support-progressive-aerobic', 2, 5, 'Progress within aerobic range', 'Divide the main set into thirds: easy aerobic, steady aerobic, then firm aerobic. The final third should still feel controlled and sustainable.');
}

interface BikeIntervalShape {
  shapeId: string;
  repeats: number;
  workMinutes: number;
  recoveryMinutes: number;
  workLabel: string;
  recoveryLabel?: string;
  low: number;
  high: number;
  cue: string;
  instruction: string;
}

function bikeIntervals(
  blocks: EndurancePrescriptionBlock[],
  shape: BikeIntervalShape,
): EndurancePrescriptionBlock[] {
  return blocks.map((block) => {
    if (block.id !== 'main') return block;
    return {
      ...block,
      kind: 'intervals',
      shapeId: shape.shapeId,
      repeats: shape.repeats,
      workMinutes: shape.workMinutes,
      recoveryMinutes: shape.recoveryMinutes,
      workLabel: shape.workLabel,
      recoveryLabel: shape.recoveryLabel ?? 'easy spin',
      target: { low: shape.low, high: shape.high, cue: shape.cue },
      instruction: shape.instruction,
    };
  });
}

function bikeVo2SixByFour(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-vo2-6x4-r4',
    repeats: 6,
    workMinutes: 4,
    recoveryMinutes: 4,
    workLabel: 'VO2',
    low: 8,
    high: 9,
    cue: 'Hard, controlled, repeatable',
    instruction: 'Ride 6 × 4 min hard at RPE 8–9 with 4 min easy between. Do not sprint the first rep; aim to keep power and cadence from fading across the set. The separately listed aerobic finish completes the approved ride time.',
  });
}

function bikeVo2EightByTwo(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-vo2-8x2-r2',
    repeats: 8,
    workMinutes: 2,
    recoveryMinutes: 2,
    workLabel: 'short VO2',
    low: 8,
    high: 9,
    cue: 'Fast oxygen uptake, smooth form',
    instruction: 'Ride 8 × 2 min hard at RPE 8–9 with 2 min easy between. Keep the efforts sharp rather than maximal. The separately listed aerobic finish completes the approved ride time.',
  });
}

function bikeVo2FiveByFive(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-vo2-5x5-r5',
    repeats: 5,
    workMinutes: 5,
    recoveryMinutes: 5,
    workLabel: 'VO2',
    low: 8,
    high: 9,
    cue: 'Sustained high aerobic power',
    instruction: 'Ride 5 × 5 min at RPE 8–9 with 5 min easy between. Keep the first two controlled enough that the final repetition remains technically clean.',
  });
}

function bikeVo2SixByThree(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-vo2-6x3-r3',
    repeats: 6,
    workMinutes: 3,
    recoveryMinutes: 3,
    workLabel: 'VO2 sharpening',
    low: 8,
    high: 9,
    cue: 'Sharp, not desperate',
    instruction: 'Ride 6 × 3 min hard at RPE 8–9 with 3 min easy between. This is a sharpening set: finish with another good repetition still possible.',
  });
}

function bikeTempoAerobicStrength(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-tempo-3x15-r5',
    repeats: 3,
    workMinutes: 15,
    recoveryMinutes: 5,
    workLabel: 'upper aerobic / tempo',
    low: 5,
    high: 6,
    cue: 'Firm pressure, low drama',
    instruction: 'Ride 3 × 15 min at upper-aerobic/tempo effort (RPE 5–6) with 5 min easy between. Keep cadence and position steady; the separately listed aerobic finish completes the approved ride time.',
  });
}

function bikeCruiseControl(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-threshold-cruise-4x10-r5',
    repeats: 4,
    workMinutes: 10,
    recoveryMinutes: 5,
    workLabel: 'controlled threshold',
    low: 6,
    high: 7,
    cue: 'Controlled, repeatable threshold',
    instruction: 'Ride 4 × 10 min at controlled threshold (RPE 6–7) with 5 min easy between. The final rep should look like the first rather than becoming a test; the separately listed aerobic finish completes the approved ride time.',
  });
}

function bikeThresholdThreeByTwelve(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-threshold-3x12-r4',
    repeats: 3,
    workMinutes: 12,
    recoveryMinutes: 4,
    workLabel: 'threshold',
    low: 7,
    high: 8,
    cue: 'Even pressure across all three',
    instruction: 'Ride 3 × 12 min at RPE 7–8 with 4 min easy between. Hold the same controlled output across all three reps; the separately listed aerobic finish completes the approved ride time.',
  });
}

function bikeThresholdThreeByTen(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-threshold-3x10-r5',
    repeats: 3,
    workMinutes: 10,
    recoveryMinutes: 5,
    workLabel: 'threshold sharpening',
    low: 7,
    high: 8,
    cue: 'Strong but race-season controlled',
    instruction: 'Ride 3 × 10 min at RPE 7–8 with 5 min easy between. Keep the work strong and smooth rather than chasing a maximal number.',
  });
}

function bikeOverUnderFourByTen(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-over-under-4x10-r5',
    repeats: 4,
    workMinutes: 10,
    recoveryMinutes: 5,
    workLabel: 'over / under',
    low: 5,
    high: 8,
    cue: 'Change pressure without surging',
    instruction: 'Ride 4 × 10 min as 2 rounds of [2 min strong at RPE 7–8 + 3 min steady at RPE 5–6]. Take 5 min easy between blocks; the separately listed aerobic finish completes the approved ride time.',
  });
}

function bikeOverUnderThreeByTwelve(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-over-under-3x12-r5',
    repeats: 3,
    workMinutes: 12,
    recoveryMinutes: 5,
    workLabel: 'over / under',
    low: 5,
    high: 8,
    cue: 'Absorb surges, settle quickly',
    instruction: 'Ride 3 × 12 min alternating 2 min strong at RPE 7–8 with 2 min steady at RPE 5–6. Take 5 min easy between blocks; settle quickly after every surge.',
  });
}

function bikeRacePaceThreeByFifteen(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-race-pace-3x15-r5',
    repeats: 3,
    workMinutes: 15,
    recoveryMinutes: 5,
    workLabel: '70.3-specific steady work',
    low: 5,
    high: 6,
    cue: 'Sustainable race-day pressure',
    instruction: 'Ride 3 × 15 min at controlled 70.3-specific pressure (RPE 5–6) with 5 min easy between. Practice position, fueling rhythm, and smooth output rather than pushing toward threshold.',
  });
}

function bikeRacePaceSurges(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return bikeIntervals(blocks, {
    shapeId: 'bike-race-pace-surges-4x10-r5',
    repeats: 4,
    workMinutes: 10,
    recoveryMinutes: 5,
    workLabel: 'race pace + surge',
    low: 5,
    high: 8,
    cue: 'Return to race pressure after each surge',
    instruction: 'Ride 4 × 10 min mostly at RPE 5–6 with a 1 min surge at RPE 7–8 every 5 min. Take 5 min easy between blocks and focus on settling immediately back into sustainable race pressure.',
  });
}

function runFartlek(blocks: EndurancePrescriptionBlock[]): EndurancePrescriptionBlock[] {
  return blocks.map((block) => {
    if (block.id !== 'main') return block;
    const repeats = Math.max(1, Math.floor(block.totalMinutes / 6));
    return {
      ...block,
      kind: 'intervals',
      shapeId: 'run-fartlek-3-1-2',
      repeats,
      workMinutes: 3,
      recoveryMinutes: 3,
      workLabel: 'steady + quick',
      recoveryLabel: 'easy',
      target: { low: 3, high: 6, cue: 'Fluid changes of pace' },
      instruction: `Run ${repeats} × [3 min steady + 1 min quick + 2 min easy] continuously. Change gears by feel and keep the quick minute controlled.`,
    };
  });
}

function tagMain(blocks: EndurancePrescriptionBlock[], shapeId: string): EndurancePrescriptionBlock[] {
  return blocks.map((block) => block.id === 'main' ? { ...block, shapeId } : block);
}
