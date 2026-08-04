const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 100;
const SCOPES = new Set(["database", "ssh"]);

function locator(scope, id) {
  const cleanScope = String(scope || "").toLowerCase();
  const cleanId = String(id || "").trim();
  if (!SCOPES.has(cleanScope)) throw new Error("Unsupported session credential scope");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/.test(cleanId)) throw new Error("Enter a valid session credential identifier");
  return { scope: cleanScope, id: cleanId, key: `${cleanScope}:${cleanId}` };
}

function secret(value, label) {
  const clean = String(value || "");
  if (clean.length > 1000 || /[\r\n\0]/.test(clean)) throw new Error(`${label} contains unsupported characters`);
  return clean;
}

export function createSessionCredentialVault({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_LIMIT, now = () => Date.now() } = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs < 1000) throw new Error("Session credential TTL is invalid");
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 1000) throw new Error("Session credential limit is invalid");
  const entries = new Map();
  const prune = () => { const current = now(); for (const [key, value] of entries) if (value.expiresAt <= current) { value.username = ""; value.password = ""; value.passphrase = ""; entries.delete(key); } };
  const status = (scope, id) => { prune(); const target = locator(scope, id); const value = entries.get(target.key); return value ? { available: true, scope: target.scope, id: target.id, expiresAt: new Date(value.expiresAt).toISOString() } : { available: false, scope: target.scope, id: target.id, expiresAt: null }; };
  const store = (input = {}) => {
    prune(); const target = locator(input.scope, input.id); const username = String(input.username || "").trim();
    if (username.length > 255 || /[\r\n\0]/.test(username)) throw new Error("Username contains unsupported characters");
    const password = secret(input.password, "Password"); const passphrase = secret(input.passphrase, "Passphrase");
    if (!password && !passphrase) throw new Error("Enter a password or passphrase to remember for this agent session");
    if (!entries.has(target.key) && entries.size >= maxEntries) throw new Error("The session credential limit has been reached");
    const current = now(); entries.set(target.key, { ...target, username, password, passphrase, createdAt: current, expiresAt: current + ttlMs });
    return status(target.scope, target.id);
  };
  const resolve = (scope, id) => { prune(); const target = locator(scope, id); const value = entries.get(target.key); if (!value) return null; value.expiresAt = now() + ttlMs; return { username: value.username, password: value.password, passphrase: value.passphrase, expiresAt: value.expiresAt }; };
  const remove = (scope, id) => { const target = locator(scope, id); const value = entries.get(target.key); if (value) { value.username = ""; value.password = ""; value.passphrase = ""; } entries.delete(target.key); return { available: false, scope: target.scope, id: target.id, expiresAt: null }; };
  const clear = () => { for (const value of entries.values()) { value.username = ""; value.password = ""; value.passphrase = ""; } entries.clear(); };
  return { store, status, resolve, remove, clear, get size() { prune(); return entries.size; } };
}
