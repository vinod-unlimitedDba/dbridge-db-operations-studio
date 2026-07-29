/*
 * Interactive SSH terminal sessions for the console.
 *
 * This is the one place in DBridge where text typed by the operator reaches a
 * remote command interpreter, so the guards live here rather than in the route
 * layer: the host must already be trusted in known_hosts, its key is verified
 * on every connect, sessions are capped and idle-expired, and credentials are
 * used for the handshake and then dropped. Nothing here is ever written to disk.
 */

import { Client } from "ssh2";
import { readFile } from "node:fs/promises";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { isIP } from "node:net";

export const SSH_TERMINAL_LIMITS = {
  maxSessions: 4,
  idleMs: 15 * 60 * 1000,
  maxInputBytes: 8 * 1024,
  handshakeMs: 20000,
  scrollbackBytes: 256 * 1024,
};

const sessions = new Map();

/* ---------- input validation ---------- */

export function normalizeSshHost(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Enter the SSH hostname or IP address");
  const host = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  if (isIP(host)) return host;
  if (host.length > 253 || !/^[A-Za-z0-9_.-]+$/.test(host) || host.startsWith(".") || host.endsWith(".")) {
    throw new Error("Enter a valid hostname, IPv4 address, or bracketed IPv6 address");
  }
  const labels = host.split(".");
  if (labels.some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
    throw new Error("Enter a valid server hostname");
  }
  return host;
}

export function validateSshTarget(value) {
  const host = normalizeSshHost(value.host);

  const portRaw = String(value.port || "22").trim();
  if (!/^\d{1,5}$/.test(portRaw) || Number(portRaw) < 1 || Number(portRaw) > 65535) throw new Error("SSH port must be between 1 and 65535");

  const username = String(value.username || "").trim();
  if (!username) throw new Error("Enter the SSH username");
  if (!/^[A-Za-z0-9_.@\\-]{1,64}$/.test(username)) throw new Error("SSH username contains characters that are not permitted");

  const authMethod = ["agent", "key", "password"].includes(value.authMethod) ? value.authMethod : "agent";
  const privateKeyPath = String(value.privateKeyPath || "").trim();
  if (authMethod === "key" && !privateKeyPath) throw new Error("Select the private key file to use");

  return { host, port: Number(portRaw), username, authMethod, privateKeyPath };
}

/* ---------- known_hosts verification ---------- */

// OpenSSH stores either a plain hostname or an HMAC-SHA1 of it under a salt.
function knownHostMatches(entryHost, host, port) {
  const candidates = port === 22 ? [host, `[${host}]:${port}`] : [`[${host}]:${port}`];
  for (const raw of entryHost.split(",")) {
    const name = raw.trim();
    if (!name) continue;
    if (name.startsWith("|1|")) {
      const [, salt, digest] = name.split("|").slice(1);
      if (!salt || !digest) continue;
      for (const candidate of candidates) {
        const computed = createHmac("sha1", Buffer.from(salt, "base64")).update(candidate).digest("base64");
        if (computed === digest) return true;
      }
      continue;
    }
    if (candidates.includes(name)) return true;
  }
  return false;
}

async function readKnownHostKeys(host, port) {
  const path = join(homedir(), ".ssh", "known_hosts");
  let text;
  try { text = await readFile(path, "utf8"); }
  catch { throw new Error("No known_hosts file was found. Connect once with the OpenSSH client so the host key is recorded."); }

  const keys = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // Skip the optional @cert-authority / @revoked marker.
    const parts = (trimmed.startsWith("@") ? trimmed.slice(trimmed.indexOf(" ") + 1) : trimmed).split(/\s+/);
    if (parts.length < 3) continue;
    const [entryHost, keyType, keyData] = parts;
    if (!knownHostMatches(entryHost, host, port)) continue;
    keys.push({ keyType, keyData });
  }
  if (!keys.length) throw new Error(`${host} is not in known_hosts. Connect once with the OpenSSH client and accept the key before using the terminal.`);
  return keys;
}

export async function preflightSshTarget(input) {
  const target = validateSshTarget(input);
  const keys = await readKnownHostKeys(target.host, target.port);
  return {
    ok: true,
    host: target.host,
    port: target.port,
    username: target.username,
    authMethod: target.authMethod,
    addressFamily: isIP(target.host) || 0,
    knownHostKeys: keys.length,
    trusted: true,
  };
}

function keyMatchesKnownHosts(presented, knownKeys) {
  const presentedData = presented.toString("base64");
  return knownKeys.some((known) => {
    const candidate = Buffer.from(known.keyData, "base64");
    const offered = Buffer.from(presentedData, "base64");
    return candidate.length === offered.length && timingSafeEqual(candidate, offered);
  });
}

/* ---------- session lifecycle ---------- */

function disposeSession(session, reason) {
  if (session.disposed) return;
  session.disposed = true;
  clearInterval(session.idleTimer);
  session.emit({ type: "closed", reason });
  session.listeners.clear();
  try { session.stream?.end(); } catch { /* already gone */ }
  try { session.client?.end(); } catch { /* already gone */ }
  sessions.delete(session.id);
}

function touch(session) {
  session.lastActivity = Date.now();
}

