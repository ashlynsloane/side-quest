import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  saveObservedTrainingRecovery: vi.fn(),
  publishRemoteRecovery: vi.fn(),
  acknowledgeRemoteRecovery: vi.fn(),
}));
vi.mock('../src/services/database', () => ({
  saveObservedTrainingRecovery: mock.saveObservedTrainingRecovery,
  appendStoredTrainingGuardrailEvent: vi.fn(),
  getStoredDailyTrainingCeiling: vi.fn(),
  listStoredTrainingGuardrailEvents: vi.fn(),
  storeDailyTrainingCeiling: vi.fn(),
}));
vi.mock('../src/services/server-training-ledger', () => ({
  publishRemoteRecovery: mock.publishRemoteRecovery,
  acknowledgeRemoteRecovery: mock.acknowledgeRemoteRecovery,
}));

import { recordObservedRecovery } from '../src/services/training-guardrail-storage';

beforeEach(() => {
  vi.resetAllMocks();
  mock.publishRemoteRecovery.mockResolvedValue('recovery:test');
  mock.saveObservedTrainingRecovery.mockResolvedValue(undefined);
});

describe('regional recovery fail-closed local persistence', () => {
  it('does not locally clear recovery when a cloud stable upload fails', async () => {
    mock.publishRemoteRecovery.mockRejectedValue(new Error('network offline'));
    await expect(recordObservedRecovery('athlete-1','2026-11-10',
      { achilles: 'stable' }, { syncCloud: true }))
      .rejects.toThrow('network offline');
    expect(mock.saveObservedTrainingRecovery).not.toHaveBeenCalled();
    expect(mock.acknowledgeRemoteRecovery).not.toHaveBeenCalled();
  });

  it('saves newly worsened Achilles locally even if the other device cannot hear it', async () => {
    mock.publishRemoteRecovery.mockRejectedValue(new Error('network offline'));
    await expect(recordObservedRecovery('athlete-1','2026-11-10',
      { achilles: 'worse' }, { syncCloud: true }))
      .rejects.toThrow('network offline');
    expect(mock.saveObservedTrainingRecovery).toHaveBeenCalledWith(
      'athlete-1','2026-11-10',{ achilles: 'worse' },
    );
    expect(mock.acknowledgeRemoteRecovery).not.toHaveBeenCalled();
  });

  it('persists only restrictive fields when mixed stable and red-flag input fails', async () => {
    mock.publishRemoteRecovery.mockRejectedValue(new Error('pending old report'));
    await expect(recordObservedRecovery('athlete-1','2026-11-10',
      { general: 'stable', upper_back: 'red_flag' }, { syncCloud: true }))
      .rejects.toThrow('pending old report');
    expect(mock.saveObservedTrainingRecovery).toHaveBeenCalledWith(
      'athlete-1','2026-11-10',{ upper_back: 'red_flag' },
    );
  });

  it('requires both cloud confirmation and local save before acknowledging', async () => {
    await recordObservedRecovery('athlete-1','2026-11-10',
      { achilles: 'stable' }, { syncCloud: true });
    expect(mock.publishRemoteRecovery).toHaveBeenCalledOnce();
    expect(mock.saveObservedTrainingRecovery).toHaveBeenCalledOnce();
    expect(mock.acknowledgeRemoteRecovery).toHaveBeenCalledWith(
      'athlete-1', '2026-11-10', 'recovery:test',
    );
    mock.acknowledgeRemoteRecovery.mockClear();
    mock.saveObservedTrainingRecovery.mockRejectedValueOnce(new Error('disk full'));
    await expect(recordObservedRecovery('athlete-1','2026-11-10',
      { achilles: 'stable' }, { syncCloud: true })).rejects.toThrow('disk full');
    expect(mock.acknowledgeRemoteRecovery).not.toHaveBeenCalled();
  });

  it('reports both failures if a restrictive local stop cannot be persisted', async () => {
    mock.publishRemoteRecovery.mockRejectedValue(new Error('cloud rejected'));
    mock.saveObservedTrainingRecovery.mockRejectedValue(new Error('disk full'));
    await expect(recordObservedRecovery('athlete-1','2026-11-10',
      { upper_back: 'worse' }, { syncCloud: true }))
      .rejects.toThrow('local restrictive safety save both failed');
  });
});
