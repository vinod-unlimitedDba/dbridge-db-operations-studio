/*
 * Interactive SSH terminal sessions for the console.
 *
 * This is the one place in DBridge where text typed by the operator reaches a
 * remote command interpreter, so the guards live here rather than in the route
 * layer: a first-seen key must be approved in Studio and is then pinned locally;
 * every later handshake must match it. Sessions are capped and idle-expired, and credentials are
 * used for the handshake and then dropped. Only non-secret host fingerprints are persisted.
 */

import { Client } from "ssh2";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createServer as createTcpServer, isIP } from "node:net";
import { fingerprintSshHostKey, forgetTrustedSshHost, getTrustedSshHost, inspectSshTrust, trustSshHost, validateSshFingerprint } from "./ssh-trust.mjs";

export const SSH_TERMINAL_LIMITS = {
  maxSessions: 8,
  maxForwardsPerSession: 4,
  idleMs: 15 * 60 * 1000,
  maxInputBytes: 8 * 1024,
  handshakeMs: 20000,
  scrollbackBytes: 256 * 1024,
  maxSftpEntries: 500,
  maxSftpDownloadBytes: 2 * 1024 * 1024,
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

  const keepaliveSeconds = Math.min(Math.max(Number(value.keepaliveSeconds) || 30, 5), 300);
  const cols = Math.min(Math.max(Number(value.cols) || 100, 20), 500);
  const rows = Math.min(Math.max(Number(value.rows) || 30, 5), 200);
  return { host, port: Number(portRaw), username, authMethod, privateKeyPath, keepaliveSeconds, cols, rows };
}

export function validateSftpPath(value) {
  const path = String(value || ".").trim() || ".";
  if (path.length > 2048 || path.includes("\0") || /[\r\n]/.test(path)) throw new Error("The remote SFTP path is invalid");
  return path;
}

export function validateLocalForwardTarget(value) {
  const remoteHost = normalizeSshHost(value.remoteHost || "127.0.0.1");
  const remotePort = Number(value.remotePort);
  const requestedLocalPort = value.localPort === "" || value.localPort === undefined ? 0 : Number(value.localPort);
  if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) throw new Error("Remote port must be between 1 and 65535");
  if (!Number.isInteger(requestedLocalPort) || requestedLocalPort < 0 || requestedLocalPort > 65535 || (requestedLocalPort > 0 && requestedLocalPort < 1024)) {
    throw new Error("Local port must be automatic (0) or between 1024 and 65535");
  }
  return { remoteHost, remotePort, requestedLocalPort };
}

/* ---------- DBridge trust-on-first-use verification ---------- */

export async function preflightSshTarget(input) {
  const target = validateSshTarget(input);
  const trust = await inspectSshTrust({ ...target, timeoutMs: SSH_TERMINAL_LIMITS.handshakeMs });
  return {
    ok: true,
    host: target.host,
    port: target.port,
    username: target.username,
    authMethod: target.authMethod,
    addressFamily: isIP(target.host) || 0,
    fingerprint: trust.fingerprint,
    keyType: trust.keyType,
    hostKeys: [{ type: trust.keyType, fingerprint: trust.fingerprint }],
    trustStatus: trust.trustStatus,
    trusted: trust.trusted,
    requiresTrust: trust.requiresTrust,
    previousFingerprint: trust.previousFingerprint,
    firstSeenAt: trust.firstSeenAt,
    keepaliveSeconds: target.keepaliveSeconds,
    credentialSent: false,
  };
}

export async function forgetSshHostTrust(input) {
  const target = validateSshTarget(input);
  return await forgetTrustedSshHost(target.host, target.port, input.confirmation);
}
/* ---------- session lifecycle ---------- */

