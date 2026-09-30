import node from '@astrojs/node';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import emdash, { local } from 'emdash/astro';
import { sqlite } from 'emdash/db';

export default defineConfig({
  site: 'https://dinkuskit.com',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    react(),
    emdash({
      database: sqlite({ url: 'file:./.local/content.db' }),
      storage: local({ directory: './.local/uploads', baseUrl: '/_emdash/api/media/file' }),
    }),
  ],
  devToolbar: { enabled: false },
});
