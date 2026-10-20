// Mints synthetic Ship passes through this site's real issuer (in-memory fixture,
// ephemeral key) and writes them to the path given, for ship-admin-chain.spec.ts only.
// Delete the file after the run; the tokens verify only against the fixture key.
import { writeFile } from 'node:fs/promises';
import { mintShipAdminPasses } from '../../tests/helpers/ship-issuer-fixture.mjs';

await writeFile(process.argv[2], JSON.stringify(await mintShipAdminPasses()), { mode: 0o600 });
