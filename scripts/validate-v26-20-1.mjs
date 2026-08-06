import fs from 'node:fs';

const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/unified-coaching-os.ts', 'utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/unified-coaching-os.ts', 'utf8');

const legacyCount = (domain.match(/export interface UnifiedCoachDecision \{/g) ?? []).length;
if (legacyCount !== 1) throw new Error(`Expected exactly one legacy UnifiedCoachDecision contract, found ${legacyCount}.`);
if (!domain.includes('export interface UnifiedCoachingOsDecision {')) throw new Error('Missing renamed UnifiedCoachingOsDecision contract.');
if (!planner.includes('UnifiedCoachingOsDecision')) throw new Error('Unified coaching OS planner is not using the renamed decision contract.');
if (!mobile.includes('UnifiedCoachingOsDecision')) throw new Error('Unified coaching OS mobile service is not using the renamed decision contract.');
if (planner.includes("import type {\n  UnifiedCoachDecision,")) throw new Error('Planner still imports the colliding UnifiedCoachDecision contract.');
console.log('V26.20.1 validation passed: unified coaching OS decision contract no longer collides with the existing coach-engine contract.');
