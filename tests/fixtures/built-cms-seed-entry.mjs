import production from './entry.mjs';
import { runWithCmsProof } from './cms-proof-als.mjs';

export default {
  async fetch(request, env, ctx) {
    return runWithCmsProof(() => production.fetch(request, env, ctx));
  },
  scheduled: production.scheduled,
};

export { PluginBridge } from './entry.mjs';
