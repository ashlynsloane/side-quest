import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Retry once only when XCTest transport broke BEFORE a UI interaction.
 * After even one completed tap/input/assertion, repeating a stage could
 * mutate an athlete's training state a second time. Fail closed instead.
 */
export function retryablePreInteractionDriverFailure(junitXml, commandRecords) {
  if (!/DeviceUnreachableException|Transport unreachable|IOSDriverTimeoutException|iOS driver not ready in time/.test(junitXml)) return false;
  if (!commandRecords || !Array.isArray(commandRecords) || commandRecords.length < 3) return false;
  const allowed = new Set(['defineVariablesCommand', 'applyConfigurationCommand', 'launchAppCommand']);
  let launched = false;
  for (const record of commandRecords) {
    const command = record?.command;
    const keys = command && typeof command === 'object' ? Object.keys(command) : [];
    if (keys.length !== 1 || !allowed.has(keys[0])) return false;
    if (record.metadata?.status === 'FAILED' && keys[0] !== 'launchAppCommand') return false;
    if (keys[0] === 'launchAppCommand') {
      if (launched || record.metadata?.status === 'COMPLETED') return false;
      launched = true;
    }
  }
  return launched && commandRecords.at(-1)?.metadata?.status !== 'COMPLETED';
}

function findCommandFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const path = join(directory, item.name);
    return item.isDirectory() ? findCommandFiles(path)
      : item.name === 'commands.json' ? [path] : [];
  });
}

function main() {
  const [junitPath, evidenceDirectory] = process.argv.slice(2);
  if (!junitPath || !evidenceDirectory || !existsSync(junitPath)) {
    process.exitCode = 1;
    return;
  }
  const files = findCommandFiles(evidenceDirectory).sort().reverse();
  if (files.length !== 1) { process.exitCode = 1; return; }
  try {
    const xml = readFileSync(junitPath, 'utf8');
    const records = JSON.parse(readFileSync(files[0], 'utf8'));
    process.exitCode = retryablePreInteractionDriverFailure(xml, records) ? 0 : 1;
  } catch {
    process.exitCode = 1;
  }
}
if (process.argv[1]?.endsWith('native-driver-retry.mjs')) main();
