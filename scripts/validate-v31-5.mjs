import fs from 'node:fs';
const required = {
  'apps/mobile/src/app/side-quest-coach.tsx': ['Useful from day one','No two-week waiting period','Training body map','Share a workout','Human coach access'],
  'apps/mobile/src/app/(tabs)/index.tsx': ['SIDE QUEST COACH','no history required','/side-quest-coach'],
  'apps/mobile/src/app/share-center.tsx': ['body areas trained','Privacy-safe by default','Training body map'],
};
const errors=[];
for (const [file,tokens] of Object.entries(required)) { const text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):''; if(!text) errors.push(`${file} missing`); for(const token of tokens) if(!text.includes(token)) errors.push(`${file} missing ${token}`); }
if(errors.length){console.error(`V31.5 validation failed (${errors.length}):`);for(const e of errors)console.error(`- ${e}`);process.exit(1);}console.log('V31.5 validation passed: intake-based coaching, visible coach entry, body-map discovery, and privacy-safe workout sharing are present.');
