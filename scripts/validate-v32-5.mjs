import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8');
const required = [
  'apps/mobile/src/services/production-readiness.ts',
  'apps/mobile/src/components/production-state.tsx',
  'apps/mobile/src/app/release-readiness.tsx',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const layout = read('apps/mobile/src/app/_layout.tsx');
if (!layout.includes('export function ErrorBoundary')) throw new Error('Root error boundary missing');
if (!layout.includes('normalizeUserFacingError')) throw new Error('User-facing error normalization missing');
const feedback = read('apps/mobile/src/app/beta-feedback.tsx');
if (!feedback.includes('buildFeedbackContext')) throw new Error('Feedback context missing');
if (feedback.includes("appVersion:'0.18.7'")) throw new Error('Stale feedback version remains');
const dev = read('apps/mobile/src/app/developer-tools.tsx');
if (!dev.includes('/release-readiness')) throw new Error('Release readiness route not exposed');
console.log('V32.5 production readiness consolidation validation passed.');
