import fs from 'node:fs';
const failures=[];
const read=(p)=>{ if(!fs.existsSync(p)){failures.push(`Missing ${p}`); return '';} return fs.readFileSync(p,'utf8'); };
const theme=read('apps/mobile/src/theme/index.ts');
const ui=read('apps/mobile/src/components/v12-ui.tsx');
const progress=read('apps/mobile/src/app/(tabs)/library.tsx');
const classicWhiteWorkspace = theme.includes("canvas: '#FFFFFF'") && ui.includes("backgroundColor:'#FFFFFF'");
const unifiedSubpageWorkspace = theme.includes("canvas: '#E4EBE3'") && ui.includes('backgroundColor:subpage.canvas');
const v23Workspace = theme.includes('export interface DesignTokens') && theme.includes('getDesignTokens') && ui.includes('tokens.canvas') && ui.includes('tokens.surface');
if(!classicWhiteWorkspace && !unifiedSubpageWorkspace && !v23Workspace) failures.push('No approved workspace surface system is present');
if(/completion percentage/i.test(progress)) failures.push('Insights still mentions completion percentage');
if(!progress.includes('What matters') || !progress.includes('Recent change')) failures.push('Decision-led Insights sections are missing');
if(!progress.includes('Routine activity detail stays in Strava or TrainingPeaks.')) failures.push('External detailed-record guidance is missing');
if(failures.length){console.error(`V20 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log(`V20 validation passed: ${v23Workspace ? 'V23 theme-token workspace' : unifiedSubpageWorkspace ? 'V22.4 unified subpage surfaces' : 'classic white workspace'}, direct Insights data, and nonjudgmental training language are present.`);
