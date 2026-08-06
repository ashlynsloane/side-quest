import fs from 'node:fs';

const profile = fs.readFileSync('apps/mobile/src/app/(tabs)/profile.tsx', 'utf8');
const sharing = fs.readFileSync('apps/mobile/src/app/share-center.tsx', 'utf8');
const checks = [
  [profile.includes('Your training context and controls'), 'You screen framing'],
  [profile.includes('Recommendations adapt. Changes remain yours.'), 'athlete-control statement'],
  [profile.includes('Human Coach Access'), 'human coach terminology'],
  [profile.includes('Sharing center'), 'sharing center entry'],
  [sharing.includes('Review before anything leaves Side Quest'), 'sharing review framing'],
  [sharing.includes('Workout card options'), 'workout share controls'],
  [sharing.includes('Never included'), 'private-data exclusion list'],
  [sharing.includes('Readiness and check-in answers'), 'readiness exclusion'],
  [sharing.includes('Review in system share sheet'), 'review-before-share action'],
  [sharing.includes('Privacy-safe progress summary'), 'privacy-safe progress sharing'],
];
const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, label] of failed) console.error(`Missing V31.7F contract: ${label}`);
  process.exit(1);
}
console.log('V31.7F validation passed: You hierarchy, athlete control, Human Coach Access terminology, share-card review, explicit options, and private-data exclusions.');
