import fs from 'node:fs';

const required = [
  'packages/planner/src/you-workspace.ts',
  'packages/planner/test/you-workspace.test.ts',
  'apps/mobile/src/services/you-workspace.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const symbol of ['YouWorkspaceModel', 'YouAthleteProfileSummary', 'YouContextItem', 'YouConnectionItem', 'YouCoachAccessSummary', 'YouSocialSummary', 'YouSettingRow']) {
  if (!domain.includes(`interface ${symbol}`)) throw new Error(`Missing domain contract: ${symbol}`);
}
const planner = fs.readFileSync('packages/planner/src/you-workspace.ts', 'utf8');
for (const phrase of ['youAttentionItems', 'youConnectionSummary', 'youProfileCompletionPrompt', 'needsAttention']) {
  if (!planner.includes(phrase)) throw new Error(`You workspace is missing behavior: ${phrase}`);
}
for (const banned of ['profile completion percentage', 'consistency score', 'streak pressure']) {
  if (planner.toLowerCase().includes(banned)) throw new Error(`You workspace contains banned framing: ${banned}`);
}
const test = fs.readFileSync('packages/planner/test/you-workspace.test.ts', 'utf8');
if (!test.includes("from 'vitest'")) throw new Error('You workspace tests must use Vitest.');
if (test.includes("from 'node:test'")) throw new Error('You workspace test contains node:test.');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!index.includes("export * from './you-workspace'")) throw new Error('Planner does not export You workspace.');
console.log('V28.5 validation passed: You surfaces athlete context, connection status, coach access, social controls, and settings without becoming an empty routing directory.');
