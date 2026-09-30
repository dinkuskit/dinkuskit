import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { ACCOUNT_BASE_PATH, ACCOUNT_COOKIE_PREFIX, type MerchantEnv, type MerchantMailIntent } from './config.ts';
import { createMerchantEmailDelivery, type MerchantEmailDelivery } from './email.ts';
import { getInjectedTransports } from './transports.ts';
import { ensureMerchantSubject, isMerchantDisabled } from './store.ts';

export type MerchantAuth = ReturnType<typeof createMerchantAuth>;

export function createMerchantAuth(env: MerchantEnv, email: MerchantEmailDelivery) {
  return betterAuth({
    appName: 'DinkusKit',
    secret: env.MERCHANT_AUTH_SECRET,
    baseURL: env.MERCHANT_BASE_URL,
    basePath: ACCOUNT_BASE_PATH,
    database: env.MERCHANT_DB,
    trustedOrigins: [env.MERCHANT_BASE_URL, 'https://dinkuskit.com'],
    emailAndPassword: { enabled: false },
    session: {
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: ACCOUNT_COOKIE_PREFIX,
      useSecureCookies: env.MERCHANT_BASE_URL.startsWith('https:'),
      disableOriginCheck: false,
    },
    plugins: [
      magicLink({
        expiresIn: 300,
        storeToken: 'hashed',
        disableSignUp: false,
        sendMagicLink: async ({ email: address, url, metadata }) => {
          const intent = readIntent(metadata) ?? 'signin';
          const user = await env.MERCHANT_DB.prepare('SELECT id FROM user WHERE email = ?').bind(address).first<{ id: string }>();
          if (user && await isMerchantDisabled(env.MERCHANT_DB, user.id)) return;
          if ((intent === 'signin' || intent === 'recovery') && !user) return;
          await email.deliver({ email: address, url, intent });
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            const intent = readIntent(ctx?.body?.metadata);
            if (intent === 'signin' || intent === 'recovery') return false;
            return { data: user };
          },
          after: async (user) => {
            await ensureMerchantSubject(env.MERCHANT_DB, user.id);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            if (await isMerchantDisabled(env.MERCHANT_DB, session.userId)) return false;
            return { data: session };
          },
        },
      },
    },
  });
}

export function createMerchantRuntime(env: MerchantEnv, email?: MerchantEmailDelivery) {
  const injected = getInjectedTransports();
  const delivery = email
    ?? injected.emailDelivery
    ?? createMerchantEmailDelivery({ sendEmail: env.EMAIL });
  return {
    env,
    email: delivery,
    auth: createMerchantAuth(env, delivery),
    proofFetch: injected.proofFetch,
  };
}

function readIntent(metadata: unknown): MerchantMailIntent | undefined {
  if (metadata && typeof metadata === 'object' && 'intent' in metadata) {
    const intent = (metadata as { intent?: unknown }).intent;
    if (intent === 'signup' || intent === 'signin' || intent === 'recovery') return intent;
  }
  return undefined;
}
