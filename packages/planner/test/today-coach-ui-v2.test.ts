import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Today + Coach UI V2', () => {
  it('routes Today through a single command-center screen', () => {
    const route = source('apps/mobile/src/app/(tabs)/index.tsx');
    const today = source('apps/mobile/src/components/today-screen-v2.tsx');
    expect(route).toContain("@/components/today-screen-v2");
    expect(today).toContain('TODAY’S CALL');
    expect(today).toContain('Something changed?');
    expect(today).toContain('Stay oriented, not scored.');
    expect(today).toContain('ProductDisclosure');
  });

  it('keeps cold start focused on unified Goal Setup plus a quick-workout escape route', () => {
    const today = source('apps/mobile/src/components/today-screen-v2.tsx');
    expect(today).toContain('Build my plan');
    expect(today).toContain("router.push('/onboarding'");
    expect(today).toContain('Quick workout instead');
    expect(today).not.toContain('provisional badge');
  });

  it('makes the Coach thread and composer the primary daily coaching interaction', () => {
    const coach = source('apps/mobile/src/components/coach-screen-v2.tsx');
    expect(coach).toContain('COACH THREAD');
    expect(coach).toContain('Tell Side Quest what changed');
    expect(coach).toContain('COACH_QUICK_SIGNALS');
    expect(coach).toContain('Review with Coach');
    expect(coach).toContain('Conversation interprets the situation. The deterministic planner still decides');
  });

  it('renders proposed adaptations as current versus proposed before approval', () => {
    const coach = source('apps/mobile/src/components/coach-screen-v2.tsx');
    expect(coach).toContain('PROPOSED CHANGE');
    expect(coach).toContain('CURRENT');
    expect(coach).toContain('PROPOSED');
    expect(coach).toContain('EFFECT ON THE WEEK');
    expect(coach).toContain('Apply selected change');
    expect(coach).toContain('Keep original plan');
    expect(coach).toContain('CoachDecisionExplanationPanel');
  });

  it('keeps follow-up history and detailed workout reasoning behind disclosures', () => {
    const coach = source('apps/mobile/src/components/coach-screen-v2.tsx');
    expect(coach).toContain('Recent coach changes');
    expect(coach).toContain('Coach follow-up needs your response');
    expect(coach).toContain('Why this session?');
    expect(coach).toContain('CoachInsights');
  });
});
