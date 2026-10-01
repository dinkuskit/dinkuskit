import { readdir, readFile, writeFile } from 'node:fs/promises';

const dir = 'migrations/merchant';
const files = (await readdir(dir)).filter(name => name.endsWith('.sql')).sort();
const parts = [];
for (const name of files) {
  const sql = await readFile(`${dir}/${name}`, 'utf8');
  const key = `SQL_${name.slice(0, 4)}`;
  parts.push(`export const ${key} = ${JSON.stringify(sql)};`);
}
await writeFile('src/account/migration-sql.ts', `${parts.join('\n')}\n`);
console.log(`Wrote src/account/migration-sql.ts from ${files.join(', ')}`);
