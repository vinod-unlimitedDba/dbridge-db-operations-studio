import { access, mkdir } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SERVER_FILE = join(ROOT, "server.mjs");
const REQUIRED_PACKAGES = ["mongodb", "mysql2", "oracledb", "pg", "ssh2", "tedious"];
const MINIMUM_NODE = [22, 13, 0];

export function assertSupportedNode(version = process.versions.node) {
  const actual = String(version).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const supported = actual[0] > MINIMUM_NODE[0]
    || (actual[0] === MINIMUM_NODE[0] && actual[1] > MINIMUM_NODE[1])
    || (actual[0] === MINIMUM_NODE[0] && actual[1] === MINIMUM_NODE[1] && actual[2] >= MINIMUM_NODE[2]);
  if (!supported) throw new Error(`DBridge requires Node.js 22.13.0 or newer. Found ${version}.`);
  return version;
}

export function npmCommand(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export async function dependenciesReady(root = ROOT) {
  try {
    await Promise.all(REQUIRED_PACKAGES.map((name) => access(join(root, "node_modules", name, "package.json"))));
    return true;
  } catch {
    return false;
  }
}

export function installDependencies(root = ROOT) {
  if (process.env.DBRIDGE_SKIP_INSTALL === "1" || process.env.DBRIDGE_OFFLINE === "1") {
    throw new Error("Portable dependencies are missing. Connect once and run npm ci --omit=dev in this folder, or use the Windows offline bundle.");
  }
  console.log("DBridge is preparing platform-specific database drivers for this folder (first run only)...");
  const result = spawnSync(npmCommand(), ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: false,
    shell: process.platform === "win32",
  });
  if (result.error) throw new Error(`Could not start npm: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`npm ci failed with exit code ${result.status ?? "unknown"}.`);
}

export async function main() {
  assertSupportedNode();
  await access(SERVER_FILE);
  if (!(await dependenciesReady())) installDependencies();

  const dataDirectory = process.env.DBRIDGE_DATA_DIR || join(ROOT, "data");
  await mkdir(dataDirectory, { recursive: true });
  const child = spawn(process.execPath, [SERVER_FILE], {
    cwd: ROOT,
    env: { ...process.env, DBRIDGE_DATA_DIR: dataDirectory },
    stdio: "inherit",
    windowsHide: false,
  });
  child.once("error", (error) => {
    console.error(`DBridge could not start: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
