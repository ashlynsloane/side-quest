import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`V31.7H missing ${label}: ${text}`);
};

const profile = read('apps/mobile/src/app/(tabs)/profile.tsx');
const screen = read('apps/mobile/src/app/visual-qa.tsx');
const data = read('apps/mobile/src/data/v31-visual-qa.ts');

requireText(profile, 'title="Visual QA"', 'You-tab Visual QA entry');
requireText(profile, "router.push('/visual-qa' as Href)", 'Visual QA route');
requireText(screen, 'V31.7 RELEASE GATE', 'release-gate heading');
requireText(screen, 'does not alter training data', 'non-mutating review boundary');
requireText(screen, 'does not claim that device QA has passed', 'honest QA boundary');
requireText(data, "'Navigation'", 'navigation review area');
requireText(data, "'Hierarchy'", 'hierarchy review area');
requireText(data, "'Accessibility'", 'accessibility review area');
requireText(data, "'Continuity'", 'continuity review area');
requireText(data, "'Privacy'", 'privacy review area');
requireText(data, 'Preview carries into workout', 'workout continuity criterion');
requireText(data, 'Share preview is authoritative', 'sharing privacy criterion');
requireText(data, 'Regional status is plan-relative', 'body-map continuity criterion');

const checkCount = (data.match(/id: '/g) ?? []).length;
if (checkCount < 12) throw new Error(`V31.7H expected at least 12 review checks; found ${checkCount}`);

console.log('V31.7H validation passed: navigation, hierarchy, accessibility, cross-screen continuity, privacy, and release-boundary review contracts.');
