/**
 * Compile Better Auth 1.7.6 Kysely/D1 SQL from the selected library version.
 * Does not apply migrations or talk to Cloudflare.
 */
import { writeFileSync } from 'node:fs';
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { getMigrations } from 'better-auth/db/migration';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
const auth = betterAuth({
  secret: 'schema-generation-placeholder-not-used-in-product',
  baseURL: 'https://dinkuskit.com',
  database: db,
  session: { cookieCache: { enabled: false } },
  plugins: [
    magicLink({
      storeToken: 'hashed',
      sendMagicLink: async () => {},
    }),
  ],
});

const { compileMigrations } = await getMigrations(auth.options);
const sql = await compileMigrations();
writeFileSync('migrations/merchant/0001_better_auth.sql', `-- Generated from better-auth@1.7.6 via getMigrations/compileMigrations.\n-- D1 uses this SQLite dialect. Apply with wrangler d1 execute --local.\n${sql.endsWith('\n') ? sql : `${sql}\n`}`);
console.log('wrote migrations/merchant/0001_better_auth.sql');
db.close();
