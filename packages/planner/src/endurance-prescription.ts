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

export type EnduranceBlockKind = 'continuous' | 'intervals' | 'drill' | 'walk_run';

export interface EnduranceRpeTarget {
  low: number;
  high: number;
  cue: string;
}

export interface EndurancePrescriptionBlock {
  id: string;
  label: string;
  kind: EnduranceBlockKind;
  totalMinutes: number;
  target: EnduranceRpeTarget;
  instruction: string;
  repeats?: number;
  workMinutes?: number;
  recoveryMinutes?: number;
}

export interface EndurancePrescriptionStep {
  label: string;
  minutes: number;
  effort: string;
  instruction: string;
}

export interface EnduranceSessionPrescription {
  prescriptionVersion: 1;
  sessionId: string;
  discipline: 'swim' | 'bike' | 'run';
  workoutType: EnduranceWorkoutType;
  title: string;
  date: string;
  totalMinutes: number;
  objective: string;
  effortGuide: string;
  blocks: EndurancePrescriptionBlock[];
  /** Backward-compatible simplified representation used by current mobile surfaces. */
  steps: EndurancePrescriptionStep[];
  whyThisSession: string[];
  guardrails: string[];
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

export function buildEndurancePrescription(session: PlannedMultisportSession): EnduranceSessionPrescription | null {
  if (session.discipline !== 'swim' && session.discipline !== 'bike' && session.discipline !== 'run') return null;

  const total = Math.max(10, Math.round(session.durationMinutes));
  const split = splitSession(total, session.discipline);
  const workoutType = inferWorkoutType(session);
  const blocks = buildBlocks(session, workoutType, split);
  const steps = blocks.map(blockToStep);

  return {
    prescriptionVersion: 1,
    sessionId: session.id,
    discipline: session.discipline,
    workoutType,
    title: session.title,
    date: session.date,
    totalMinutes: total,
    objective: objectiveFor(workoutType),
    effortGuide: effortGuideFor(session),
    blocks,
    steps,
    whyThisSession: session.rationale,
    guardrails: guardrailsFor(session),
  };
}

function splitSession(total: number, discipline: 'swim' | 'bike' | 'run'): SessionSplit {
  const warmupCap = discipline === 'swim' ? 10 : 12;
  const warmupTarget = Math.min(warmupCap, Math.max(4, Math.round(total * 0.18)));
  const cooldownTarget = Math.min(10, Math.max(4, Math.round(total * 0.12)));

  const warmup = Math.min(warmupTarget, Math.max(2, total - 4));
  const cooldown = Math.min(cooldownTarget, Math.max(2, total - warmup - 1));
  const main = Math.max(1, total - warmup - cooldown);
  return { warmup, main, cooldown };
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
    if (title.includes('quality') || title.includes('interval') || title.includes('tempo') || title.includes('threshold') || session.intensity === 'hard') {
      return 'bike_quality_intervals';
    }
    if (title.includes('long')) return 'bike_long_aerobic';
    return 'bike_aerobic';
  }
  if (title.includes('return-to-run')) return 'run_return_to_run';
  if (title.includes('recovery')) return 'run_recovery';
  if (title.includes('quality') || title.includes('interval') || title.includes('tempo') || title.includes('threshold') || session.intensity === 'hard') {
    return 'run_quality_intervals';
  }
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

function effortGuideFor(session: PlannedMultisportSession): string {
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
  intervals: Pick<EndurancePrescriptionBlock, 'repeats' | 'workMinutes' | 'recoveryMinutes'> = {},
): EndurancePrescriptionBlock {
  return { id, label, kind, totalMinutes, target, instruction, ...intervals };
}

function warmupBlock(discipline: 'swim' | 'bike' | 'run', minutes: number): EndurancePrescriptionBlock {
  if (discipline === 'swim') {
    return block('warmup', 'Warm-up', 'continuous', minutes, rpe(2, 3, 'Relaxed'), 'Easy swimming. Settle into relaxed breathing and clean mechanics.');
  }
  if (discipline === 'bike') {
    return block('warmup', 'Warm-up', 'continuous', minutes, rpe(2, 3, 'Easy spin'), 'Easy spinning. Gradually bring cadence and effort up without surging.');
  }
  return block('warmup', 'Warm-up', 'continuous', minutes, rpe(1, 3, 'Easy'), 'Easy walking or jogging. Let mechanics and breathing settle before the main work.');
}

function cooldownBlock(discipline: 'swim' | 'bike' | 'run', minutes: number): EndurancePrescriptionBlock {
  if (discipline === 'swim') {
    return block('cooldown', 'Cool-down', 'continuous', minutes, rpe(1, 2, 'Very easy'), 'Very easy swimming. Finish feeling smoother than you started.');
  }
  if (discipline === 'bike') {
    return block('cooldown', 'Cool-down', 'continuous', minutes, rpe(1, 2, 'Easy spin'), 'Easy spin until breathing and leg tension settle.');
  }
  return block('cooldown', 'Cool-down', 'continuous', minutes, rpe(1, 2, 'Very easy'), 'Easy walk or jog to finish without adding extra volume.');
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

function appendRemainder(
  blocks: EndurancePrescriptionBlock[],
  minutes: number,
  discipline: 'swim' | 'bike' | 'run',
): void {
  if (minutes <= 0) return;
  const instruction = discipline === 'swim'
    ? 'Settle into smooth aerobic swimming and preserve stroke quality.'
    : discipline === 'bike'
      ? 'Ride steadily at an easy aerobic effort with smooth cadence.'
      : 'Run easily and keep this deliberately low-cost.';
  blocks.push(block('aerobic-finish', 'Aerobic finish', 'continuous', minutes, rpe(2, 4, 'Aerobic'), instruction));
}

function buildBlocks(
  session: PlannedMultisportSession,
  workoutType: EnduranceWorkoutType,
  split: SessionSplit,
): EndurancePrescriptionBlock[] {
  if (session.discipline === 'swim') return swimBlocks(workoutType, split);
  if (session.discipline === 'bike') return bikeBlocks(workoutType, split);
  return runBlocks(workoutType, split);
}

function swimBlocks(type: EnduranceWorkoutType, split: SessionSplit): EndurancePrescriptionBlock[] {
  const blocks = [warmupBlock('swim', split.warmup)];

  if (type === 'swim_technique') {
    const drillMinutes = Math.min(split.main, Math.max(6, Math.round(split.main * 0.4)));
    const aerobicMinutes = split.main - drillMinutes;
    blocks.push(block(
      'technique',
      'Technique',
      'drill',
      drillMinutes,
      rpe(2, 4, 'Smooth, not fast'),
      'Alternate short drill segments with relaxed swimming. Prioritize balance, line, breathing, and a clean catch over speed.',
    ));
    appendRemainder(blocks, aerobicMinutes, 'swim');
  } else if (type === 'swim_quality') {
    const plan = repeatPlan(split.main, 6, 3, 1);
    if (plan) {
      blocks.push(block(
        'main',
        'Main set',
        'intervals',
        plan.usedMinutes,
        rpe(6, 8, 'Strong and repeatable'),
        `Complete ${plan.repeats} × ${plan.workMinutes} min strong with ${plan.recoveryMinutes} min very easy between efforts. Keep stroke quality intact and make the final repeat look like the first.`,
        { repeats: plan.repeats, workMinutes: plan.workMinutes, recoveryMinutes: plan.recoveryMinutes },
      ));
      appendRemainder(blocks, split.main - plan.usedMinutes, 'swim');
    } else {
      appendRemainder(blocks, split.main, 'swim');
    }
  } else if (type === 'swim_endurance') {
    const plan = repeatPlan(split.main, 3, 8, 1);
    if (plan) {
      blocks.push(block(
        'main',
        'Main set',
        'intervals',
        plan.usedMinutes,
        rpe(3, 5, 'Sustainable'),
        `Complete ${plan.repeats} × ${plan.workMinutes} min aerobic with ${plan.recoveryMinutes} min easy between. Keep the rest short and preserve mechanics.`,
        { repeats: plan.repeats, workMinutes: plan.workMinutes, recoveryMinutes: plan.recoveryMinutes },
      ));
      appendRemainder(blocks, split.main - plan.usedMinutes, 'swim');
    } else {
      appendRemainder(blocks, split.main, 'swim');
    }
  } else {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(3, 5, 'Steady aerobic'), 'Swim steadily at an aerobic effort. Keep breathing controlled and stroke quality consistent.'));
  }

