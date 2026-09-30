import { fileURLToPath } from 'node:url';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { d1, r2 } from '@emdash-cms/cloudflare';
import { defineConfig } from 'astro/config';
import emdash from 'emdash/astro';

const workRoot = new URL('../../.grilltrack/work/cms-operation-20260930/', import.meta.url);

export default defineConfig({
  site: 'https://dinkuskit.com',
  output: 'server',
  outDir: fileURLToPath(new URL('./dist/', workRoot)),
  cacheDir: fileURLToPath(new URL('./.astro/', workRoot)),
  adapter: cloudflare({
    configPath: './fixtures/cms-operation/wrangler.jsonc',
    imageService: 'passthrough',
    prerenderEnvironment: 'node',
  }),
  integrations: [
    react(),
    emdash({
      database: d1({ binding: 'DB' }),
      storage: r2({ binding: 'MEDIA' }),
      middleware: {
        outer: './fixtures/cms-operation/loopback-editor-guard.ts',
      },
    }),
  ],
  devToolbar: { enabled: false },
});
