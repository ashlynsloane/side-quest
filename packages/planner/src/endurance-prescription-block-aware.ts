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
    if (title.includes('cadence change-up') || title.includes('fartlek')) blocks = bikeFartlek(blocks);
    else if (title.includes('progressive finish')) blocks = tagMain(blocks, 'bike-progressive-thirds');
    else if (title.includes('rolling endurance')) blocks = tagMain(blocks, 'bike-rolling-endurance');
    else if (title.includes('strong finish')) blocks = tagMain(blocks, 'bike-strong-finish');
    else if (title.includes('over / under')) blocks = tagMain(blocks, 'bike-over-under');
  } else if (session.discipline === 'run' && !title.includes('return-to-run')) {
    if (title.includes('change of pace') || title.includes('fartlek')) blocks = runFartlek(blocks);
    else if (title.includes('negative split')) blocks = tagMain(blocks, 'run-negative-split');
    else if (title.includes('rolling rhythm')) blocks = tagMain(blocks, 'run-rolling-rhythm');
    else if (title.includes('fast finish')) blocks = tagMain(blocks, 'run-fast-finish');
  }

  return {
    ...base,
    blocks,
    steps: blocks.map((block) => ({
      label: block.label,
      minutes: block.totalMinutes,
      effort: `RPE ${block.target.low}–${block.target.high}`,
      instruction: block.instruction,
    })),
  };
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
