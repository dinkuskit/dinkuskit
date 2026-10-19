import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Local documentation-only renderer. It imports the actual routes, content and
// Site layout, but has no CMS, account, service, or Cloudflare bindings.
const root = new URL('../../', import.meta.url);
export default defineConfig({
  root: fileURLToPath(root),
  srcDir: './fixtures/docs-preview/src',
  site: 'https://dinkuskit.com',
  output: 'server',
  outDir: './.grilltrack/work/docs-preview/dist',
  cacheDir: './.grilltrack/work/docs-preview/cache',
  adapter: node({ mode: 'standalone' }),
  integrations: [{
    name: 'dinkuskit-docs-preview',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        for (const [pattern, path] of [
          ['/docs', 'src/pages/docs/index.astro'],
          ['/docs/[...slug]', 'src/pages/docs/[...slug].astro'],
          ['/docs/search.json', 'src/pages/docs/search.json.ts'],
          ['/docs/markdown/[...slug]', 'src/pages/docs/markdown/[...slug].ts'],
          ['/llms.txt', 'src/pages/llms.txt.ts'],
        ]) injectRoute({ pattern, entrypoint: fileURLToPath(new URL(path, root)) });
      },
    },
  }],
  devToolbar: { enabled: false },
});
