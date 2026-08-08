import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Coach Conversation Engine V2 mobile wiring', () => {
  it('routes Daily Coach turns through semantic dialogue before accepting a proposal', () => {
    const runtime = source('apps/mobile/src/services/coach-closed-loop-runtime.ts');
    expect(runtime).toContain('interpretCoachTurnV2');
    expect(runtime).toContain('semanticProposalConflict');
    expect(runtime).toContain('legacy planner resolved a different one');
  });

  it('supports a replaceable interpreter and fails back to deterministic framing', () => {
    const dialogue = source('apps/mobile/src/services/coach-dialogue-v2.ts');
    expect(dialogue).toContain('registerCoachLanguageInterpreter');
    expect(dialogue).toContain('runCoachLanguageInterpreter');
    expect(dialogue).toContain('frameBindsToLivePlan');
    expect(dialogue).toContain('buildDeterministicCoachTurnFrame');
  });

  it('does not embed a direct external model credential or API call in the mobile dialogue service', () => {
    const dialogue = source('apps/mobile/src/services/coach-dialogue-v2.ts');
    expect(dialogue).not.toContain('OPENAI_API_KEY');
    expect(dialogue).not.toContain('ANTHROPIC_API_KEY');
    expect(dialogue).not.toContain('api.openai.com');
    expect(dialogue).not.toContain('api.anthropic.com');
  });

  it('includes semantic dialogue state in full export and local deletion', () => {
    const privacy = source('apps/mobile/src/services/local-training-data-privacy.ts');
    expect(privacy).toContain('coachSemanticDialogue');
    expect(privacy).toContain('clearCoachDialogueV2');
  });
});
