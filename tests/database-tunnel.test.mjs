import assert from "node:assert/strict";
import test from "node:test";
import { createServer, connect } from "node:net";
import { TLSSocket, createSecureContext } from "node:tls";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync } from "node:crypto";
import ssh2 from "../portable/node_modules/ssh2/lib/index.js";
import { databaseTransport } from "../portable/database-tunnel.mjs";

test("a database route fails closed for missing, stale, changed, or unsupported targets", () => {
  const target = { host: "db.internal", port: "5432" };
  const handle = { sessionId: "session", forwardId: "forward" };
  const live = () => ({ bindHost: "127.0.0.1", localPort: 15432, remoteHost: target.host, remotePort: 5432 });
  assert.equal(databaseTransport("postgres", {}, target, live).host, target.host);
  assert.throws(() => databaseTransport("postgres", { connectionMode: "ssh" }, target, live), /open the database tunnel/);
  assert.throws(() => databaseTransport("snowflake", { sshTunnel: handle }, target, live), /supported bundled driver/);
  assert.throws(() => databaseTransport("postgres", { sshTunnel: handle }, { ...target, host: "another.internal" }, live), /target changed/);
  assert.throws(() => databaseTransport("postgres", { sshTunnel: handle }, target, () => { throw new Error("closed"); }), /closed/);
  const route = databaseTransport("postgres", { sshTunnel: handle }, target, live);
  assert.equal(route.host, "127.0.0.1");assert.equal(route.port, "15432");assert.equal(route.destinationHost, "db.internal");
  assert.throws(() => databaseTransport("oracle", { sshTunnel: handle, tlsMode: "require" }, target, live), /certificate DN/);
});

