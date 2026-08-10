import type { GoalTerrain } from '@circuit/domain';
import type { PlannedMultisportSession } from './multisport';

export type EnduranceWorkoutType =
  | 'swim_technique'
  | 'swim_aerobic'
  | 'swim_endurance'
  | 'swim_quality'
  | 'bike_recovery'
  | 'bike_aerobic'
  | 'bike_long_aerobic'
  | 'bike_quality_intervals'
  | 'run_recovery'
  | 'run_easy_aerobic'
  | 'run_long_aerobic'
  | 'run_quality_intervals'
  | 'run_return_to_run';

export type EnduranceBlockKind = 'continuous' | 'intervals' | 'drill' | 'walk_run' | 'swim_set';
export type SwimDistanceUnit = 'yd' | 'm';
export type SwimEnvironment = 'pool' | 'open_water';
export type RunEnvironment = 'outdoor' | 'treadmill' | 'track' | 'trail';
export type BikeEnvironment = 'outdoor' | 'indoor_trainer' | 'mountain_bike';

export interface EnduranceRpeTarget {
  low: number;
  high: number;
  cue: string;
}

export interface EndurancePaceTarget {
  unit: SwimDistanceUnit;
  fastSecondsPer100: number;
  slowSecondsPer100: number;
  basis: 'css';
}

export interface ReturnToRunProtocol {
  warmupWalkMinutes: number;
  repeats: number;
  runMinutes: number;
  walkMinutes: number;
  cooldownWalkMinutes: number;
}

export interface EndurancePrescriptionContext {
  goalTerrain?: GoalTerrain;
  swim?: {
    environment?: SwimEnvironment;
    poolLength?: 25 | 50;
    distanceUnit?: SwimDistanceUnit;
    cssSecondsPer100?: number;
    proficiency?: 'developing' | 'average' | 'strong';
  };
  bike?: {
    environment?: BikeEnvironment;
  };
  run?: {
    environment?: RunEnvironment;
    returnToRunProtocol?: ReturnToRunProtocol;
  };
}

export interface EndurancePrescriptionBlock {
  id: string;
  label: string;
  kind: EnduranceBlockKind;
  /** Estimated time retained for weekly-budget compatibility. */
  totalMinutes: number;
  target: EnduranceRpeTarget;
  instruction: string;
  repeats?: number;
  workMinutes?: number;
  recoveryMinutes?: number;
  workLabel?: string;
  recoveryLabel?: string;
  totalDistance?: number;
  repeatDistance?: number;
  distanceUnit?: SwimDistanceUnit;
  restSeconds?: number;
  paceTarget?: EndurancePaceTarget;
}

export interface EndurancePrescriptionStep {
  label: string;
  minutes: number;
  effort: string;
  instruction: string;
}

export interface EnduranceSessionPrescription {
  prescriptionVersion: 2;
  sessionId: string;
  discipline: 'swim' | 'bike' | 'run';
  workoutType: EnduranceWorkoutType;
  title: string;
  date: string;
  totalMinutes: number;
  totalDistance?: number;
  distanceUnit?: SwimDistanceUnit;
  environmentLabel?: string;
  objective: string;
  effortGuide: string;
  blocks: EndurancePrescriptionBlock[];
  /** Backward-compatible simplified representation used by existing surfaces. */
  steps: EndurancePrescriptionStep[];
  whyThisSession: string[];
  guardrails: string[];
  setupRequired?: 'return_to_run_protocol';
}

interface SessionSplit {
  warmup: number;
  main: number;
  cooldown: number;
}

interface RepeatPlan {
  repeats: number;
  workMinutes: number;
  recoveryMinutes: number;
  usedMinutes: number;
}

export function returnToRunProtocolMinutes(protocol: ReturnToRunProtocol): number {
  const recoveryCount = Math.max(0, protocol.repeats - 1);
  return Math.max(1,
    protocol.warmupWalkMinutes
      + protocol.repeats * protocol.runMinutes
      + recoveryCount * protocol.walkMinutes
      + protocol.cooldownWalkMinutes);
}

/**
 * Generated endurance work should read like a coach wrote it, not like a
 * floating-point budget calculation. Athlete-fixed return-to-run stages remain exact.
 */
export function canonicalEnduranceMinutes(minutes: number): number {
  return Math.max(10, Math.round(minutes / 5) * 5);
}

