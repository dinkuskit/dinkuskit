import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { d1, r2, sandbox } from '@emdash-cms/cloudflare';
import { defineConfig } from 'astro/config';
import emdash from 'emdash/astro';
import { operatorAdminPlugin } from './src/operator-admin/descriptor.mjs';

export default defineConfig({
  site: 'https://dinkuskit.com',
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    react(),
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
});
