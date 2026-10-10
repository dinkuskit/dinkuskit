// Print a fresh ES256 private JWK for MERCHANT_JWT_PRIVATE_JWK on stdout only.
// Pipe it straight into `wrangler secret put`; never save it to a file.
import { exportJWK, generateKeyPair } from 'jose';

const { privateKey } = await generateKeyPair('ES256', { extractable: true });
const kid = `dinkuskit-account-es256-${crypto.randomUUID()}`;
process.stdout.write(JSON.stringify({ ...await exportJWK(privateKey), kid, alg: 'ES256' }));