export function buildEndurancePrescription(
  session: PlannedMultisportSession,
  context: EndurancePrescriptionContext = {},
): EnduranceSessionPrescription | null {
  if (session.discipline !== 'swim' && session.discipline !== 'bike' && session.discipline !== 'run') return null;

  const workoutType = inferWorkoutType(session);
  const protocol = workoutType === 'run_return_to_run' ? validReturnToRunProtocol(context.run?.returnToRunProtocol) : undefined;
  const total = protocol ? returnToRunProtocolMinutes(protocol) : canonicalEnduranceMinutes(session.durationMinutes);
  const normalizedSession = total === session.durationMinutes ? session : { ...session, durationMinutes: total };
  const split = splitSession(total, session.discipline);
  const blocks = buildBlocks(normalizedSession, workoutType, split, context, protocol);
  const steps = blocks.map(blockToStep);
  const distanceBlocks = blocks.filter((item) => item.distanceUnit && item.totalDistance);
  const distanceUnit = distanceBlocks[0]?.distanceUnit;
  const totalDistance = distanceUnit
    ? distanceBlocks.filter((item) => item.distanceUnit === distanceUnit).reduce((sum, item) => sum + (item.totalDistance ?? 0), 0)
    : undefined;
  const setupRequired = workoutType === 'run_return_to_run' && !protocol ? 'return_to_run_protocol' as const : undefined;

  return {
    prescriptionVersion: 2,
    sessionId: session.id,
    discipline: session.discipline,
    workoutType,
    title: session.title,
    date: session.date,
    totalMinutes: total,
    ...(totalDistance ? { totalDistance, distanceUnit } : {}),
    environmentLabel: environmentLabel(session.discipline, context),
    objective: objectiveFor(workoutType),
    effortGuide: effortGuideFor(session, workoutType, context, Boolean(protocol)),
    blocks,
    steps,
    whyThisSession: session.rationale,
    guardrails: guardrailsFor(session, workoutType, context, Boolean(protocol)),
    ...(setupRequired ? { setupRequired } : {}),
  };
}

function splitSession(total: number, discipline: 'swim' | 'bike' | 'run'): SessionSplit {
  if (total <= 20) return { warmup: 5, main: Math.max(10, total - 10), cooldown: 5 };

  let warmup: number;
  let cooldown: number;
  if (discipline === 'bike') {
    warmup = total >= 75 ? 15 : total >= 45 ? 10 : 5;
    cooldown = total >= 90 ? 15 : total >= 45 ? 10 : 5;
  } else if (discipline === 'run') {
    warmup = total >= 40 ? 10 : 5;
    cooldown = total >= 40 ? 10 : 5;
  } else {
    warmup = total >= 45 ? 10 : 5;
    cooldown = total >= 45 ? 10 : 5;
  }

  if (warmup + cooldown >= total) {
    warmup = 5;
    cooldown = 5;
  }
  return { warmup, main: Math.max(5, total - warmup - cooldown), cooldown };
}

function inferWorkoutType(session: PlannedMultisportSession): EnduranceWorkoutType {
  const title = session.title.toLowerCase();
  if (session.discipline === 'swim') {
    if (title.includes('technique')) return 'swim_technique';
    if (title.includes('quality') || title.includes('interval') || title.includes('threshold') || session.intensity === 'hard') return 'swim_quality';
    if (title.includes('endurance')) return 'swim_endurance';
    return 'swim_aerobic';
  }
  if (session.discipline === 'bike') {
    if (title.includes('recovery')) return 'bike_recovery';
    if (title.includes('quality') || title.includes('interval') || title.includes('tempo') || title.includes('threshold') || session.intensity === 'hard') return 'bike_quality_intervals';
    if (title.includes('long')) return 'bike_long_aerobic';
    return 'bike_aerobic';
  }
  if (title.includes('return-to-run')) return 'run_return_to_run';
  if (title.includes('recovery')) return 'run_recovery';
  if (title.includes('quality') || title.includes('interval') || title.includes('tempo') || title.includes('threshold') || session.intensity === 'hard') return 'run_quality_intervals';
  if (title.includes('long')) return 'run_long_aerobic';
  return 'run_easy_aerobic';
}

