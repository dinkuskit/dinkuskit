import handler, { createScheduledHandler, PluginBridge } from '@emdash-cms/cloudflare/worker';

export { PluginBridge };

export default {
  fetch: handler.fetch.bind(handler),
  scheduled: createScheduledHandler(),
};
