import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

mkdirSync('.local/wrangler', { recursive: true });
const apply = spawnSync('node_modules/.bin/wrangler', [
  'd1', 'migrations', 'apply', 'dinkuskit-merchant-local',
  '--local', '--persist-to', '.local/wrangler', '--config', 'wrangler.jsonc',
], {
  stdio: ['ignore', 'inherit', 'inherit'],
});
if (apply.error) throw apply.error;
if (apply.status) process.exitCode = apply.status;
else {
  console.log('Merchant D1 migrations applied locally. CMS schema and seed.json apply on first workerd request via EmDash public seed APIs.');
}
