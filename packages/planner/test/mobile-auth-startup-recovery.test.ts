import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  activateStartupProfile,
  startupDatabaseRecoveryMessage,
} from '../../../apps/mobile/src/services/auth-startup-recovery';

describe('fail-closed local startup after SQLite owner verification', () => {
  const candidate = {
    id: 'synthetic-profile-a',
    email: 'synthetic-a@example.invalid',
  };

  it('returns the exact original profile only after owner activation succeeds', async () => {
    const activate = vi.fn(async (athleteId: string) => {
      expect(athleteId).toBe(candidate.id);
    });
    const result = await activateStartupProfile(candidate, activate);
    expect(result).toEqual({ profile: candidate, recoveryError: null });
    expect(result.profile).toBe(candidate);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('never authenticates an unverified legacy database or edits the candidate', async () => {
    const original = structuredClone(candidate);
    const activate = vi.fn(async () => {
      throw new Error('Existing athlete database has no verifiable owner. Data was preserved; migration requires review.');
    });
    const result = await activateStartupProfile(candidate, activate);
    expect(result.profile).toBeNull();
    expect(result.recoveryError).toMatch(/verify ownership/);
    expect(result.recoveryError).toMatch(/Do not reinstall or clear app data/);
    expect(candidate).toEqual(original);
    expect(activate).toHaveBeenCalledWith('synthetic-profile-a');
    expect(JSON.stringify(result)).not.toContain('synthetic-a@example.invalid');
  });

  it('retains a retryable candidate without falsely claiming success after transient IO failure', async () => {
    let attempts = 0;
    const activate = async (_id: string) => {
      attempts += 1;
      if (attempts === 1) throw new Error('database is locked');
    };
    const first = await activateStartupProfile(candidate, activate);
    expect(first.profile).toBeNull();
    expect(first.recoveryError).toMatch(/could not safely open/);
    const second = await activateStartupProfile(candidate, activate);
    expect(second).toEqual({ profile: candidate, recoveryError: null });
    expect(attempts).toBe(2);
  });

  it('wires the root recovery screen to owner-verified retry without clearing saved profile', () => {
    const auth = readFileSync(new URL(
      '../../../apps/mobile/src/state/auth-context.tsx', import.meta.url,
    ), 'utf8');
    const root = readFileSync(new URL(
      '../../../apps/mobile/src/app/_layout.tsx', import.meta.url,
    ), 'utf8');
    expect(auth).toContain('const result=await activateStartupProfile(candidate,activateUserDatabase)');
    expect(auth).toContain('failedStartupCandidate.current=candidate;');
    expect(auth).toContain('setStartupRecoveryError(result.recoveryError);');
    expect(auth).toContain('setLoading(false);');
    const failurePath = auth.split('if(result.recoveryError){')[1]?.split('}else{')[0];
    expect(failurePath).not.toContain('persist(null)');
    expect(failurePath).not.toContain('store.removeItem(KEY)');
    expect(auth).toContain("const next=_event==='SIGNED_OUT'?null");
    expect(root).toContain('if (startupRecoveryError) {');
    expect(root).toContain('Your local training history needs recovery.');
    expect(root).toContain('retry={() => void retryStartup()}');
    expect(root).toContain('if (startupRecoveryError) return;');
  });

  it('does not emit internal owner IDs or SQL details from a failed activation', () => {
    const message = startupDatabaseRecoveryMessage(
      new Error('Athlete database ownership mismatch for synthetic-other-private-id; SQL SELECT private_blob'),
    );
    expect(message).toMatch(/verify ownership/);
    expect(message).not.toContain('synthetic-other-private-id');
    expect(message).not.toContain('SELECT');
  });
});