test("database validation and SQL use SSH with trusted TLS; bad identity and closed tunnels block queries", { skip: process.platform === "win32" ? "The in-process PostgreSQL TLS-upgrade harness is POSIX-only; route guards remain covered on Windows." : false, timeout: 45000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dbridge-tunnel-test-"));
  const certificateUrl = new URL("../portable/node_modules/ssh2/test/fixtures/https_cert.pem", import.meta.url);
  const privateKeyUrl = new URL("../portable/node_modules/ssh2/test/fixtures/https_key.pem", import.meta.url);
  const certificatePath = fileURLToPath(certificateUrl);
  const context = createSecureContext({ key: await readFile(privateKeyUrl), cert: await readFile(certificateUrl) });
  const sockets = new Set(), sshClients = new Set();
  let sqlCount = 0, databaseLogins = 0, jumpLogins = 0;
  const forwardDestinations = [];
  const i32 = (n) => { const value = Buffer.alloc(4);value.writeInt32BE(n);return value; };
  const packet = (type, value) => Buffer.concat([Buffer.from(type), i32(value.length + 4), value]);
  const ready = (socket) => socket.write(packet("Z", Buffer.from("I")));
  const postgres = createServer((raw) => {
    sockets.add(raw);raw.on("close", () => sockets.delete(raw));raw.on("error", () => {});
    raw.once("data", (request) => {
      assert.equal(request.readInt32BE(4), 80877103, "driver requested TLS");raw.write("S");
      const socket = new TLSSocket(raw, { isServer: true, secureContext: context });
      socket.on("error", () => socket.destroy());
      let buffer = Buffer.alloc(0), startup = true;
      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= (startup ? 4 : 5)) {
          const length = buffer.readInt32BE(startup ? 0 : 1), total = startup ? length : length + 1;
          if (buffer.length < total) return;
          const message = buffer.subarray(0, total);buffer = buffer.subarray(total);
          if (startup) {
            assert.ok(message.includes(Buffer.from("user\0db-user\0")), "database identity differs from SSH identity");
            startup = false;socket.write(packet("R", i32(3)));continue;
          }
          const type = String.fromCharCode(message[0]);
          if (type === "p") {
            assert.equal(message.subarray(5, -1).toString(), "db-secret");databaseLogins += 1;
            socket.write(packet("R", i32(0)));ready(socket);
          } else if (type === "Q") {
            sqlCount += 1;
            const field = Buffer.alloc(18);field.writeInt32BE(25, 6);field.writeInt16BE(-1, 10);field.writeInt32BE(-1, 12);
            socket.write(packet("T", Buffer.concat([Buffer.from([0, 1]), Buffer.from("route\0"), field])));
            const value = Buffer.from("through SSH");
            socket.write(packet("D", Buffer.concat([Buffer.from([0, 1]), i32(value.length), value])));
            socket.write(packet("C", Buffer.from("SELECT 1\0")));ready(socket);
          } else if (type === "X") socket.end();
        }
      });
    });
  });
  await new Promise((resolve) => postgres.listen(0, "127.0.0.1", resolve));
  const dbPort = postgres.address().port;
  const sshKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" });
  const ssh = new ssh2.Server({ hostKeys: [sshKey] }, (client) => {
    sshClients.add(client);client.on("close", () => sshClients.delete(client));client.on("error", () => {});
    client.on("authentication", (auth) => {
      if (auth.method === "password" && auth.username === "jump-user" && auth.password === "jump-secret") { jumpLogins += 1;auth.accept(); }
      else auth.reject();
    });
    client.on("ready", () => {
      client.on("session", (accept) => { const session = accept();session.on("pty", (accept) => accept());session.on("shell", (accept) => { const stream = accept();stream.on("error", () => {}); }); });
      client.on("tcpip", (accept, reject, info) => {
        forwardDestinations.push([info.destIP, info.destPort]);
        if (!["localhost", "wrong.internal"].includes(info.destIP) || info.destPort !== dbPort) return reject();
        const upstream = connect(dbPort, "127.0.0.1", () => { const stream = accept();stream.on("error", () => upstream.destroy());upstream.on("error", () => stream.destroy());stream.on("close", () => upstream.destroy());upstream.pipe(stream).pipe(upstream); });
        upstream.on("error", () => {});sockets.add(upstream);upstream.on("close", () => sockets.delete(upstream));
      });
    });
  });
  await new Promise((resolve) => ssh.listen(0, "127.0.0.1", resolve));
  const reservation = createServer();await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const agentPort = reservation.address().port;await new Promise((resolve) => reservation.close(resolve));
  const agent = spawn(process.execPath, ["portable/server.mjs"], { cwd: new URL("..", import.meta.url), env: { ...process.env, DBRIDGE_PORT: String(agentPort), DBRIDGE_DATA_DIR: directory, DBRIDGE_NO_BROWSER: "1", NODE_EXTRA_CA_CERTS: certificatePath }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => { agent.kill("SIGTERM");await new Promise((resolve) => agent.exitCode !== null ? resolve() : agent.once("exit", resolve));for (const client of sshClients) client.end();for (const socket of sockets) socket.destroy();await Promise.all([new Promise((resolve) => ssh.close(resolve)), new Promise((resolve) => postgres.close(resolve))]);await rm(directory, { recursive: true, force: true }); });
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Agent startup timeout")), 10000);
    agent.stdout.on("data", (data) => { const match = data.toString().match(/running at (http:\/\/127\.0\.0\.1:\d+)/);if (match) { clearTimeout(timer);resolve(match[1]); } });
    agent.once("error", (error) => { clearTimeout(timer);reject(error); });
  });
  const paired = await (await fetch(`${origin}/api/studio/pair`, { headers: { Origin: "http://localhost:3000" } })).json();
  const call = async (path, value) => { const response = await fetch(origin + path, { method: value ? "POST" : "GET", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", "X-DBridge-Token": paired.token }, ...(value ? { body: JSON.stringify(value) } : {}) });return { status: response.status, ...(await response.json()) }; };
  assert.ok((await call("/api/connections/tunnels")).supportedEngines.includes("oracle"));
  const sshTarget = { host: "127.0.0.1", port: ssh.address().port, username: "jump-user", authMethod: "password" };
  const preflight = await call("/api/terminal/ssh/preflight", sshTarget);assert.equal(jumpLogins, 0);
  const session = await call("/api/terminal/ssh/open", { ...sshTarget, password: "jump-secret", trustHostKey: true, hostFingerprint: preflight.target.fingerprint, hostKeyType: preflight.target.keyType });
  assert.equal(session.ok, true);assert.equal(jumpLogins, 1);
  const opened = await call("/api/connections/tunnels/open", { sessionId: session.sessionId, engine: "postgres", host: "localhost", port: dbPort });
  assert.equal(opened.ok, true);assert.equal(opened.tunnel.bindHost, "127.0.0.1");assert.equal(sqlCount, 0, "opening a tunnel does not claim database validation");
  const payload = { engine: "postgres", connection: { host: "localhost", port: String(dbPort), database: "test", username: "db-user", password: "db-secret", authMode: "password", tlsMode: "require", connectionMode: "ssh", sshTunnel: opened.tunnel } };
  const validation = await call("/api/connections/check", payload);assert.equal(validation.ok, true, validation.error);
  const result = await call("/api/sql/run", { ...payload, sql: "SELECT 'through SSH' AS route", allowWrites: false });
  assert.equal(result.ok, true);assert.match(result.stdout, /through SSH/);assert.ok(databaseLogins >= 2);
  assert.ok(forwardDestinations.every(([host, port]) => host === "localhost" && port === dbPort));
  const before = sqlCount;
  const wrong = await call("/api/connections/tunnels/open", { sessionId: session.sessionId, engine: "postgres", host: "wrong.internal", port: dbPort });
  const badIdentity = await call("/api/connections/check", { ...payload, connection: { ...payload.connection, host: "wrong.internal", sshTunnel: wrong.tunnel } });
  assert.equal(badIdentity.ok, false);assert.match(badIdentity.error, /certificate|Hostname|altnames/i);assert.equal(sqlCount, before);
  await call("/api/terminal/ssh/forward/close", opened.tunnel);
  const closed = await call("/api/connections/check", payload);assert.equal(closed.ok, false);assert.match(closed.error, /tunnel is closed/);assert.equal(sqlCount, before);
  const noHandle = await call("/api/connections/check", { ...payload, connection: { ...payload.connection, sshTunnel: undefined } });assert.equal(noHandle.ok, false);assert.match(noHandle.error, /open the database tunnel/);
  await call("/api/terminal/ssh/close", { sessionId: session.sessionId });
  assert.deepEqual((await call("/api/connections/tunnels")).sessions, []);
});
