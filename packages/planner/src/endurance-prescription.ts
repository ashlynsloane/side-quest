import type { PlannedMultisportSession } from './multisport';

export interface EndurancePrescriptionStep {
  label: string;
  minutes: number;
  effort: string;
  instruction: string;
}

export interface EnduranceSessionPrescription {
  sessionId: string;
  discipline: 'swim' | 'bike' | 'run';
  title: string;
  date: string;
  totalMinutes: number;
  objective: string;
  effortGuide: string;
  steps: EndurancePrescriptionStep[];
  whyThisSession: string[];
  guardrails: string[];
}

export function buildEndurancePrescription(session: PlannedMultisportSession): EnduranceSessionPrescription | null {
  if (session.discipline !== 'swim' && session.discipline !== 'bike' && session.discipline !== 'run') return null;

  const total = Math.max(10, session.durationMinutes);
  const warmup = Math.min(session.discipline === 'swim' ? 10 : 12, Math.max(5, Math.round(total * 0.18)));
  const cooldown = Math.min(10, Math.max(5, Math.round(total * 0.12)));
  const main = Math.max(1, total - warmup - cooldown);
  const objective = inferObjective(session);
  const effortGuide = effortGuideFor(session);
  const steps = buildSteps(session, warmup, main, cooldown);

  return {
    sessionId: session.id,
    discipline: session.discipline,
    title: session.title,
    date: session.date,
    totalMinutes: total,
    objective,
    effortGuide,
    steps,
    whyThisSession: session.rationale,
    guardrails: guardrailsFor(session),
  };
}

function inferObjective(session: PlannedMultisportSession): string {
  const title = session.title.toLowerCase();
  if (title.includes('technique')) return 'Technique and economical movement';
  if (title.includes('long') || title.includes('endurance')) return 'Aerobic durability';
  if (title.includes('interval') || title.includes('quality')) return 'Controlled quality work';
  if (title.includes('return-to-run')) return 'Return-to-run exposure';
  return session.intensity === 'easy' ? 'Aerobic support and recovery' : 'Aerobic development';
}

function effortGuideFor(session: PlannedMultisportSession): string {
  if (session.intensity === 'easy') return 'Easy conversational effort; roughly RPE 2–4/10.';
  if (session.intensity === 'moderate') return 'Controlled steady effort; roughly RPE 4–6/10.';
  return 'Purposeful hard work with recovery between efforts; roughly RPE 7–8/10, not all-out.';
}

function buildSteps(
  session: PlannedMultisportSession,
  warmup: number,
  main: number,
  cooldown: number,
): EndurancePrescriptionStep[] {
  if (session.discipline === 'swim') return swimSteps(session, warmup, main, cooldown);
  if (session.discipline === 'bike') return bikeSteps(session, warmup, main, cooldown);
  return runSteps(session, warmup, main, cooldown);
}

function swimSteps(session: PlannedMultisportSession, warmup: number, main: number, cooldown: number): EndurancePrescriptionStep[] {
  const title = session.title.toLowerCase();
  const mainInstruction = title.includes('technique')
    ? 'Alternate relaxed aerobic swimming with short technique-focused repeats. Keep form clean enough that speed never comes at the expense of mechanics.'
    : title.includes('endurance')
      ? 'Swim continuously or in long repeats at a sustainable aerobic effort. Use short rests only as needed to preserve technique.'
      : 'Use steady aerobic repeats with enough recovery to keep stroke quality consistent.';
  return [
    { label: 'Warm-up', minutes: warmup, effort: 'RPE 2–3', instruction: 'Easy swimming. Build range of motion and settle into relaxed breathing.' },
    { label: 'Main set', minutes: main, effort: session.intensity === 'hard' ? 'RPE 6–8' : 'RPE 3–6', instruction: mainInstruction },
    { label: 'Cool-down', minutes: cooldown, effort: 'RPE 1–2', instruction: 'Very easy swimming. Finish feeling smoother than you started.' },
  ];
}

function bikeSteps(session: PlannedMultisportSession, warmup: number, main: number, cooldown: number): EndurancePrescriptionStep[] {
  const title = session.title.toLowerCase();
  const mainInstruction = title.includes('interval') || title.includes('quality')
    ? 'Complete controlled work intervals separated by easy spinning. The final interval should look like the first; stop short of failure.'
    : title.includes('long')
      ? 'Ride steadily at sustainable aerobic intensity. Keep output controlled enough that this does not become an unplanned threshold session.'
      : 'Ride at an easy-to-steady aerobic effort with smooth cadence and minimal surging.';
  return [
    { label: 'Warm-up', minutes: warmup, effort: 'RPE 2–3', instruction: 'Easy spinning, gradually bringing cadence and effort up.' },
    { label: 'Main set', minutes: main, effort: session.intensity === 'hard' ? 'RPE 6–8' : 'RPE 3–6', instruction: mainInstruction },
    { label: 'Cool-down', minutes: cooldown, effort: 'RPE 1–2', instruction: 'Easy spin until breathing and leg tension settle.' },
  ];
}

function runSteps(session: PlannedMultisportSession, warmup: number, main: number, cooldown: number): EndurancePrescriptionStep[] {
  const title = session.title.toLowerCase();
  const mainInstruction = title.includes('return-to-run')
    ? 'Follow the explicit return-to-run protocol attached to the athlete plan. Do not convert this placeholder into continuous running or extend the prescribed exposure.'
    : title.includes('interval') || title.includes('quality')
      ? 'Use controlled work intervals with easy recovery. Maintain mechanics and finish with reserve.'
      : title.includes('long')
        ? 'Run at a sustainable aerobic effort. Duration should reflect established run capacity rather than goal-distance ambition.'
        : 'Run easily at conversational effort and keep the session deliberately low-cost.';
  return [
    { label: 'Warm-up', minutes: warmup, effort: 'RPE 1–3', instruction: 'Easy walking/jogging or the warm-up specified by the active run protocol.' },
    { label: 'Main set', minutes: main, effort: session.intensity === 'hard' ? 'RPE 6–8' : 'RPE 2–5', instruction: mainInstruction },
    { label: 'Cool-down', minutes: cooldown, effort: 'RPE 1–2', instruction: 'Easy walk/jog to finish without adding extra volume.' },
  ];
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
