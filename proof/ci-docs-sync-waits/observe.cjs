// Diagnostic preload for the local, synthetic docs-sync integration test only.
// It does not replace the CLI, HTTP handlers, assertions, or process behavior.
const fs = require('node:fs');
const cp = require('node:child_process');
const http = require('node:http');
const { syncBuiltinESMExports } = require('node:module');
const output = process.env.DOCS_SYNC_TRACE_OUT;
if (output && process.argv[1]?.endsWith('/scripts/test-docs-sync.mjs')) {
  const append = value => fs.appendFileSync(output, `${JSON.stringify(value)}\n`);
  let call = 0;
  const spawn = cp.spawn;
  cp.spawn = function(command, args, options) {
    const index = Array.isArray(args) ? args.findIndex(value => String(value).endsWith('/scripts/docs-sync.mjs')) : -1;
    const child = spawn.apply(this, arguments);
    if (index >= 0) {
      const id = ++call;
      const chunks = { stdout: [], stderr: [] };
      child.stdout?.on('data', data => chunks.stdout.push(Buffer.from(data)));
      child.stderr?.on('data', data => chunks.stderr.push(Buffer.from(data)));
      child.on('close', (code, signal) => append({ type: 'sync', id, action: args[index + 1], code, signal, stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8') }));
    }
    return child;
  };
  const createServer = http.createServer;
  http.createServer = function(...args) {
    const index = args.findIndex(arg => typeof arg === 'function');
    if (index >= 0) {
      const listener = args[index];
      args[index] = function(req, res) {
        const path = String(req.url ?? '');
        const issue = /\/issues(?:\/\d+(?:\/comments)?)?(?:\?|$)/.test(path) && ['POST', 'PATCH'].includes(req.method);
        const edit = /^\/_emdash\/api\/content\/docs\//.test(path) && ['PUT', 'POST'].includes(req.method);
        if (issue || edit) {
          const chunks = [];
          if (issue) req.on('data', data => chunks.push(Buffer.from(data)));
          res.on('finish', () => append({ type: issue ? 'issue' : 'docs-write', method: req.method, path, status: res.statusCode, ...(issue ? { body: Buffer.concat(chunks).toString('utf8') } : {}) }));
        }
        return listener.apply(this, arguments);
      };
    }
    return createServer.apply(this, args);
  };
  syncBuiltinESMExports();
}
