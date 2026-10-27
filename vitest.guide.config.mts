import { defineConfig } from 'vitest/config';
import { emdashPluginTest } from '@emdash-cms/plugin-test/config';

export default defineConfig({
  plugins: [emdashPluginTest({ dir: './packages/dinkusguide-chat' })],
  test: { include: ['tests/dinkusguide-sandbox.test.ts'], testTimeout: 30000 },
});
