import testWorker from './test-entry.mjs';
import { createAgentTestEntry } from './agent-test-policy.mjs';
export default createAgentTestEntry(testWorker);
export { PluginBridge } from './entry.mjs';
