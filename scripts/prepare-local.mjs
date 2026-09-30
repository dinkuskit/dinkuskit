import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Intentionally fixed to this checkout's local database; no remote target flag.
mkdirSync('.local/uploads', { recursive: true });
const result = spawnSync('node_modules/.bin/emdash', [
  'seed', '--database=.local/content.db', '--uploads-dir=.local/uploads',
  '--on-conflict=skip', 'seed/seed.json',
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
