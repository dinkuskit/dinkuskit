import { fileURLToPath } from 'node:url';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { access, d1, r2 } from '@emdash-cms/cloudflare';
import { defineConfig } from 'astro/config';
import emdash from 'emdash/astro';
import { operatorAdminPlugin } from './src/operator-admin/descriptor.mjs';
import { INSTALLED_EDITOR_ROLE } from './scripts/lib/access-namespace-gate.mjs';

const workRoot = new URL('./.grilltrack/work/cloudflare-candidate-20260930/', import.meta.url);
const teamDomain = process.env.EMDASH_ACCESS_TEAM_DOMAIN ?? '';

export default defineConfig({
  site: 'https://dinkuskit.com',
  output: 'server',
  outDir: fileURLToPath(new URL('./dist/', workRoot)),
  cacheDir: fileURLToPath(new URL('./.astro/', workRoot)),
  adapter: cloudflare({
    configPath: './cloudflare/wrangler.jsonc',
    imageService: 'passthrough',
    prerenderEnvironment: 'node',
  }),
  integrations: [
    react(),
    emdash({
      database: d1({ binding: 'DB' }),
      storage: r2({ binding: 'MEDIA' }),
      plugins: [operatorAdminPlugin()],
      auth: access({
        teamDomain,
        audienceEnvVar: 'CF_ACCESS_AUDIENCE',
        defaultRole: INSTALLED_EDITOR_ROLE,
      }),
      middleware: {
        outer: './src/access-namespace-guard.ts',
      },
    }),
  ],
  vite: {
    define: {
      'import.meta.env.EMDASH_ACCESS_TEAM_DOMAIN': JSON.stringify(teamDomain),
    },
  },
  devToolbar: { enabled: false },
});