  blocks.push(cooldownBlock('swim', split.cooldown));
  return blocks;
}

function bikeBlocks(type: EnduranceWorkoutType, split: SessionSplit): EndurancePrescriptionBlock[] {
  const blocks = [warmupBlock('bike', split.warmup)];

  if (type === 'bike_quality_intervals') {
    const plan = repeatPlan(split.main, 4, split.main >= 40 ? 6 : 5, 3);
    if (plan) {
      blocks.push(block(
        'main',
        'Main set',
        'intervals',
        plan.usedMinutes,
        rpe(6, 8, 'Controlled quality'),
        `Complete ${plan.repeats} × ${plan.workMinutes} min at a controlled hard effort with ${plan.recoveryMinutes} min easy spinning between. The last interval should be as controlled as the first.`,
        { repeats: plan.repeats, workMinutes: plan.workMinutes, recoveryMinutes: plan.recoveryMinutes },
      ));
      appendRemainder(blocks, split.main - plan.usedMinutes, 'bike');
    } else {
      appendRemainder(blocks, split.main, 'bike');
    }
  } else if (type === 'bike_long_aerobic') {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(3, 5, 'Durable aerobic'), 'Ride steadily at sustainable aerobic intensity. Avoid turning the long ride into an unplanned threshold session.'));
  } else if (type === 'bike_recovery') {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(1, 2, 'Recovery'), 'Spin very easily with relaxed cadence. This session should reduce stiffness, not create additional training stress.'));
  } else {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(2, 4, 'Easy aerobic'), 'Ride at an easy-to-steady aerobic effort with smooth cadence and minimal surging.'));
  }

  blocks.push(cooldownBlock('bike', split.cooldown));
  return blocks;
}