function objectiveFor(type: EnduranceWorkoutType): string {
  if (type === 'swim_technique') return 'Technique and economical movement';
  if (type === 'swim_endurance' || type === 'bike_long_aerobic' || type === 'run_long_aerobic') return 'Aerobic durability';
  if (type === 'swim_quality' || type === 'bike_quality_intervals' || type === 'run_quality_intervals') return 'Controlled quality work';
  if (type === 'run_return_to_run') return 'Return-to-run exposure';
  if (type === 'bike_recovery' || type === 'run_recovery') return 'Recovery and circulation';
  return 'Aerobic development';
}

function effortGuideFor(
  session: PlannedMultisportSession,
  type: EnduranceWorkoutType,
  context: EndurancePrescriptionContext,
  hasReturnProtocol: boolean,
): string {
  if (type === 'run_return_to_run') {
    return hasReturnProtocol
      ? 'Keep every run segment comfortable. The prescribed run/walk stage controls the impact dose.'
      : 'Side Quest needs an explicit run/walk stage before it will prescribe running during return-to-run.';
  }
  if (session.discipline === 'swim' && validCss(context.swim?.cssSecondsPer100)) {
    return 'Use the CSS-based pace ranges shown for the main sets; keep drills technique-led rather than pace-led.';
  }
  if (session.intensity === 'easy') return 'Easy conversational effort; roughly RPE 2–4/10.';
  if (session.intensity === 'moderate') return 'Controlled steady effort; roughly RPE 4–6/10.';
  return 'Purposeful hard work with recovery between efforts; roughly RPE 7–8/10, not all-out.';
}

function rpe(low: number, high: number, cue: string): EnduranceRpeTarget {
  return { low, high, cue };
}

function block(
  id: string,
  label: string,
  kind: EnduranceBlockKind,
  totalMinutes: number,
  target: EnduranceRpeTarget,
  instruction: string,
  extra: Partial<Omit<EndurancePrescriptionBlock, 'id' | 'label' | 'kind' | 'totalMinutes' | 'target' | 'instruction'>> = {},
): EndurancePrescriptionBlock {
  return { id, label, kind, totalMinutes, target, instruction, ...extra };
}

function buildBlocks(
  session: PlannedMultisportSession,
  workoutType: EnduranceWorkoutType,
  split: SessionSplit,
  context: EndurancePrescriptionContext,
  protocol?: ReturnToRunProtocol,
): EndurancePrescriptionBlock[] {
  if (session.discipline === 'swim') {
    if ((context.swim?.environment ?? 'pool') === 'pool') return swimPoolBlocks(workoutType, session.durationMinutes, context);
    return swimOpenWaterBlocks(workoutType, split);
  }
  if (session.discipline === 'bike') return bikeBlocks(workoutType, split, context);
  return runBlocks(workoutType, split, context, protocol);
}

