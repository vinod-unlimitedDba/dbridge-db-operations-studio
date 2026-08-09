import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertSupportedNode, dependenciesReady, npmCommand } from "../portable/portable-launcher.mjs";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("portable launcher enforces the supported Node runtime and detects installed drivers", async () => {
  assert.equal(assertSupportedNode("22.13.0"), "22.13.0");
  assert.equal(assertSupportedNode("24.1.0"), "24.1.0");
  assert.throws(() => assertSupportedNode("22.12.9"), /22\.13\.0 or newer/);
  assert.equal(npmCommand("win32"), "npm.cmd");
  assert.equal(npmCommand("linux"), "npm");
  assert.equal(await dependenciesReady(fileURLToPath(new URL("../portable", import.meta.url))), true);
});

test("portable package supports Windows, macOS, and Linux launch paths", async () => {
  const [manifest, launcher, windows, shell, mac, server, readme] = await Promise.all([
    read("portable/package.json"),
    read("portable/portable-launcher.mjs"),
    read("portable/Start-DBridge.cmd"),
    read("portable/start-dbridge.sh"),
    read("portable/Start-DBridge.command"),
    read("portable/server.mjs"),
    read("README.md"),
  ]);
  const packageJson = JSON.parse(manifest);
  assert.equal(packageJson.engines.node, ">=22.13.0");
  assert.equal(packageJson.scripts.start, "node portable-launcher.mjs");
  assert.match(launcher, /npmCommand\(\).*\["ci", "--omit=dev"/s);
  assert.match(windows, /portable-launcher\.mjs/);
  assert.match(shell, /exec node .*portable-launcher\.mjs/);
  assert.match(mac, /exec node .*portable-launcher\.mjs/);
  for (const command of ["explorer.exe", "xdg-open", 'command: "open"']) assert.match(server, new RegExp(command.replace(".", "\\.")));
  assert.match(readme, /Windows, macOS, or Linux/);
});

test("portable packaging includes every local server module and both archive formats", async () => {
  const [server, build] = await Promise.all([read("portable/server.mjs"), read("portable/build-portable.ps1")]);
  const modules = [...server.matchAll(/^import .*? from "\.\/(.+?\.mjs)";/gm)].map((match) => match[1]);
  assert.ok(modules.length >= 8, "expected local runtime modules");
  for (const moduleName of modules) assert.equal(build.includes(`"${moduleName}"`), true, `${moduleName} is packaged`);
  for (const artifact of ["DBridge-Portable.zip", "DBridge-Node-Portable.zip", "DBridge-Node-Portable.tar.gz"]) assert.equal(build.includes(artifact), true, artifact);
  assert.equal(build.includes('Remove-Item -LiteralPath $release -Recurse'), false, "builder must preserve unrelated historical releases");
});

test("Keep pass is global while secrets remain out of browser storage", async () => {
  const [page, portableHtml, portableApp, portableSsh, server] = await Promise.all([
    read("app/page.tsx"),
    read("portable/app/index.html"),
    read("portable/app/app.js"),
    read("portable/app/ssh-terminal-ui.js"),
    read("portable/server.mjs"),
  ]);
  for (const source of [page, portableHtml]) assert.match(source, /Keep pass|KEEP PASS/);
  for (const source of [page, portableApp, portableSsh]) assert.match(source, /api\/credentials\/session/);
  assert.match(server, /api\/credentials\/session\/clear/);
  assert.match(portableApp, /dbridge-keep-pass-changed/);
  assert.match(portableSsh, /dbridge-keep-pass-changed/);
  assert.equal(/localStorage\.setItem\([^\n]+password/i.test(portableApp), false);
  assert.equal(/localStorage\.setItem\([^\n]+(?:password|passphrase)/i.test(portableSsh), false);
});