function runBlocks(type: EnduranceWorkoutType, split: SessionSplit): EndurancePrescriptionBlock[] {
  const blocks = [warmupBlock('run', split.warmup)];

  if (type === 'run_return_to_run') {
    blocks.push(block(
      'main',
      'Main set',
      'walk_run',
      split.main,
      rpe(2, 4, 'Comfortable'),
      'Follow the explicit return-to-run protocol attached to the athlete plan. This block is the allotted exposure; do not convert it into continuous running or extend it.',
    ));
  } else if (type === 'run_quality_intervals') {
    const plan = repeatPlan(split.main, 4, split.main >= 28 ? 5 : 4, 2);
    if (plan) {
      blocks.push(block(
        'main',
        'Main set',
        'intervals',
        plan.usedMinutes,
        rpe(6, 8, 'Fast but controlled'),
        `Complete ${plan.repeats} × ${plan.workMinutes} min controlled with ${plan.recoveryMinutes} min easy running or walking between. Maintain mechanics and finish with reserve.`,
        { repeats: plan.repeats, workMinutes: plan.workMinutes, recoveryMinutes: plan.recoveryMinutes },
      ));
      appendRemainder(blocks, split.main - plan.usedMinutes, 'run');
    } else {
      appendRemainder(blocks, split.main, 'run');
    }
  } else if (type === 'run_long_aerobic') {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(2, 4, 'Conversational'), 'Run at a sustainable aerobic effort. Duration should reflect established run capacity rather than goal-distance ambition.'));
  } else if (type === 'run_recovery') {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(1, 3, 'Very easy'), 'Keep the run deliberately short and easy. Finish with less tension than you started.'));
  } else {
    blocks.push(block('main', 'Main set', 'continuous', split.main, rpe(2, 4, 'Conversational'), 'Run easily at conversational effort and keep the session deliberately low-cost.'));
  }

  blocks.push(cooldownBlock('run', split.cooldown));
  return blocks;
}

function blockToStep(item: EndurancePrescriptionBlock): EndurancePrescriptionStep {
  const effort = item.target.low === item.target.high
    ? `RPE ${item.target.low}`
    : `RPE ${item.target.low}–${item.target.high}`;
  return {
    label: item.label,
    minutes: item.totalMinutes,
    effort,
    instruction: item.instruction,
  };
}

function guardrailsFor(session: PlannedMultisportSession): string[] {
  const common = [
    'Do not add time or intensity simply because the session feels easy.',
    'Pain, illness, unusual fatigue, or an active restriction overrides the written workout.',
    'A missed or shortened session does not create training debt that must be repaid later in the week.',
  ];
  if (session.discipline === 'run') {
    common.unshift('Run volume must stay within the active running/return-to-run policy and established impact tolerance.');
  }
  return common;
}