function swimPoolBlocks(
  type: EnduranceWorkoutType,
  totalMinutes: number,
  context: EndurancePrescriptionContext,
): EndurancePrescriptionBlock[] {
  const unit = context.swim?.distanceUnit ?? 'yd';
  const poolLength = context.swim?.poolLength ?? 25;
  const css = validCss(context.swim?.cssSecondsPer100) ? context.swim!.cssSecondsPer100 : undefined;
  const proficiency = context.swim?.proficiency ?? 'average';
  const estimatePer100 = css ?? (proficiency === 'strong' ? 90 : proficiency === 'developing' ? 125 : 105);
  const movingFraction = type === 'swim_quality' || type === 'swim_technique' ? 0.8 : 0.84;
  const rawDistance = (Math.max(20, totalMinutes) * 60 * movingFraction / estimatePer100) * 100;
  const targetDistance = Math.max(poolLength * 24, roundToMultiple(rawDistance, Math.max(100, poolLength)));
  const warmDistance = clampDistance(roundToMultiple(targetDistance * 0.18, 100), 200, 500, poolLength);
  const coolDistance = clampDistance(roundToMultiple(targetDistance * 0.1, 100), 100, 300, poolLength);
  const mainDistance = Math.max(poolLength * 8, targetDistance - warmDistance - coolDistance);
  const blocks: EndurancePrescriptionBlock[] = [];

  blocks.push(swimDistanceBlock(
    'warmup', 'Warm-up', 'swim_set', warmDistance, unit, rpe(2, 3, 'Relaxed'),
    'Swim easy. Include a few relaxed build lengths near the end, but keep the focus on line, breathing, and a clean catch.',
    cssPace(css, unit, 18, 28),
  ));

  if (type === 'swim_technique') {
    // Technique sets should look intentional: 4, 6, or 8 x 50 rather than a remainder-driven odd count.
    const desiredDrillDistance = Math.max(200, Math.min(400, mainDistance * 0.35));
    const drillDistance = Math.min(mainDistance, roundToMultiple(desiredDrillDistance, 100));
    const drillRepeats = Math.max(4, Math.min(8, Math.floor(drillDistance / 50)));
    const usedDrill = drillRepeats * 50;
    blocks.push(swimDistanceBlock(
      'technique', 'Drill set', 'drill', usedDrill, unit, rpe(2, 4, 'Form first'),
      'Alternate a focused drill length with relaxed swimming. Prioritize body line, breathing timing, and catch quality over speed.',
      undefined,
      { repeats: drillRepeats, repeatDistance: 50, restSeconds: 15 },
    ));
    appendSwimMain(blocks, mainDistance - usedDrill, unit, css, 'aerobic');
  } else if (type === 'swim_quality') {
    const repeatDistance = mainDistance >= 1000 ? 200 : 100;
    const maxRepeats = repeatDistance === 200 ? 6 : 10;
    const repeats = Math.max(4, Math.min(maxRepeats, Math.floor(mainDistance / repeatDistance)));
    const used = repeats * repeatDistance;
    blocks.push(swimDistanceBlock(
      'main', 'Main set', 'swim_set', used, unit, rpe(6, 8, 'Strong and repeatable'),
      'Hold the target pace without sacrificing stroke length or catch quality. The final repeat should still be controlled.',
      cssPace(css, unit, 0, 6),
      { repeats, repeatDistance, restSeconds: repeatDistance >= 200 ? 25 : 20 },
    ));
    appendSwimMain(blocks, mainDistance - used, unit, css, 'easy');
  } else if (type === 'swim_endurance') {
    const repeatDistance = mainDistance >= 1200 ? 400 : mainDistance >= 800 ? 300 : 200;
    const repeats = Math.max(2, Math.min(5, Math.floor(mainDistance / repeatDistance)));
    const used = repeats * repeatDistance;
    blocks.push(swimDistanceBlock(
      'main', 'Main set', 'swim_set', used, unit, rpe(3, 5, 'Sustainable'),
      'Swim each repeat at a steady aerobic effort with short rest. Preserve mechanics as fatigue accumulates.',
      cssPace(css, unit, 8, 15),
      { repeats, repeatDistance, restSeconds: 20 },
    ));
    appendSwimMain(blocks, mainDistance - used, unit, css, 'easy');
  } else {
    const repeatDistance = mainDistance >= 1200 ? 400 : mainDistance >= 900 ? 300 : 200;
    const repeats = Math.max(2, Math.min(6, Math.floor(mainDistance / repeatDistance)));
    const used = repeats * repeatDistance;
    blocks.push(swimDistanceBlock(
      'main', 'Main set', 'swim_set', used, unit, rpe(3, 5, 'Aerobic'),
      'Swim steadily with controlled breathing and consistent mechanics. Keep the rest short enough to preserve aerobic continuity.',
      cssPace(css, unit, 10, 18),
      { repeats, repeatDistance, restSeconds: 15 },
    ));
    appendSwimMain(blocks, mainDistance - used, unit, css, 'easy');
  }

  blocks.push(swimDistanceBlock(
    'cooldown', 'Cool-down', 'swim_set', coolDistance, unit, rpe(1, 2, 'Very easy'),
    'Swim very easy and finish with relaxed mechanics.', undefined,
  ));

  return assignMinutesByDistance(blocks, canonicalEnduranceMinutes(totalMinutes));
}

function swimDistanceBlock(
  id: string,
  label: string,
  kind: EnduranceBlockKind,
  totalDistance: number,
  distanceUnit: SwimDistanceUnit,
  target: EnduranceRpeTarget,
  instruction: string,
  paceTarget?: EndurancePaceTarget,
  extra: Partial<EndurancePrescriptionBlock> = {},
): EndurancePrescriptionBlock {
  return block(id, label, kind, 0, target, instruction, {
    totalDistance,
    distanceUnit,
    ...(paceTarget ? { paceTarget } : {}),
    ...extra,
  });
}

