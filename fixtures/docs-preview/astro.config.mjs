import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import emdash, { local } from 'emdash/astro';
import { sqlite } from 'emdash/db';

// Local documentation renderer. It serves the actual docs routes, content
// adapter and Site layout from its own EmDash database (SQLite under
// .grilltrack/work), seeded from seed/seed.json. It has no account, service or
// Cloudflare bindings and does not stand in for those production surfaces.
const root = new URL('../../', import.meta.url);
const work = new URL('./.grilltrack/work/docs-preview/', root);
export default defineConfig({
  root: fileURLToPath(root),
  srcDir: './fixtures/docs-preview/src',
  site: 'https://dinkuskit.com',
  output: 'server',
  outDir: fileURLToPath(new URL('./dist/', work)),
  cacheDir: fileURLToPath(new URL('./cache/', work)),
  adapter: node({ mode: 'standalone' }),
  integrations: [
    react(),
    emdash({
      database: sqlite({ url: `file:${fileURLToPath(new URL('./data.db', work))}` }),
      storage: local({ directory: fileURLToPath(new URL('./uploads/', work)), baseUrl: '/_emdash/api/media/file' }),
    }),
    {
      name: 'dinkuskit-docs-preview',
      hooks: {
        'astro:config:setup': ({ injectRoute }) => {
          for (const [pattern, path] of [
            ['/docs', 'src/pages/docs/index.astro'],
            ['/docs/[...slug]', 'src/pages/docs/[...slug].astro'],
            ['/docs/search.json', 'src/pages/docs/search.json.ts'],
            ['/docs/markdown/[...slug]', 'src/pages/docs/markdown/[...slug].ts'],
            ['/llms.txt', 'src/pages/llms.txt.ts'],
            // The CMS-drawn part of /start, without its Worker-only sign-in check.
            ['/start', 'fixtures/docs-preview/src/start.astro'],
          ]) injectRoute({ pattern, entrypoint: fileURLToPath(new URL(path, root)) });
        },
      },
    },
  ],
  devToolbar: { enabled: false },
});
