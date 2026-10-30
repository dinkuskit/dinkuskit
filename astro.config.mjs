import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { d1, r2, sandbox } from '@emdash-cms/cloudflare';
import { defineConfig } from 'astro/config';
import emdash from 'emdash/astro';
import { operatorAdminPlugin } from './src/operator-admin/descriptor.mjs';
import { socialIcons } from './src/components/social-icons.mjs';

export default defineConfig({
  site: 'https://dinkuskit.com',
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    react(),
    socialIcons(),
    emdash({
      siteUrl: 'https://dinkuskit.com',
      database: d1({ binding: 'DB', session: 'disabled' }),
      storage: r2({ binding: 'MEDIA' }),
      sandboxRunner: sandbox(),
      plugins: [operatorAdminPlugin()],
      middleware: {
        outer: './src/emdash-namespace-guard.ts',
      },
    }),
  ],
  devToolbar: { enabled: false },
  vite: {
    define: {
      'import.meta.env.DINKUS_GUIDE_PILOT': JSON.stringify(process.env.DINKUS_GUIDE_PILOT === 'true' ? 'true' : 'false'),
      'import.meta.env.DINKUS_GUIDE_PLUGIN_ID': JSON.stringify(process.env.DINKUS_GUIDE_PLUGIN_ID ?? ''),
    },
  },
});