function appendSwimMain(
  blocks: EndurancePrescriptionBlock[],
  distance: number,
  unit: SwimDistanceUnit,
  css: number | undefined,
  effort: 'aerobic' | 'easy',
): void {
  if (distance < 50) return;
  const rounded = roundToMultiple(distance, 50);
  if (rounded <= 0) return;
  const repeatDistance = rounded >= 400 ? 200 : rounded >= 200 ? 100 : rounded;
  const repeats = Math.max(1, Math.floor(rounded / repeatDistance));
  const used = repeats * repeatDistance;
  blocks.push(swimDistanceBlock(
    `finish-${blocks.length}`, effort === 'aerobic' ? 'Aerobic finish' : 'Easy reset', 'swim_set', used, unit,
    effort === 'aerobic' ? rpe(3, 5, 'Aerobic') : rpe(2, 3, 'Easy'),
    effort === 'aerobic' ? 'Settle into smooth aerobic swimming and preserve stroke quality.' : 'Swim easy to absorb the main set without adding more intensity.',
    effort === 'aerobic' ? cssPace(css, unit, 10, 18) : cssPace(css, unit, 18, 28),
    repeats > 1 ? { repeats, repeatDistance, restSeconds: 15 } : {},
  ));
}

function swimOpenWaterBlocks(type: EnduranceWorkoutType, split: SessionSplit): EndurancePrescriptionBlock[] {
  const blocks = [block('warmup', 'Warm-up', 'continuous', split.warmup, rpe(2, 3, 'Relaxed'), 'Swim easy while settling breathing, sighting, and body position.')];
  if (type === 'swim_quality') {
    const plan = repeatPlan(split.main, 6, 3, 1);
    if (plan) blocks.push(block('main', 'Main set', 'intervals', plan.usedMinutes, rpe(6, 8, 'Strong and controlled'), `Complete ${plan.repeats} × ${plan.workMinutes} min strong with ${plan.recoveryMinutes} min easy swimming between. Use effort rather than pool pace in open water.`, { repeats: plan.repeats, workMinutes: plan.workMinutes, recoveryMinutes: plan.recoveryMinutes }));
    if (plan && split.main > plan.usedMinutes) blocks.push(block('aerobic-finish', 'Aerobic finish', 'continuous', split.main - plan.usedMinutes, rpe(2, 4, 'Aerobic'), 'Swim smoothly with regular sighting and relaxed mechanics.'));
    if (!plan) blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(3, 5, 'Aerobic'), 'Swim steadily with regular sighting and relaxed mechanics.'));
  } else {
    blocks.push(block('main', type === 'swim_technique' ? 'Skills + aerobic' : 'Main set', 'continuous', split.main, rpe(3, 5, 'Controlled'), type === 'swim_technique' ? 'Practice sighting, breathing rhythm, and a relaxed stroke while keeping the effort aerobic.' : 'Swim steadily at an aerobic effort and keep navigation clean.'));
  }
  blocks.push(block('cooldown', 'Cool-down', 'continuous', split.cooldown, rpe(1, 2, 'Very easy'), 'Swim very easy and finish relaxed.'));
  return blocks;
}

function bikeBlocks(type: EnduranceWorkoutType, split: SessionSplit, context: EndurancePrescriptionContext): EndurancePrescriptionBlock[] {
  const indoor = context.bike?.environment === 'indoor_trainer';
  const terrain = context.goalTerrain;
  const blocks = [block('warmup', 'Warm-up', 'continuous', split.warmup, rpe(2, 3, 'Easy spin'), indoor ? 'Spin easily and gradually bring cadence up before the main work.' : 'Ride easily and gradually bring cadence and effort up without surging.')];
  if (type === 'bike_quality_intervals') {
    const plan = repeatPlan(split.main, 4, split.main >= 40 ? 6 : 5, 3);
    if (plan) {
      const terrainCue = !indoor && (terrain === 'hilly' || terrain === 'mountainous')
        ? ' Use sustained climbs for the work intervals and recover easily on flatter/downhill terrain.'
        : indoor
          ? ' Keep resistance controlled and cadence repeatable on the trainer.'
          : '';
      blocks.push(block('main', 'Main set', 'intervals', plan.usedMinutes, rpe(6, 8, 'Controlled quality'), `Complete ${plan.repeats} × ${plan.workMinutes} min controlled hard with ${plan.recoveryMinutes} min easy between.${terrainCue}`, { repeats: plan.repeats, workMinutes: plan.workMinutes, recoveryMinutes: plan.recoveryMinutes }));
      appendTimedRemainder(blocks, split.main - plan.usedMinutes, 'bike');
    } else appendTimedRemainder(blocks, split.main, 'bike');
  } else if (type === 'bike_long_aerobic') {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(3, 5, 'Durable aerobic'), terrain === 'hilly' || terrain === 'mountainous' ? 'Ride steadily across the terrain. Let speed fall on climbs rather than turning them into threshold efforts.' : 'Ride steadily at sustainable aerobic intensity. Avoid turning the long ride into an unplanned threshold session.'));
  } else if (type === 'bike_recovery') {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(1, 2, 'Recovery'), 'Spin very easily. This session should reduce stiffness, not create additional training stress.'));
  } else {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(2, 4, 'Easy aerobic'), 'Ride at an easy-to-steady aerobic effort with smooth cadence and minimal surging.'));
  }
  blocks.push(block('cooldown', 'Cool-down', 'continuous', split.cooldown, rpe(1, 2, 'Easy spin'), 'Spin easily until breathing and leg tension settle.'));
  return blocks;
}

