import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlugin, bundlePlugin } from "@emdash-cms/plugin-cli";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = resolve(rootDir, "packages/dinkusguide-chat");
const bundleOutDir = resolve(rootDir, ".local/dinkusguide-pilot/bundles");
const summaryPath = resolve(rootDir, ".local/dinkusguide-pilot/build-summary.json");

export async function buildAndValidateDinkusGuidePlugin() {
  execFileSync(
    process.execPath,
    [
      resolve(rootDir, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "-p",
      resolve(pluginDir, "tsconfig.json"),
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  await mkdir(bundleOutDir, { recursive: true });

  const buildResult = await buildPlugin({ dir: pluginDir });
  const bundleResult = await bundlePlugin({
    dir: pluginDir,
    outDir: bundleOutDir,
  });

  const manifestRaw = await readFile(buildResult.files.manifestJson, "utf8");
  const manifest = JSON.parse(manifestRaw);

  assert.equal(manifest.id, "dinkusguide-chat");
  assert.equal(manifest.version, "0.1.0");
  assert.deepEqual(manifest.capabilities, ["network:request"]);
  assert.ok(!manifest.capabilities.includes("network:request:unrestricted"));
  assert.deepEqual(manifest.allowedHosts, ["guide.example.com"]);
  assert.deepEqual(manifest.declaredAccess, {
    network: {
      request: {
        allowedHosts: ["guide.example.com"],
      },
    },
  });
  assert.equal(manifest.admin?.settingsSchema?.serviceToken?.type, "secret");

  const routeNames = new Map(manifest.routes.map((route) => [route.name, route]));
  assert.equal(routeNames.get("config")?.public, true);
  assert.deepEqual(routeNames.get("config")?.methods, ["GET"]);
  assert.equal(routeNames.get("ask")?.public, true);
  assert.deepEqual(routeNames.get("ask")?.methods, ["POST"]);
  assert.equal(routeNames.get("admin")?.public, undefined);
  assert.equal(routeNames.get("admin")?.permission, "settings:manage");

  assert.ok(bundleResult.tarballPath, "Expected Registry tarball path from bundlePlugin");
  const tarballStats = await stat(bundleResult.tarballPath);
  assert.ok(tarballStats.size > 0, "Expected non-empty Registry tarball");
  assert.deepEqual(bundleResult.warnings, []);

  const summary = {
    builtAt: new Date().toISOString(),
    id: manifest.id,
    version: manifest.version,
    capabilities: manifest.capabilities,
    allowedHosts: manifest.allowedHosts,
    routes: manifest.routes,
    runtimeFile: buildResult.files.runtime,
    descriptorFile: buildResult.files.descriptor,
    manifestFile: buildResult.files.manifestJson,
    tarballPath: bundleResult.tarballPath,
    tarballBytes: bundleResult.tarballBytes,
    tarballSha256: bundleResult.sha256,
    warnings: bundleResult.warnings,
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = await buildAndValidateDinkusGuidePlugin();
  console.log(
    `Built and validated @dinkuskit/dinkusguide-chat (${summary.id}@${summary.version}, ${summary.tarballBytes} bytes, sha256=${summary.tarballSha256}).`,
  );
}
