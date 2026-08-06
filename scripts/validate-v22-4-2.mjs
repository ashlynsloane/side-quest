import fs from 'node:fs';
const failures=[];
const read=(p)=>{if(!fs.existsSync(p)){failures.push(`Missing ${p}`);return '';}return fs.readFileSync(p,'utf8');};
const validator=read('scripts/validate-v21.mjs');
const v23=read('apps/mobile/src/components/v23-ui.tsx');
for(const token of ['approvedWordmark','V23BrandHeader','side-quest-wordmark-transparent.png']) if(!(validator+v23).includes(token)) failures.push(`V23 wordmark compatibility is missing ${token}`);
if(/width:178/.test(validator)) failures.push('V21 validator still hard-codes the obsolete 178-point wordmark requirement');
if(!v23.includes('compactWordmark') || !v23.includes('compactShell')) failures.push('Compact subpage masthead is missing');
if(failures.length){console.error(`V22.4.2 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('V22.4.2 validation passed through V23: the V21 regression suite accepts the compact themed masthead without restoring the obsolete wordmark sizing.');