export async function openSshSession(input) {
  if (sessions.size >= SSH_TERMINAL_LIMITS.maxSessions) {
    throw new Error(`Only ${SSH_TERMINAL_LIMITS.maxSessions} SSH terminal sessions can be open at once`);
  }
  const target = validateSshTarget(input);
  const knownKeys = await readKnownHostKeys(target.host, target.port);

  let privateKey;
  if (target.authMethod === "key") {
    try { privateKey = await readFile(target.privateKeyPath); }
    catch { throw new Error("The private key file could not be read"); }
  }

  const session = {
    id: randomBytes(12).toString("hex"),
    host: target.host,
    port: target.port,
    username: target.username,
    authMethod: target.authMethod,
    openedAt: new Date().toISOString(),
    lastActivity: Date.now(),
    listeners: new Set(),
    scrollback: [],
    scrollbackBytes: 0,
    disposed: false,
    emit(event) {
      const payload = `data: ${JSON.stringify(event)}\n\n`;
      for (const res of this.listeners) {
        try { res.write(payload); } catch { this.listeners.delete(res); }
      }
    },
  };

  const client = new Client();
  session.client = client;

  await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { client.end(); } catch { /* not connected */ }
      rejectPromise(error instanceof Error ? error : new Error(String(error)));
    };

    const handshakeTimer = setTimeout(() => fail(new Error("SSH handshake timed out")), SSH_TERMINAL_LIMITS.handshakeMs);

    client.on("ready", () => {
      client.shell({ term: "xterm-256color", cols: 80, rows: 24 }, (error, stream) => {
        if (error) { clearTimeout(handshakeTimer); return fail(error); }
        session.stream = stream;

        stream.on("data", (chunk) => {
          touch(session);
          session.scrollback.push(chunk);
          session.scrollbackBytes += chunk.length;
          while (session.scrollbackBytes > SSH_TERMINAL_LIMITS.scrollbackBytes && session.scrollback.length > 1) {
            session.scrollbackBytes -= session.scrollback.shift().length;
          }
          session.emit({ type: "output", data: chunk.toString("base64") });
        });
        stream.stderr?.on("data", (chunk) => {
          session.emit({ type: "output", data: chunk.toString("base64") });
        });
        stream.on("close", () => disposeSession(session, "The remote shell closed the session"));

        clearTimeout(handshakeTimer);
        settled = true;
        resolvePromise();
      });
    });

    client.on("error", (error) => { clearTimeout(handshakeTimer); fail(error); });
    client.on("close", () => {
      clearTimeout(handshakeTimer);
      if (!settled) fail(new Error("The SSH connection closed during the handshake"));
      else disposeSession(session, "The SSH connection closed");
    });

    const config = {
      host: target.host,
      port: target.port,
      username: target.username,
      readyTimeout: SSH_TERMINAL_LIMITS.handshakeMs,
      // Refuse any key that is not already trusted; never prompt to accept one.
      hostVerifier: (key) => keyMatchesKnownHosts(key, knownKeys),
    };
    if (target.authMethod === "agent") {
      const agent = process.env.SSH_AUTH_SOCK || (process.platform === "win32" ? "\\\\.\\pipe\\openssh-ssh-agent" : "");
      if (!agent) return fail(new Error("No SSH agent was found. Start the OpenSSH agent or choose key or password authentication."));
      config.agent = agent;
    } else if (target.authMethod === "key") {
      config.privateKey = privateKey;
      if (input.passphrase) config.passphrase = String(input.passphrase);
    } else {
      if (!input.password) return fail(new Error("Enter the SSH password"));
      config.password = String(input.password);
    }

    try { client.connect(config); } catch (error) { fail(error); }
  });

  session.idleTimer = setInterval(() => {
    if (Date.now() - session.lastActivity > SSH_TERMINAL_LIMITS.idleMs) {
      disposeSession(session, "The session was closed after being idle");
    }
  }, 30000);

  sessions.set(session.id, session);
  return describeSession(session);
}

export function describeSession(session) {
  return {
    sessionId: session.id,
    host: session.host,
    port: session.port,
    username: session.username,
    authMethod: session.authMethod,
    openedAt: session.openedAt,
  };
}

export function listSshSessions() {
  return [...sessions.values()].map(describeSession);
}

function requireSession(sessionId) {
  const session = sessions.get(String(sessionId || ""));
  if (!session || session.disposed) throw new Error("That SSH terminal session is no longer open");
  return session;
}

export function attachSshStream(sessionId, res, securityHeaders) {
  const session = requireSession(sessionId);
  res.writeHead(200, {
    ...securityHeaders,
    "Content-Type": "text/event-stream; charset=utf-8",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ type: "ready", ...describeSession(session) })}\n\n`);
  // Replay the buffered scrollback so a reattached tab is not blank.
  for (const chunk of session.scrollback) {
    res.write(`data: ${JSON.stringify({ type: "output", data: chunk.toString("base64") })}\n\n`);
  }
  session.listeners.add(res);
  const keepAlive = setInterval(() => { try { res.write(": keep-alive\n\n"); } catch { /* closed */ } }, 25000);
  res.on("close", () => { clearInterval(keepAlive); session.listeners.delete(res); });
}

export function writeToSshSession(sessionId, data) {
  const session = requireSession(sessionId);
  const text = String(data ?? "");
  if (Buffer.byteLength(text, "utf8") > SSH_TERMINAL_LIMITS.maxInputBytes) throw new Error("That input is too large for one keystroke batch");
  touch(session);
  session.stream.write(text);
  return { ok: true };
}

export function resizeSshSession(sessionId, cols, rows) {
  const session = requireSession(sessionId);
  const safeCols = Math.min(Math.max(Number(cols) || 80, 20), 500);
  const safeRows = Math.min(Math.max(Number(rows) || 24, 5), 200);
  touch(session);
  session.stream.setWindow(safeRows, safeCols, 0, 0);
  return { ok: true, cols: safeCols, rows: safeRows };
}

export function closeSshSession(sessionId) {
  const session = requireSession(sessionId);
  disposeSession(session, "The session was closed from the console");
  return { ok: true };
}

export function closeAllSshSessions() {
  for (const session of [...sessions.values()]) disposeSession(session, "The local service is shutting down");
}
