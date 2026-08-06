import type {
  CoachDecisionAuditEvent,
  CoachDecisionAuditTrail,
  CoachDecisionReplayResult,
  CoachAuditExport,
  UnifiedCoachingOsDecision,
} from '@circuit/domain';

function canonicalEventPayload(event: Omit<CoachDecisionAuditEvent, 'eventHash'>): string {
  return JSON.stringify({
    eventId: event.eventId, decisionId: event.decisionId, occurredAt: event.occurredAt,
    sequence: event.sequence, kind: event.kind, actor: event.actor, summary: event.summary,
    inputRefs: [...event.inputRefs].sort(), outputRefs: [...event.outputRefs].sort(),
    policyRefs: [...event.policyRefs].sort(), previousEventHash: event.previousEventHash ?? null,
  });
}

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/** Synchronous, runtime-portable SHA-256 for deterministic audit hashes. */
function sha256Hex(input: string): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bytes = Array.from(new TextEncoder().encode(input));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] = ((bytes[base] << 24) | (bytes[base + 1] << 16) | (bytes[base + 2] << 8) | bytes[base + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    const state = [a, b, c, d, e, f, g, h];
    for (let index = 0; index < 8; index += 1) hash[index] = (hash[index] + state[index]) >>> 0;
  }
  return hash.map((value) => value.toString(16).padStart(8, '0')).join('');
}

export function hashCoachDecisionAuditEvent(
  event: Omit<CoachDecisionAuditEvent, 'eventHash'>,
): string {
  return sha256Hex(canonicalEventPayload(event));
}

export function createCoachDecisionAuditEvent(
  event: Omit<CoachDecisionAuditEvent, 'eventHash'>,
): CoachDecisionAuditEvent {
  if (!Number.isInteger(event.sequence) || event.sequence < 1) throw new Error('Audit sequence must be a positive integer.');
  if (!Number.isFinite(Date.parse(event.occurredAt))) throw new Error('occurredAt must be a valid ISO timestamp.');
  return { ...event, eventHash: hashCoachDecisionAuditEvent(event) };
}

export function buildCoachDecisionAuditTrail(
  decisionId: string,
  events: CoachDecisionAuditEvent[],
): CoachDecisionAuditTrail {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const max = ordered.at(-1)?.sequence ?? 0;
  const present = new Set(ordered.map((event) => event.sequence));
  const missingSequenceNumbers = Array.from({ length: max }, (_, index) => index + 1).filter((n) => !present.has(n));
  let integrityVerified = missingSequenceNumbers.length === 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index];
    if (event.decisionId !== decisionId) integrityVerified = false;
    const { eventHash, ...unsigned } = event;
    if (hashCoachDecisionAuditEvent(unsigned) !== eventHash) integrityVerified = false;
    if (index > 0 && event.previousEventHash !== ordered[index - 1].eventHash) integrityVerified = false;
    if (index === 0 && event.previousEventHash) integrityVerified = false;
  }
  const complete = ordered.some((event) => event.kind === 'request_received') &&
    ordered.some((event) => ['candidate_selected', 'information_requested', 'decision_invalidated'].includes(event.kind));
  return {
    trailId: `audit-${decisionId}`, decisionId, events: ordered, complete, integrityVerified,
    missingSequenceNumbers,
    explanation: [
      integrityVerified ? 'The event chain passed integrity verification.' : 'The event chain is incomplete or was altered.',
      complete ? 'The trail contains a decision entry point and outcome.' : 'The trail does not contain enough events to reconstruct the decision.',
    ],
    auditable: true,
  };
}

export function replayCoachDecision(
  trail: CoachDecisionAuditTrail,
  expected: UnifiedCoachingOsDecision,
): CoachDecisionReplayResult {
  const selected = [...trail.events].reverse().find((event) => event.kind === 'candidate_selected');
  const info = [...trail.events].reverse().find((event) => event.kind === 'information_requested');
  const invalidated = [...trail.events].reverse().find((event) => event.kind === 'decision_invalidated');
  const reproducedDisposition = invalidated ? 'block' : info ? 'request_information' : selected ? 'recommend' : undefined;
  const selectedCandidate = selected?.outputRefs[0];
  const divergenceReasons: string[] = [];
  if (!trail.integrityVerified) divergenceReasons.push('Audit-chain integrity could not be verified.');
  if (!trail.complete) divergenceReasons.push('Required decision events are missing.');
  if (reproducedDisposition !== expected.disposition) divergenceReasons.push('Replayed disposition differs from the stored decision.');
  if ((selectedCandidate ?? undefined) !== (expected.selectedCandidateId ?? undefined)) divergenceReasons.push('Replayed candidate differs from the stored decision.');
  const replayable = trail.complete && trail.integrityVerified;
  return {
    replayId: `replay-${expected.decisionId}`, decisionId: expected.decisionId,
    reproducedDisposition, expectedDisposition: expected.disposition,
    reproducedSelectedCandidateId: selectedCandidate, expectedSelectedCandidateId: expected.selectedCandidateId,
    deterministicMatch: replayable && divergenceReasons.length === 0, replayable, divergenceReasons,
    provenance: trail.events.flatMap((event) => [event.eventId, ...event.inputRefs, ...event.policyRefs]), auditable: true,
  };
}

export function createCoachAuditExport(
  trail: CoachDecisionAuditTrail, generatedAt: string, includeTechnicalPayload = false,
): CoachAuditExport {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('generatedAt must be a valid ISO timestamp.');
  return {
    exportId: `audit-export-${trail.decisionId}`, decisionId: trail.decisionId, generatedAt,
    eventCount: trail.events.length, integrityVerified: trail.integrityVerified,
    humanSummary: trail.events.map((event) => `${event.sequence}. ${event.summary}`),
    technicalPayloadIncluded: includeTechnicalPayload,
  };
}
