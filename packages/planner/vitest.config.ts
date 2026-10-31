import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vitest 4's Node transform cannot parse React Native's Flow entry point.
  // Constrain this alias to the planner's Node-only QA environment.
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: fileURLToPath(new URL('./test/fixtures/react-native-node.ts', import.meta.url)) },
      { find: /^expo-sqlite$/, replacement: fileURLToPath(new URL('./test/fixtures/expo-sqlite-node.ts', import.meta.url)) },
      { find: /^expo-sqlite\/localStorage\/install$/, replacement: fileURLToPath(new URL('./test/fixtures/expo-localstorage-noop.ts', import.meta.url)) },
    ],
  },
});
