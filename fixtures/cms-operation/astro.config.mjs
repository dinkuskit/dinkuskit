import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { d1, r2 } from '@emdash-cms/cloudflare';
import { defineConfig } from 'astro/config';
import emdash from 'emdash/astro';

const workRoot = new URL(process.env.DK_CMS_FIXTURE_UPGRADE === '1'
  ? '../../.grilltrack/work/emdash-upgrade-20261007/'
  : '../../.grilltrack/work/cms-operation-20260930/', import.meta.url);

// The upgrade check also builds this config inside the pinned 1.0.1 source
// (scripts/lib/emdash-upgrade-fixture.mjs), which predates the logo links.
const socialIconsModule = new URL('../../src/components/social-icons.mjs', import.meta.url);
const icons = existsSync(socialIconsModule) ? [(await import(socialIconsModule.href)).socialIcons()] : [];

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
    ...icons,
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
