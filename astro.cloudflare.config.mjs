import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { access, d1, r2 } from '@emdash-cms/cloudflare';
import { defineConfig } from 'astro/config';
import emdash from 'emdash/astro';
import { unstable_readConfig } from 'wrangler';
import { operatorAdminPlugin } from './src/operator-admin/descriptor.mjs';
import { INSTALLED_EDITOR_ROLE } from './scripts/lib/access-namespace-gate.mjs';

const workRoot = new URL('./.grilltrack/work/cloudflare-candidate-20260930/', import.meta.url);
const teamDomain = process.env.EMDASH_ACCESS_TEAM_DOMAIN ?? '';
const guidePilot = process.env.DINKUS_GUIDE_PILOT === 'true';

// The Ask DinkusGuide pilot runs its Registry-format plugin sandboxed in a
// Worker Loader isolate. `npm run build:dinkusguide-plugin` builds it first
// (DEPLOY.md); the page guard admits only this plugin's ID.
async function dinkusGuideSandboxed() {
  const dist = new URL('./packages/dinkusguide-chat/dist/', import.meta.url);
  if (!existsSync(new URL('index.mjs', dist))) {
    throw new Error('DINKUS_GUIDE_PILOT=true needs the plugin built first: npm run build:dinkusguide-plugin');
  }
  const { default: descriptor } = await import(new URL('index.mjs', dist).href);
  if (process.env.DINKUS_GUIDE_PLUGIN_ID !== descriptor.id) {
    throw new Error(`DINKUS_GUIDE_PLUGIN_ID must be ${descriptor.id} when DINKUS_GUIDE_PILOT=true`);
  }
  const config = unstable_readConfig({ config: './cloudflare/wrangler.jsonc' }, { hideWarnings: true });
  if (!config.worker_loaders?.some(({ binding }) => binding === 'LOADER')) {
    throw new Error('cloudflare/wrangler.jsonc must provide the LOADER Worker Loader binding for the DinkusGuide plugin');
  }
  return [{ ...descriptor, entrypoint: fileURLToPath(new URL('plugin.mjs', dist)) }];
}

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
      ...(guidePilot ? { sandboxed: await dinkusGuideSandboxed(), sandboxRunner: '@emdash-cms/cloudflare/sandbox' } : {}),
      // Official Access provider, with the entrypoint swapped for a wrapper
      // that also admits allowlisted Access service tokens as Editors.
      auth: {
        ...access({
          teamDomain,
          audienceEnvVar: 'CF_ACCESS_AUDIENCE',
          defaultRole: INSTALLED_EDITOR_ROLE,
        }),
        entrypoint: fileURLToPath(new URL('./scripts/lib/access-auth-entry.mjs', import.meta.url)),
      },
      middleware: {
        outer: './src/access-namespace-guard.ts',
      },
    }),
  ],
  vite: {
    define: {
      'import.meta.env.DINKUS_GUIDE_PILOT': JSON.stringify(process.env.DINKUS_GUIDE_PILOT === 'true' ? 'true' : 'false'),
      'import.meta.env.DINKUS_GUIDE_PLUGIN_ID': JSON.stringify(process.env.DINKUS_GUIDE_PLUGIN_ID ?? ''),
      'import.meta.env.EMDASH_ACCESS_TEAM_DOMAIN': JSON.stringify(teamDomain),
    },
  },
  devToolbar: { enabled: false },
});
