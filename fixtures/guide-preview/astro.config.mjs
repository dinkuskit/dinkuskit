import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import emdash, { local } from 'emdash/astro';
import { sqlite } from 'emdash/db';
import { socialIcons } from '../../src/components/social-icons.mjs';

// Synthetic UI/outer-gate fixture only. Not an installed-plugin or live-Guide proof.
const root = new URL('../../', import.meta.url);
const work = new URL('./.grilltrack/work/guide-preview/', root);
mkdirSync(work, { recursive: true });
export default defineConfig({
  root: fileURLToPath(root), srcDir: './fixtures/guide-preview/src', site: 'https://dinkuskit.com', output: 'server',
  outDir: fileURLToPath(new URL('./dist/', work)), cacheDir: fileURLToPath(new URL('./cache/', work)),
  adapter: node({ mode: 'standalone' }),
  integrations: [
    react(),
    socialIcons(),
    emdash({ database: sqlite({ url: `file:${fileURLToPath(new URL('./data.db', work))}` }),
      storage: local({ directory: fileURLToPath(new URL('./uploads/', work)), baseUrl: '/_emdash/api/media/file' }),
      middleware: { outer: './src/emdash-namespace-guard.ts' },
    }),
    { name: 'guide-synthetic-preview', hooks: { 'astro:config:setup': ({ injectRoute }) => {
      for (const pattern of ['/', '/start', '/getting-started', '/docs', '/account', '/account/sign-in']) {
        injectRoute({ pattern, entrypoint: fileURLToPath(new URL('./page.astro', import.meta.url)) });
      }
      for (const pattern of ['/_emdash/api/plugins/r_guide_preview/config', '/_emdash/api/plugins/r_guide_preview/ask']) {
        injectRoute({ pattern, entrypoint: fileURLToPath(new URL('./transport.ts', import.meta.url)) });
      }
    } } },
  ],
  vite: { server: { watch: { ignored: ['**/.local/**'] } }, define: { 'import.meta.env.DINKUS_GUIDE_PILOT': JSON.stringify('true'),
    'import.meta.env.DINKUS_GUIDE_PLUGIN_ID': JSON.stringify('r_guide_preview') } },
  devToolbar: { enabled: false },
});