function disposeSession(session, reason) {
  if (session.disposed) return;
  session.disposed = true;
  clearInterval(session.idleTimer);
  session.emit({ type: "closed", reason });
  session.listeners.clear();
  for (const forwarding of session.forwards?.values?.() || []) {
    for (const socket of forwarding.sockets || []) socket.destroy();
    try { forwarding.server.close(); } catch { /* already closed */ }
  }
  session.forwards?.clear?.();
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
  let pinnedHost = await getTrustedSshHost(target.host, target.port);
  let expectedFingerprint;
  if (pinnedHost) expectedFingerprint = pinnedHost.fingerprint;
  else if (input.trustHostKey === true) {
    expectedFingerprint = validateSshFingerprint(input.hostFingerprint);
    // The operator approved the scan result before credentials are used. Pin it now,
    // so a bad password does not force approval again and the real handshake is still checked.
    pinnedHost = await trustSshHost(target.host, target.port, expectedFingerprint, input.hostKeyType);
  } else throw new Error("Inspect and approve this SSH host key before the first connection");

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
    keepaliveSeconds: target.keepaliveSeconds,
    hostKeys: [{ type: pinnedHost?.keyType || String(input.hostKeyType || "ssh-host-key"), fingerprint: expectedFingerprint }],
    listeners: new Set(),
    forwards: new Map(),
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
      client.shell({ term: "xterm-256color", cols: target.cols, rows: target.rows }, (error, stream) => {
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

    client.on("error", (error) => { clearTimeout(handshakeTimer); fail(session.hostKeyMismatch ? new Error("SSH host key changed. The connection was blocked before authentication.") : error); });
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
      keepaliveInterval: target.keepaliveSeconds * 1000,
      keepaliveCountMax: 3,
      // Credentials are used only if the presented key matches the pinned or just-approved fingerprint.
      hostVerifier: (key) => {
        const presentedFingerprint = fingerprintSshHostKey(key);
        const accepted = presentedFingerprint === expectedFingerprint;
        session.verifiedHostKey = presentedFingerprint;
        session.hostKeyMismatch = !accepted;
        return accepted;
      },
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
    lastActivity: new Date(session.lastActivity).toISOString(),
    keepaliveSeconds: session.keepaliveSeconds,
    hostKeys: session.hostKeys,
    verifiedHostKey: session.verifiedHostKey || "",
    forwards: [...session.forwards.values()].map(describeForward),
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

function describeForward(forwarding) {
  return {
    forwardId: forwarding.id,
    bindHost: "127.0.0.1",
    localPort: forwarding.localPort,
    remoteHost: forwarding.remoteHost,
    remotePort: forwarding.remotePort,
    openedAt: forwarding.openedAt,
    activeConnections: forwarding.sockets.size,
  };
}

export function listSshForwards(sessionId) {
  const session = requireSession(sessionId);
  return [...session.forwards.values()].map(describeForward);
}

export async function openSshLocalForward(sessionId, input) {
  const session = requireSession(sessionId);
  if (session.forwards.size >= SSH_TERMINAL_LIMITS.maxForwardsPerSession) {
    throw new Error(`Only ${SSH_TERMINAL_LIMITS.maxForwardsPerSession} local forwards can be open per SSH session`);
  }
  const target = validateLocalForwardTarget(input);
  const forwarding = {
    id: randomBytes(8).toString("hex"),
    localPort: 0,
    remoteHost: target.remoteHost,
    remotePort: target.remotePort,
    openedAt: new Date().toISOString(),
    sockets: new Set(),
    server: null,
  };
  const server = createTcpServer((socket) => {
    forwarding.sockets.add(socket);
    socket.on("close", () => forwarding.sockets.delete(socket));
    socket.on("error", () => { /* the socket closes itself */ });
    session.client.forwardOut("127.0.0.1", Number(socket.remotePort) || 0, target.remoteHost, target.remotePort, (error, stream) => {
      if (error) { socket.destroy(new Error("The SSH destination refused the forwarded connection")); return; }
      stream.on("error", () => socket.destroy());
      socket.pipe(stream).pipe(socket);
    });
  });
  forwarding.server = server;
  await new Promise((resolvePromise, rejectPromise) => {
    const fail = (error) => { server.close(); rejectPromise(error); };
    server.once("error", fail);
    server.listen(target.requestedLocalPort, "127.0.0.1", () => {
      server.off("error", fail);
      const address = server.address();
      forwarding.localPort = typeof address === "object" && address ? address.port : target.requestedLocalPort;
      resolvePromise();
    });
  });
  session.forwards.set(forwarding.id, forwarding);
  touch(session);
  session.emit({ type: "forward", action: "opened", forward: describeForward(forwarding) });
  return describeForward(forwarding);
}

export async function closeSshForward(sessionId, forwardId) {
  const session = requireSession(sessionId);
  const forwarding = session.forwards.get(String(forwardId || ""));
  if (!forwarding) throw new Error("That local forward is no longer open");
  for (const socket of forwarding.sockets) socket.destroy();
  await new Promise((resolvePromise) => forwarding.server.close(() => resolvePromise()));
  session.forwards.delete(forwarding.id);
  touch(session);
  session.emit({ type: "forward", action: "closed", forwardId: forwarding.id });
  return { ok: true, forwardId: forwarding.id };
}

function openSftp(session) {
  return new Promise((resolvePromise, rejectPromise) => {
    session.client.sftp((error, sftp) => error ? rejectPromise(error) : resolvePromise(sftp));
  });
}

export async function listSftpDirectory(sessionId, remotePath) {
  const session = requireSession(sessionId);
  const path = validateSftpPath(remotePath);
  const sftp = await openSftp(session);
  try {
    const entries = await new Promise((resolvePromise, rejectPromise) => {
      sftp.readdir(path, (error, list) => error ? rejectPromise(error) : resolvePromise(list || []));
    });
    if (entries.length > SSH_TERMINAL_LIMITS.maxSftpEntries) throw new Error(`That directory has more than ${SSH_TERMINAL_LIMITS.maxSftpEntries} entries. Open a narrower path.`);
    touch(session);
    return {
      path,
      entries: entries.map((entry) => ({
        name: entry.filename,
        longname: entry.longname,
        type: entry.attrs?.isDirectory?.() ? "directory" : entry.attrs?.isSymbolicLink?.() ? "symlink" : "file",
        size: Number(entry.attrs?.size || 0),
        modifiedAt: entry.attrs?.mtime ? new Date(entry.attrs.mtime * 1000).toISOString() : null,
        permissions: entry.attrs?.mode ? `0${(entry.attrs.mode & 0o777).toString(8)}` : "",
      })).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1)),
    };
  } finally {
    try { sftp.end(); } catch { /* channel already closed */ }
  }
}

export async function readSftpFile(sessionId, remotePath) {
  const session = requireSession(sessionId);
  const path = validateSftpPath(remotePath);
  const sftp = await openSftp(session);
  try {
    const attrs = await new Promise((resolvePromise, rejectPromise) => {
      sftp.stat(path, (error, value) => error ? rejectPromise(error) : resolvePromise(value));
    });
    if (!attrs?.isFile?.()) throw new Error("Only regular files can be downloaded");
    if (attrs.size > SSH_TERMINAL_LIMITS.maxSftpDownloadBytes) throw new Error(`SFTP downloads are limited to ${SSH_TERMINAL_LIMITS.maxSftpDownloadBytes / 1024 / 1024} MB`);
    const chunks = [];
    let bytes = 0;
    await new Promise((resolvePromise, rejectPromise) => {
      const stream = sftp.createReadStream(path);
      stream.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > SSH_TERMINAL_LIMITS.maxSftpDownloadBytes) {
          stream.destroy(new Error("The remote file exceeded the download limit"));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", resolvePromise);
      stream.on("error", rejectPromise);
    });
    touch(session);
    const data = Buffer.concat(chunks);
    return { path, size: data.length, data: data.toString("base64") };
  } finally {
    try { sftp.end(); } catch { /* channel already closed */ }
  }
}

export function closeSshSession(sessionId) {
  const session = requireSession(sessionId);
  disposeSession(session, "The session was closed from the console");
  return { ok: true };
}

export function closeAllSshSessions() {
  for (const session of [...sessions.values()]) disposeSession(session, "The local service is shutting down");
}
