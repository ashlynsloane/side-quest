import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'apps/mobile/src/ui/v29/SideQuestWorkspaceShell.tsx',
  'apps/mobile/src/ui/v29/workspace-shell-spec.ts',
  'apps/mobile/src/services/visible-workspace-shell.ts',
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`V29.6 missing ${rel}`);
}

const shell = fs.readFileSync(path.join(root, required[0]), 'utf8');
for (const screen of ['TodayWorkspaceScreen', 'TrainWorkspaceScreen', 'PlanWorkspaceScreen', 'ProgressWorkspaceScreen', 'YouWorkspaceScreen']) {
  if (!shell.includes(screen)) throw new Error(`V29.6 shell does not integrate ${screen}`);
}
for (const tab of ["case 'today'", "case 'train'", "case 'plan'", "case 'progress'", "case 'you'"]) {
  if (!shell.includes(tab)) throw new Error(`V29.6 shell is missing ${tab}`);
}
for (const requiredText of ['accessibilityRole="tab"', 'accessibilityState={{ selected }}', 'shell.hideBottomNavigation', 'shell.activeWorkout', 'onResumeWorkout']) {
  if (!shell.includes(requiredText)) throw new Error(`V29.6 shell is missing ${requiredText}`);
}
if (shell.includes("fontWeight: '650'") || shell.includes("fontWeight: '750'")) throw new Error('V29.6 uses unsupported font weights.');
if (!shell.includes('StyleSheet.create<Record<ViewStyleName, ViewStyle>>')) throw new Error('V29.6 must keep view styles type-safe.');
if (!shell.includes('StyleSheet.create<Record<TextStyleName, TextStyle>>')) throw new Error('V29.6 must keep text styles type-safe.');

console.log('V29.6 validation passed: all five visible workspaces share one controlled shell, compact masthead, persistent workout resume, accessible selected navigation, and workout-mode navigation hiding.');
