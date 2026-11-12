/**
 * Native crash-recovery QA only; never enabled in normal beta bundles.
 * The profile fixture + app-bundle guard is intentionally conjunctive.
 */
export const SYNTHETIC_COMPLETION_KILL_BUNDLE = 'com.sidequest.synthetic.qa';
export const SYNTHETIC_COMPLETION_KILL_EMAIL =
  'synthetic-save-interrupt-a@example.invalid';
export const SYNTHETIC_COMPLETION_KILL_TIMEOUT_MS = 180_000;

export type SyntheticCompletionKillProfile = {
  email: string;
  mode: 'cloud' | 'local';
};

export function isSyntheticPreSqlCompletionKill(
  bundle: string | null | undefined,
  profile: SyntheticCompletionKillProfile | null | undefined,
): boolean {
  return bundle === SYNTHETIC_COMPLETION_KILL_BUNDLE
    && profile?.mode === 'local'
    && profile.email.trim().toLowerCase() === SYNTHETIC_COMPLETION_KILL_EMAIL;
}

/** Blocks after a durable partial journal; the shell must send real SIGKILL. */
export async function holdSyntheticPreSqlCompletion(
  enabled: boolean,
  timeoutMs = SYNTHETIC_COMPLETION_KILL_TIMEOUT_MS,
): Promise<void> {
  if (!enabled) return;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new Error('Invalid synthetic completion kill timeout.');
  }
  await new Promise<void>((_resolve, reject) => {
    setTimeout(() => reject(new Error(
      'Synthetic completion kill window expired without OS process termination.',
    )), timeoutMs);
  });
}
