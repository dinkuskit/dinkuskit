import { startAgentTestRuntime } from '../tests/helpers/agent-test-harness.mjs';
import { runAgentTestScenario } from '../tests/helpers/agent-test-scenario.mjs';

let runtime;
let interrupted = false;
const interrupt = code => {
  interrupted = true;
  process.exitCode = code;
  if (runtime) void runtime.close().catch(() => {});
};
const onInterrupt = () => interrupt(130);
const onTerminate = () => interrupt(143);
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);
try {
  if (process.argv.length > 2) throw new Error('No configuration arguments accepted');
  runtime = await startAgentTestRuntime();
  if (interrupted) throw new Error('Interrupted');
  console.log(JSON.stringify(await runAgentTestScenario(runtime), null, 2));
} catch {
  // Never emit raw HTTP bodies, assertion operands, cookies, or token URLs.
  if (!interrupted) console.error('Local agent test failed. Run npm run test:agent-routes for named assertions.');
  if (!interrupted) process.exitCode = 1;
} finally {
  await runtime?.close();
  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onTerminate);
}