function runBlocks(
  type: EnduranceWorkoutType,
  split: SessionSplit,
  context: EndurancePrescriptionContext,
  protocol?: ReturnToRunProtocol,
): EndurancePrescriptionBlock[] {
  if (type === 'run_return_to_run') return returnToRunBlocks(split, protocol);

  const environment = context.run?.environment ?? (context.goalTerrain === 'technical_trail' ? 'trail' : 'outdoor');
  const terrain = context.goalTerrain;
  const warmCue = environment === 'treadmill' ? 'Start with easy walking/jogging on the treadmill and let mechanics settle.' : 'Start very easily and let mechanics and breathing settle.';
  const blocks = [block('warmup', 'Warm-up', 'continuous', split.warmup, rpe(1, 3, 'Easy'), warmCue)];

  if (type === 'run_quality_intervals') {
    const plan = repeatPlan(split.main, 4, split.main >= 28 ? 5 : 4, 2);
    if (plan) {
      const hilly = terrain === 'hilly' || terrain === 'mountainous';
      const technical = terrain === 'technical_trail' || environment === 'trail';
      const instruction = hilly
        ? `Complete ${plan.repeats} × ${plan.workMinutes} min uphill at controlled hard effort with ${plan.recoveryMinutes} min easy recovery. Run the climb by RPE, not pace.`
        : technical
          ? `Complete ${plan.repeats} × ${plan.workMinutes} min controlled on runnable trail with ${plan.recoveryMinutes} min easy between. Use RPE rather than pace when footing or grade changes.`
          : environment === 'treadmill'
            ? `Complete ${plan.repeats} × ${plan.workMinutes} min controlled with ${plan.recoveryMinutes} min easy. Keep speed/grade repeatable rather than chasing a faster final rep.`
            : `Complete ${plan.repeats} × ${plan.workMinutes} min controlled with ${plan.recoveryMinutes} min easy running between. Maintain mechanics and finish with reserve.`;
      blocks.push(block('main', hilly ? 'Hill set' : 'Main set', 'intervals', plan.usedMinutes, rpe(6, 8, 'Fast but controlled'), instruction, { repeats: plan.repeats, workMinutes: plan.workMinutes, recoveryMinutes: plan.recoveryMinutes }));
      appendTimedRemainder(blocks, split.main - plan.usedMinutes, 'run');
    } else appendTimedRemainder(blocks, split.main, 'run');
  } else if (type === 'run_long_aerobic') {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(2, 4, 'Conversational'), runTerrainInstruction(terrain, environment, true)));
  } else if (type === 'run_recovery') {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(1, 3, 'Very easy'), 'Keep the run deliberately short and easy. Finish with less tension than you started.'));
  } else {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(2, 4, 'Conversational'), runTerrainInstruction(terrain, environment, false)));
  }
  blocks.push(block('cooldown', 'Cool-down', 'continuous', split.cooldown, rpe(1, 2, 'Very easy'), 'Walk or jog very easily to finish without adding extra volume.'));
  return blocks;
}

