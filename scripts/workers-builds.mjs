// Cloudflare Workers Builds entry point for dinkuskit.com (DEPLOY.md,
// "Deploy from Cloudflare Workers Builds"). It refuses to build unless the
// checkout is exactly the branch, commit and account the Worker's build
// variables name, then runs the same production build as the Mac deploy.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

// Production builds always carry the Ask DinkusGuide pilot; a build without it
// removes the bubble and closes its routes (DEPLOY.md).
export const productionBuildEnv = Object.freeze({
  DINKUS_GUIDE_PILOT: "true",
  DINKUS_GUIDE_PLUGIN_ID: "dinkusguide-chat",
});

function required(env, name, pattern) {
  const value = env[name]?.trim();
  if (!value || !pattern.test(value)) throw new Error(`Missing or invalid ${name}`);
  return value;
}

// Only this project checkout can establish the source used by the build. Git
// errors/status details never reach the build log.
function readCheckoutGit(checkoutRoot, args) {
  const result = spawnSync("git", ["-C", checkoutRoot, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") {
    throw new Error("Unable to verify Workers Builds Git checkout");
  }
  return result.stdout.trim();
}

export function assertBuildSource(env, checkoutRoot = root) {
  if (!env.WORKERS_CI) throw new Error("build:workers-builds runs only in Cloudflare Workers Builds");
  const branch = required(env, "DINKUS_EXPECTED_BRANCH", /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/);
  const commit = required(env, "DINKUS_EXPECTED_COMMIT", /^[a-f0-9]{40}$/i).toLowerCase();
  const account = required(env, "DINKUS_EXPECTED_ACCOUNT_ID", /^[a-f0-9]{32}$/i);
  required(env, "EMDASH_ACCESS_TEAM_DOMAIN", /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/);
  if (env.WORKERS_CI_BRANCH !== branch) throw new Error("Workers Builds branch does not match DINKUS_EXPECTED_BRANCH");
  if (env.CLOUDFLARE_ACCOUNT_ID !== account) throw new Error("Workers Builds account does not match DINKUS_EXPECTED_ACCOUNT_ID");
  let projectRoot;
  try { projectRoot = realpathSync(checkoutRoot); }
  catch { throw new Error("Unable to verify Workers Builds Git checkout"); }
  if (readCheckoutGit(projectRoot, ["rev-parse", "--show-toplevel"]) !== projectRoot) {
    throw new Error("Workers Builds Git root does not match the project root");
  }
  const head = readCheckoutGit(projectRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (head !== commit) throw new Error("Workers Builds Git HEAD does not match DINKUS_EXPECTED_COMMIT");
  if (readCheckoutGit(projectRoot, ["status", "--porcelain=v1", "--untracked-files=no"])) {
    throw new Error("Workers Builds tracked source is not clean");
  }
  return { branch, commit: head, account };
}

function run(script, env) {
  const result = spawnSync("npm", ["run", script], { cwd: root, env, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`npm run ${script} failed`);
}

if (import.meta.main) {
  const source = assertBuildSource(process.env);
  console.log(`Building ${source.branch} at ${source.commit} for account ${source.account}`);
  const env = { ...process.env, ...productionBuildEnv };
  run("build:dinkusguide-plugin", env);
  run("build:cloudflare", env);
}
