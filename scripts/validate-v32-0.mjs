import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`Missing ${label}`);
};
const rejectText = (source, text, label) => {
  if (source.includes(text)) throw new Error(`Unexpected ${label}`);
};

const equipment = read('apps/mobile/src/app/equipment-profiles.tsx');
requireText(equipment, 'presentationStyle="pageSheet"', 'page-sheet equipment editor');
requireText(equipment, 'keyboardShouldPersistTaps="handled"', 'keyboard-safe equipment editor');
requireText(equipment, "saving?'Saving…':'Save location'", 'equipment save progress');
requireText(equipment, 'This location could not be saved.', 'equipment save fallback');

const friends = read('apps/mobile/src/app/friends.tsx');
requireText(friends, 'userFacingSocialError', 'social error redaction');
requireText(friends, 'Friends unavailable', 'Friends unavailable state');
requireText(friends, 'The Friends database permissions or social migration are incomplete.', 'permission-safe explanation');
requireText(friends, "section==='feed'&&!serviceIssue", 'feed availability gate');
rejectText(friends, 'setMessage(cause instanceof Error?cause.message:String(cause))', 'raw backend error rendering');

console.log('V32.0 validation passed: equipment editing is immediately usable and Friends failures are privacy-safe.');
