/**
 * Resolves a persisted Side Quest generated-event id back to the planner
 * session that created it.
 *
 * Generated calendar ids end with `_${safeId(session.id)}`. That identity is
 * more stable than title/date matching because block rhythm, availability,
 * athlete-facing naming, and dose shaping may change display semantics while
 * preserving the underlying planned session.
 */
export function resolveGeneratedSessionByEventId<T extends { id: string }>(
  eventId: string,
  sessions: readonly T[],
): T | null {
  if (!eventId || !sessions.length) return null;

  const matches = sessions
    .map((session) => ({ session, suffix: `_${safeGeneratedSessionId(session.id)}` }))
    .filter(({ suffix }) => eventId.endsWith(suffix))
    .sort((left, right) => right.suffix.length - left.suffix.length);

  return matches[0]?.session ?? null;
}

export function safeGeneratedSessionId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90);
}

export interface GeneratedSessionPreviewHint {
  date?: string;
  discipline?: string;
  title?: string;
  durationMinutes?: number;
}

/**
 * Resolves a session for detail/preview navigation even if the persisted
 * calendar event was replaced by a reconciliation between tap and screen load.
 *
 * Stable generated-event identity wins. Date/discipline/title/duration are only
 * conservative fallbacks; ambiguous candidates return null rather than guessing.
 */
export function resolveGeneratedSessionForPreview<T extends {
  id: string;
  date: string;
  discipline: string;
  title: string;
  durationMinutes: number;
}>(
  eventId: string,
  hint: GeneratedSessionPreviewHint,
  sessions: readonly T[],
): T | null {
  const linked = resolveGeneratedSessionByEventId(eventId, sessions);
  if (linked && (!hint.discipline || linked.discipline === hint.discipline)) return linked;

  let candidates = sessions.filter((session) =>
    (!hint.date || session.date === hint.date)
    && (!hint.discipline || session.discipline === hint.discipline));

  if (!candidates.length) return null;

  if (hint.title) {
    const titleMatches = candidates.filter((session) => session.title === hint.title);
    if (titleMatches.length === 1) return titleMatches[0] ?? null;
    if (titleMatches.length > 1) candidates = titleMatches;
  }

  if (Number.isFinite(hint.durationMinutes) && (hint.durationMinutes ?? 0) > 0) {
    const durationMatches = candidates.filter(
      (session) => session.durationMinutes === Math.round(hint.durationMinutes!),
    );
    if (durationMatches.length === 1) return durationMatches[0] ?? null;
    if (durationMatches.length > 1) candidates = durationMatches;
  }

  return candidates.length === 1 ? candidates[0] ?? null : null;
}