function returnToRunBlocks(split: SessionSplit, protocol?: ReturnToRunProtocol): EndurancePrescriptionBlock[] {
  if (!protocol) {
    return [block(
      'protocol-required', 'Run/walk stage needed', 'walk_run', split.warmup + split.main + split.cooldown,
      rpe(1, 2, 'Do not guess'),
      'No run/walk stage is configured. Set the return-to-run stage you have been cleared to perform; Side Quest will not invent impact progression.',
    )];
  }
  const mainMinutes = protocol.repeats * protocol.runMinutes + Math.max(0, protocol.repeats - 1) * protocol.walkMinutes;
  return [
    block('warmup', 'Walk warm-up', 'continuous', protocol.warmupWalkMinutes, rpe(1, 2, 'Brisk walk'), 'Walk only. Use this time to settle into normal, comfortable mechanics.', { workLabel: 'walk' }),
    block('main', 'Run / walk set', 'walk_run', mainMinutes, rpe(2, 4, 'Comfortable'), `Complete ${protocol.repeats} × ${protocol.runMinutes} min easy run with ${protocol.walkMinutes} min walk between run segments. Do not extend the run intervals even if they feel easy.`, {
      repeats: protocol.repeats,
      workMinutes: protocol.runMinutes,
      recoveryMinutes: protocol.walkMinutes,
      workLabel: 'run',
      recoveryLabel: 'walk',
    }),
    block('cooldown', 'Walk cool-down', 'continuous', protocol.cooldownWalkMinutes, rpe(1, 2, 'Easy walk'), 'Walk only to finish. Do not add extra running.', { workLabel: 'walk' }),
  ];
}

function runTerrainInstruction(terrain: GoalTerrain | undefined, environment: RunEnvironment, long: boolean): string {
  if (environment === 'treadmill') return long ? 'Run at conversational effort on the treadmill. Keep grade changes modest enough that the session stays aerobic.' : 'Run easily on the treadmill at conversational effort; keep speed and grade controlled.';
  if (terrain === 'technical_trail' || environment === 'trail') return 'Run by effort rather than pace. Shorten stride on technical terrain and let pace change with footing and grade.';
  if (terrain === 'mountainous' || terrain === 'hilly') return long ? 'Keep the entire route aerobic. Let pace slow substantially on climbs and avoid pressing the descents.' : 'Keep the effort conversational across hills; let pace change with grade instead of forcing flat-ground pace uphill.';
  if (terrain === 'rolling') return 'Run easily across rolling terrain and keep effort steady as pace changes with grade.';
  if (environment === 'track') return 'Keep the run easy on the track; the surface is controlled, but this is not a pace test.';
  return long ? 'Run at a sustainable conversational effort. Duration should reflect established run capacity rather than goal-distance ambition.' : 'Run easily at conversational effort and keep the session deliberately low-cost.';
}

function repeatPlan(mainMinutes: number, preferredRepeats: number, preferredWork: number, recoveryMinutes: number): RepeatPlan | null {
  for (let work = preferredWork; work >= 2; work -= 1) {
    for (let repeats = preferredRepeats; repeats >= 2; repeats -= 1) {
      const usedMinutes = repeats * work + (repeats - 1) * recoveryMinutes;
      if (usedMinutes <= mainMinutes) return { repeats, workMinutes: work, recoveryMinutes, usedMinutes };
    }
  }
  return null;
}

function appendTimedRemainder(blocks: EndurancePrescriptionBlock[], minutes: number, discipline: 'bike' | 'run'): void {
  if (minutes <= 0) return;
  blocks.push(block('aerobic-finish', 'Aerobic finish', 'continuous', minutes, rpe(2, 4, 'Aerobic'), discipline === 'bike' ? 'Ride steadily at an easy aerobic effort with smooth cadence.' : 'Run easily and keep this deliberately low-cost.'));
}

function blockToStep(item: EndurancePrescriptionBlock): EndurancePrescriptionStep {
  const effort = item.target.low === item.target.high ? `RPE ${item.target.low}` : `RPE ${item.target.low}–${item.target.high}`;
  return { label: item.label, minutes: item.totalMinutes, effort, instruction: item.instruction };
}

