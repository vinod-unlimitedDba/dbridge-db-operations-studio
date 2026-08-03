/*
 * DBridge-owned SSH trust-on-first-use store.
 *
 * A key scan ends before authentication, so no password, private key, or agent
 * signature is sent until the operator has approved the displayed fingerprint.
 * Once approved, the fingerprint is pinned locally and every later handshake
 * must match it. OpenSSH known_hosts is deliberately not read or modified.
 */

import { Client } from "ssh2";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

const TRUST_ROOT = process.env.DBRIDGE_DATA_DIR
  ? resolve(process.env.DBRIDGE_DATA_DIR)
  : join(process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd(), "DBridge Portable");
const TRUST_FILE = join(TRUST_ROOT, "ssh-trusted-hosts.json");
const MAX_TRUSTED_HOSTS = 256;
let trustWriteQueue = Promise.resolve();

export function fingerprintSshHostKey(key) {
  return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

export function validateSshFingerprint(value) {
  const fingerprint = String(value || "").trim();
  if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) throw new Error("The SSH host fingerprint is invalid");
  return fingerprint;
}

export function sshTrustStatus(trustedFingerprint, presentedFingerprint) {
  const presented = validateSshFingerprint(presentedFingerprint);
  if (!trustedFingerprint) return "new";
  return validateSshFingerprint(trustedFingerprint) === presented ? "trusted" : "changed";
}

function hostId(host, port) {
  return `${String(host).toLowerCase()}:${Number(port)}`;
}

function hostKeyType(key) {
  try {
    const length = key.readUInt32BE(0);
    if (length > 0 && length <= 128 && key.length >= length + 4) return key.subarray(4, length + 4).toString("ascii");
  } catch { /* report a generic server-key type */ }
  return "ssh-host-key";
}

async function readTrustStore() {
  await trustWriteQueue.catch(() => {});
  try {
    const parsed = JSON.parse(await readFile(TRUST_FILE, "utf8"));
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return entries.filter((entry) => entry && typeof entry.host === "string" && Number.isInteger(entry.port) && /^SHA256:[A-Za-z0-9+/]{43}$/.test(entry.fingerprint)).slice(0, MAX_TRUSTED_HOSTS);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw new Error("The local SSH trust store could not be read");
  }
}

async function writeTrustStore(entries) {
  const clean = entries.slice(0, MAX_TRUSTED_HOSTS);
  trustWriteQueue = trustWriteQueue.catch(() => {}).then(async () => {
    await mkdir(TRUST_ROOT, { recursive: true });
    await writeFile(TRUST_FILE, JSON.stringify({ version: 1, entries: clean }, null, 2), { encoding: "utf8", mode: 0o600 });
  });
  try { await trustWriteQueue; }
  catch { throw new Error("The local SSH host fingerprint could not be saved"); }
}

export async function getTrustedSshHost(host, port) {
  const id = hostId(host, port);
  return (await readTrustStore()).find((entry) => entry.id === id) || null;
}

export async function trustSshHost(host, port, fingerprint, keyType = "ssh-host-key") {
  const approved = validateSshFingerprint(fingerprint);
  const entries = await readTrustStore();
  const id = hostId(host, port);
  const existing = entries.find((entry) => entry.id === id);
  if (existing && existing.fingerprint !== approved) throw new Error("The pinned SSH host key changed. Forget the old pin explicitly before trusting a replacement.");
  const now = new Date().toISOString();
  const safeKeyType = /^[A-Za-z0-9@._+-]{1,80}$/.test(String(keyType || "")) ? String(keyType) : "ssh-host-key";
  const entry = { id, host, port, fingerprint: approved, keyType: safeKeyType, firstSeenAt: existing?.firstSeenAt || now, lastSeenAt: now };
  await writeTrustStore([entry, ...entries.filter((item) => item.id !== id)]);
  return entry;
}

export async function forgetTrustedSshHost(host, port, confirmation) {
  const expected = `FORGET ${host}:${port}`;
  if (String(confirmation || "").trim() !== expected) throw new Error(`Type ${expected} to forget the pinned SSH host key`);
  const entries = await readTrustStore();
  const id = hostId(host, port);
  const removed = entries.find((entry) => entry.id === id);
  if (!removed) return { ok: true, removed: false };
  await writeTrustStore(entries.filter((entry) => entry.id !== id));
  return { ok: true, removed: true };
}

export async function inspectSshHostKey({ host, port, username, timeoutMs = 20000 }) {
  const client = new Client();
  return await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let captured = null;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { client.end(); } catch { /* socket is already closed */ }
      if (captured) resolvePromise(captured);
      else rejectPromise(error instanceof Error ? error : new Error(String(error || "SSH host-key inspection failed")));
    };
    const timer = setTimeout(() => finish(new Error("SSH host-key inspection timed out")), timeoutMs);
    client.on("error", (error) => finish(error));
    client.on("close", () => finish(new Error("The SSH server closed before presenting a host key")));
    try {
      client.connect({
        host,
        port,
        username: username || "dbridge-keyscan",
        readyTimeout: timeoutMs,
        // Returning false ends the scan before SSH authentication starts.
        hostVerifier: (key) => {
          captured = { fingerprint: fingerprintSshHostKey(key), keyType: hostKeyType(key) };
          queueMicrotask(() => finish());
          return false;
        },
      });
    } catch (error) { finish(error); }
  });
}

export async function inspectSshTrust(target) {
  const presented = await inspectSshHostKey(target);
  const pinned = await getTrustedSshHost(target.host, target.port);
  const trustStatus = sshTrustStatus(pinned?.fingerprint, presented.fingerprint);
  return {
    ...presented,
    trustStatus,
    trusted: trustStatus === "trusted",
    requiresTrust: trustStatus === "new",
    previousFingerprint: trustStatus === "changed" ? pinned.fingerprint : "",
    firstSeenAt: pinned?.firstSeenAt || "",
  };
}
