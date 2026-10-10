import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { ACCOUNT_BASE_PATH, ACCOUNT_COOKIE_PREFIX, SIGNUP_ATTEMPT_COOKIE, type MerchantEnv, type MerchantMailIntent } from './config.ts';
import { createMerchantEmailDelivery, type MerchantEmailDelivery } from './email.ts';
import { fetchStoreProofReceipt } from './proof-fetch.ts';
import { getInjectedTransports } from './transports.ts';
import { ensureMerchantSubject, isMerchantDisabled } from './store.ts';
import { consumeSignupAttempt } from './organizations.ts';

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
          after: async (session, ctx) => {
            const headers = ctx?.headers ?? ctx?.request?.headers;
            const attemptId = readCookie(headers?.get('cookie') ?? '', SIGNUP_ATTEMPT_COOKIE);
            const user = await env.MERCHANT_DB.prepare('SELECT email FROM "user" WHERE id = ?')
              .bind(session.userId).first<{ email: string }>();
            if (!user) return;
            await consumeSignupAttempt(env.MERCHANT_DB, session.userId, user.email, attemptId ?? '');
          },
        },
      },
    },
  });
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) {
      try { return decodeURIComponent(value.join('=')); } catch { return null; }
    }
  }
  return null;
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
    proofFetch: injected.proofFetch ?? fetchStoreProofReceipt,
  };
}

function readIntent(metadata: unknown): MerchantMailIntent | undefined {
  if (metadata && typeof metadata === 'object' && 'intent' in metadata) {
    const intent = (metadata as { intent?: unknown }).intent;
    if (intent === 'signup' || intent === 'signin' || intent === 'recovery') return intent;
  }
  return undefined;
}