function guardrailsFor(
  session: PlannedMultisportSession,
  type: EnduranceWorkoutType,
  context: EndurancePrescriptionContext,
  hasReturnProtocol: boolean,
): string[] {
  const common = [
    'Do not add time or intensity simply because the session feels easy.',
    'Pain, illness, unusual fatigue, or an active restriction overrides the written workout.',
    'A missed or shortened session does not create training debt that must be repaid later in the week.',
  ];
  if (session.discipline === 'swim' && validCss(context.swim?.cssSecondsPer100)) common.unshift('CSS pace is a training target, not a requirement to force pace when mechanics deteriorate.');
  if (session.discipline === 'run') common.unshift('Run volume must stay within the active running/return-to-run policy and established impact tolerance.');
  if (type === 'run_return_to_run') common.unshift(hasReturnProtocol ? 'Follow the configured run/walk stage exactly; progression to another stage is a separate decision.' : 'No running is prescribed until an explicit return-to-run stage is configured.');
  return common;
}

function environmentLabel(discipline: 'swim' | 'bike' | 'run', context: EndurancePrescriptionContext): string | undefined {
  if (discipline === 'swim') {
    if ((context.swim?.environment ?? 'pool') === 'open_water') return 'Open water';
    const length = context.swim?.poolLength ?? 25;
    const unit = context.swim?.distanceUnit ?? 'yd';
    return `${length} ${unit} pool`;
  }
  if (discipline === 'bike') {
    if (context.bike?.environment === 'indoor_trainer') return 'Indoor trainer';
    if (context.bike?.environment === 'mountain_bike') return 'Mountain bike';
    return terrainLabel(context.goalTerrain, 'Outdoor ride');
  }
  if (context.run?.environment === 'treadmill') return 'Treadmill';
  if (context.run?.environment === 'track') return 'Track';
  if (context.run?.environment === 'trail') return terrainLabel(context.goalTerrain, 'Trail');
  return terrainLabel(context.goalTerrain, 'Outdoor run');
}

function terrainLabel(terrain: GoalTerrain | undefined, fallback: string): string {
  if (terrain === 'technical_trail') return 'Technical trail';
  if (terrain === 'mountainous') return 'Mountainous';
  if (terrain === 'hilly') return 'Hilly';
  if (terrain === 'rolling') return 'Rolling';
  if (terrain === 'flat') return 'Flat';
  return fallback;
}

function validReturnToRunProtocol(protocol: ReturnToRunProtocol | undefined): ReturnToRunProtocol | undefined {
  if (!protocol) return undefined;
  if (![protocol.warmupWalkMinutes, protocol.repeats, protocol.runMinutes, protocol.walkMinutes, protocol.cooldownWalkMinutes].every(Number.isFinite)) return undefined;
  if (protocol.warmupWalkMinutes < 1 || protocol.cooldownWalkMinutes < 1 || protocol.repeats < 1 || protocol.runMinutes < 1 || protocol.walkMinutes < 1) return undefined;
  return {
    warmupWalkMinutes: Math.round(protocol.warmupWalkMinutes),
    repeats: Math.round(protocol.repeats),
    runMinutes: Math.round(protocol.runMinutes),
    walkMinutes: Math.round(protocol.walkMinutes),
    cooldownWalkMinutes: Math.round(protocol.cooldownWalkMinutes),
  };
}

function validCss(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 45 && value <= 240;
}

function cssPace(css: number | undefined, unit: SwimDistanceUnit, fastOffset: number, slowOffset: number): EndurancePaceTarget | undefined {
  if (!validCss(css)) return undefined;
  return {
    unit,
    fastSecondsPer100: Math.round(css + fastOffset),
    slowSecondsPer100: Math.round(css + slowOffset),
    basis: 'css',
  };
}

function assignMinutesByDistance(blocks: EndurancePrescriptionBlock[], totalMinutes: number): EndurancePrescriptionBlock[] {
  const totalDistance = blocks.reduce((sum, item) => sum + (item.totalDistance ?? 0), 0);
  if (totalDistance <= 0) return blocks;
  let remaining = totalMinutes;
  return blocks.map((item, index) => {
    if (index === blocks.length - 1) return { ...item, totalMinutes: Math.max(1, remaining) };
    const estimate = Math.max(1, Math.round(totalMinutes * (item.totalDistance ?? 0) / totalDistance));
    const minutes = Math.min(estimate, Math.max(1, remaining - (blocks.length - index - 1)));
    remaining -= minutes;
    return { ...item, totalMinutes: minutes };
  });
}

function clampDistance(value: number, minimum: number, maximum: number, poolLength: number): number {
  return roundToMultiple(Math.max(minimum, Math.min(maximum, value)), poolLength);
}

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}
