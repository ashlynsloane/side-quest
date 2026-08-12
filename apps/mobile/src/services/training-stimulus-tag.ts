import type { PlannedStrengthSession, TrainingCalendarEvent } from '@circuit/domain';

export interface TrainingStimulusTag {
  label: string;
  backgroundColor: string;
  textColor: string;
}

const TAGS = {
  recovery: tag('RECOVERY', '#E9EEF2', '#52616B'),
  easy: tag('EASY', '#E7F1F7', '#35657C'),
  aerobic: tag('AEROBIC', '#E2EFF5', '#28627B'),
  technique: tag('TECHNIQUE', '#E2F1F0', '#2B6B68'),
  vo2: tag('VO₂', '#FCE5E1', '#A33A2F'),
  threshold: tag('THRESHOLD', '#FBE9D8', '#9A4D0B'),
  tempo: tag('TEMPO', '#F6EED8', '#7A610D'),
  overUnder: tag('OVER / UNDER', '#EEE6F5', '#674186'),
  hills: tag('LONG · HILLS', '#E5EFE3', '#3F6A3F'),
  fueling: tag('LONG · FUELING', '#DFF0EB', '#24695D'),
  long: tag('LONG AEROBIC', '#E7ECF6', '#465D8A'),
  race: tag('RACE-SPECIFIC', '#F2E5EE', '#7B3E69'),
  cadence: tag('CADENCE', '#E3F0F2', '#326B73'),
  aeroStrength: tag('AERO STRENGTH', '#EDE8DD', '#66563A'),
  rtr: tag('RTR', '#E7EAF6', '#495B91'),
  swimQuality: tag('SWIM QUALITY', '#E3EAF7', '#395D8B'),
  swimEndurance: tag('SWIM ENDURANCE', '#E3EFF6', '#356B88'),
  strength: tag('STRENGTH', '#E8EDF1', '#40586B'),
  deload: tag('DELOAD', '#E3F0E8', '#396A50'),
  training: tag('TRAINING', '#ECEFF1', '#53616A'),
} as const;

export function trainingStimulusTagForEvent(event: TrainingCalendarEvent): TrainingStimulusTag {
  const title = event.title.toLowerCase();
  const description = event.description?.toLowerCase() ?? '';
  const discipline = event.discipline;
  const durationMinutes = eventDurationMinutes(event);

  if (discipline === 'strength') return TAGS.strength;
  if (discipline === 'rest') return TAGS.recovery;

  if (discipline === 'run') {
    if (/return.?to.?run|run\s*\/\s*walk|rtr/.test(title)) return TAGS.rtr;
    if (/recovery|shakeout/.test(title)) return TAGS.recovery;
    if (/vo2|interval/.test(title)) return TAGS.vo2;
    if (/threshold/.test(title)) return TAGS.threshold;
    if (/tempo/.test(title)) return TAGS.tempo;
    if (/long/.test(title) && durationMinutes >= 75) return TAGS.long;
    if (/return.?to.?run|run\s*\/\s*walk|rtr/.test(description)) return TAGS.rtr;
    return TAGS.easy;
  }

  if (discipline === 'bike') {
    // Planner truth lives in the structured event title. Do not let broad
    // race-horizon rationale (which may mention threshold/long rides elsewhere
    // in the week) overwrite this session's actual stimulus.
    if (/recovery|aerobic reset|leg flush|reduced aerobic/.test(title)) return TAGS.recovery;
    if (/hills \+ rolling terrain|rolling durability/.test(title)) return TAGS.hills;
    if (/fueling practice|fueling rehearsal/.test(title) && durationMinutes >= 120) return TAGS.fueling;
    if (/full rehearsal|race pace|race position durability|race feel/.test(title)) return TAGS.race;
    if (/vo2/.test(title)) return TAGS.vo2;
    if (/over \/ under|over.?under/.test(title)) return TAGS.overUnder;
    if (/threshold/.test(title)) return TAGS.threshold;
    if (/tempo/.test(title)) return TAGS.tempo;
    if (/low cadence|aerobic strength/.test(title)) return TAGS.aeroStrength;
    if (/cadence/.test(title)) return TAGS.cadence;
    if (/long ride|long aerobic/.test(title) && durationMinutes >= 120) return TAGS.long;

    // Only use description as a narrow fallback for explicit recovery/RTR-style
    // semantics. Never infer VO2/threshold/tempo/long from week-level rationale.
    if (/side quest generated\s*·[^\\n]*·\s*easy/.test(description)) return TAGS.easy;
    if (/side quest generated\s*·[^\\n]*·\s*moderate/.test(description)) return TAGS.aerobic;
    return TAGS.easy;
  }

  if (discipline === 'swim') {
    if (/recovery|easy reset/.test(title)) return TAGS.recovery;
    if (/technique|drill|form/.test(title)) return TAGS.technique;
    if (/threshold|fast|quality|vo2|interval/.test(title)) return TAGS.swimQuality;
    if (/long|endurance/.test(title) && durationMinutes >= 55) return TAGS.swimEndurance;
    if (/technique|drill|form/.test(description)) return TAGS.technique;
    return TAGS.aerobic;
  }

  return TAGS.training;
}

function eventDurationMinutes(event: TrainingCalendarEvent): number {
  if (!event.endAt) return 0;
  const start = Date.parse(event.startAt);
  const end = Date.parse(event.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

export function trainingStimulusTagForStrength(session: PlannedStrengthSession): TrainingStimulusTag {
  if (session.workout.variantLevel === 'reduced' || session.workout.variantLevel === 'minimum') return TAGS.deload;
  return TAGS.strength;
}

function tag(label: string, backgroundColor: string, textColor: string): TrainingStimulusTag {
  return { label, backgroundColor, textColor };
}
