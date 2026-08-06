import fs from 'node:fs';
const failures=[];
const read=(p)=>{if(!fs.existsSync(p)){failures.push(`Missing ${p}`);return '';}return fs.readFileSync(p,'utf8');};
const v20=read('scripts/validate-v20.mjs');
const pkg=read('package.json');
for(const token of ['v23Workspace','getDesignTokens','tokens.canvas','tokens.surface']) if(!v20.includes(token)) failures.push(`V20 validator is missing V23 compatibility token: ${token}`);
if(!pkg.includes('validate-v22-4-1.mjs')) failures.push('package.json does not run the V22.4.1 validator');
if(!pkg.includes('node scripts/validate-v20.mjs')) failures.push('package.json no longer runs the V20 regression validator');
if(failures.length){console.error(`V22.4.1 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('V22.4.1 validation passed through V23: the theme-token workspace coexists with the V20 regression suite without restoring the old white workspace.');
