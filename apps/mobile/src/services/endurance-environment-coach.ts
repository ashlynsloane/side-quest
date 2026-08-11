import type { EnduranceSessionPrescription } from '@circuit/planner/endurance-prescription';

export function answerEnduranceEnvironmentQuestion(
  prescription: EnduranceSessionPrescription,
  message: string,
): string | null {
  if (prescription.discipline === 'swim') return null;
  const text = message.trim().toLowerCase();
  if (!text) return null;

  const asksEnvironment = /\b(hill|hills|hilly|uphill|climb|climbing|trail|technical|dirt|gravel|track|treadmill|road|asphalt|path|surface|terrain|indoor|trainer|outside|outdoor|where|setup)\b/.test(text)
    || /different surface|different terrain|different setup/.test(text);
  if (!asksEnvironment) return null;

  if (!specificEnvironment(text)) {
    return 'Yes—tell me what you want to use today: hills, trail, treadmill, track, road, dirt/gravel, or an indoor trainer. I’ll keep the workout’s purpose fixed and tell you whether the prescription can stay as written or needs to be translated.';
  }

  if (prescription.workoutType === 'run_return_to_run') {
    if (/hill|hilly|uphill|climb|trail|technical/.test(text)) {
      return 'For return-to-run, keep the surface flat, predictable, and nontechnical for now. The impact dose is the thing we are controlling, so I would not move this stage onto hills or technical trail. A treadmill or flat smooth path is a better match.';
    }
    return 'That setup is fine if it stays flat and predictable. Keep the run/walk intervals exactly as prescribed; changing the venue does not mean extending the running segments.';
  }

  if (prescription.discipline === 'run') return runAnswer(prescription, text);
  return bikeAnswer(prescription, text);
}

function runAnswer(prescription: EnduranceSessionPrescription, text: string): string {
  const main = prescription.blocks.find((block) => block.id === 'main' && block.repeats && block.workMinutes);
  const wantsHill = /hill|hilly|uphill|climb/.test(text);
  const wantsTechnical = /technical/.test(text);
  const wantsTrail = /trail/.test(text);
  const easySwap = /treadmill|track|road|asphalt|flat|smooth dirt|dirt path|gravel path|path/.test(text);

  if (prescription.workoutType === 'run_quality_intervals') {
    if (wantsHill) {
      const structure = main?.repeats && main.workMinutes
        ? `Keep roughly the same quality dose as ${main.repeats} × ${main.workMinutes} min, but run the work by RPE rather than pace.`
        : 'Keep the same total quality time, but run the work by RPE rather than pace.';
      return `${structure} A steady climb is fine if you can keep the effort controlled. If the grade is too steep to hold the original interval length cleanly, use shorter 4–5 minute uphill reps with easy recovery and preserve roughly the same total hard-running time.`;
    }
    if (wantsTechnical) {
      return 'Technical trail is not a great match for controlled quality intervals because footing and grade can dominate the effort. I would either choose a runnable section and keep the intervals by time/RPE, or turn today into steady trail running and move the quality stimulus rather than forcing it.';
    }
    if (wantsTrail) {
      return 'A smooth, runnable trail is fine. Keep the interval structure by time and use RPE rather than pace when grade or footing changes. If the trail becomes technical, the workout stops being a clean interval session.';
    }
    if (easySwap) {
      return 'Yes. That venue works without changing the workout. Keep the same interval and recovery structure; use RPE as the anchor if surface or grade makes pace less comparable.';
    }
  }

  if (wantsHill) {
    return prescription.workoutType === 'run_recovery'
      ? 'I would keep a recovery run flatter. Hills can turn an intentionally low-cost session into more muscular work than we want today.'
      : 'Hills are fine as long as the prescribed effort stays the same. Let pace slow on the climb instead of turning an aerobic run into an interval workout.';
  }
  if (wantsTechnical) {
    return prescription.workoutType === 'run_long_aerobic'
      ? 'Technical trail can work for a long aerobic run if you are accustomed to it. Ignore pace, keep the effort conversational, and account for the extra muscular/technical cost rather than chasing the planned road pace.'
      : 'Technical trail changes the mechanical and skill demand more than a normal surface swap. You can use it, but keep effort conservative and do not force pace; if the workout is supposed to be recovery-focused, choose something smoother.';
  }
  if (wantsTrail || easySwap) {
    return 'Yes. You can do this workout there without changing its purpose. Keep the written duration/interval structure and effort target; let pace respond naturally to the surface.';
  }
  return 'That can work. Keep the workout’s duration and effort target fixed, and let pace vary with the surface. If the terrain makes the intended effort impossible to hold cleanly, tell me what it is and I’ll translate the structure.';
}

function bikeAnswer(prescription: EnduranceSessionPrescription, text: string): string {
  const wantsTrainer = /indoor|trainer/.test(text);
  const wantsHill = /hill|hilly|uphill|climb/.test(text);
  const wantsTechnical = /technical|mountain bike|mtb/.test(text);

  if (prescription.workoutType === 'bike_quality_intervals') {
    if (wantsTrainer) return 'Yes. An indoor trainer is an excellent match. Keep the same work/recovery durations and control the effort rather than chasing a harder final interval.';
    if (wantsHill) return 'Yes, sustained climbs can work well for the intervals. Keep the work duration and RPE target the same, recover easily between efforts, and do not turn the descent/recovery into extra work.';
    if (wantsTechnical) return 'Technical mountain biking changes the workout because handling, coasting, and terrain can interrupt the interval dose. I would use a smoother climb/trail section for the work or keep the quality session on a trainer/road and use MTB for an aerobic day.';
    return 'That setup can work if you can complete the work and recovery periods cleanly. Preserve the interval timing and target effort rather than trying to reproduce an exact speed.';
  }

  if (wantsTrainer) return 'Yes. You can do this ride on the trainer with the same duration and effort target. The venue changes; the aerobic stimulus does not need to.';
  if (wantsHill) return prescription.workoutType === 'bike_recovery'
    ? 'For a recovery ride, flatter is better. Sustained climbing can add more muscular load than this session is meant to create.'
    : 'Hills are fine. Keep the prescribed effort steady and let speed drop on climbs instead of turning them into unplanned hard intervals.';
  if (wantsTechnical) return 'Mountain-bike terrain adds handling and muscular variability. It can replace an aerobic ride if you keep the overall effort controlled, but it is not automatically equivalent to a recovery ride or a tightly structured interval session.';
  return 'Yes. Keep the session duration and effort target fixed and use the venue that makes the workout practical today.';
}

function specificEnvironment(text: string): boolean {
  return /\b(hill|hills|hilly|uphill|climb|climbing|trail|technical|dirt|gravel|track|treadmill|road|asphalt|path|indoor|trainer|outside|outdoor)\b/.test(text);
}
