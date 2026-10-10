import type { SandboxedPlugin } from 'emdash/plugin';
import { getMerchantEnv } from '../account/bindings.ts';
import { MerchantUnavailableError } from '../account/config.ts';
import { handleInteraction, parseInteraction } from './pages.ts';

/**
 * Site-local operator admin for dinkuskit.com. Loaded in-process from
 * astro config (standard format in `plugins: []`), never sandboxed and never
 * published: it reads the merchant database directly. Only EmDash Admins
 * (users:manage) reach it, and in production only through Cloudflare Access.
 */
const plugin: SandboxedPlugin = {
  routes: {
    admin: {
      permission: 'users:manage',
      handler: async routeCtx => {
        const user = routeCtx.user;
        if (!user?.id || !user.email) return { blocks: [{ type: 'banner', variant: 'error', title: 'Sign in to the admin as an Admin to use these pages.' }] };
        const interaction = parseInteraction(routeCtx.input);
        if (!interaction) return { blocks: [{ type: 'banner', variant: 'error', title: 'That request was not understood.' }] };
        let env;
        try { env = await getMerchantEnv(); } catch (error) {
          if (!(error instanceof MerchantUnavailableError)) throw error;
          return { blocks: [{ type: 'banner', variant: 'error', title: 'Accounts are not set up yet', description: 'The merchant database or account settings are missing on this site.' }] };
        }
        return handleInteraction({ db: env.MERCHANT_DB, actor: { userId: user.id, email: user.email }, email: env.EMAIL }, interaction);
      },
    },
  },
};

export default plugin;
