/*
 * Interactive SSH terminal UI.
 *
 * Each live tab maps to one bounded backend session. The browser stores only
 * optional non-secret server profile metadata; passwords and passphrases are
 * cleared immediately after the handshake and never persisted.
 */

(() => {
  const el = (id) => document.getElementById(id);
  const token = document.querySelector('meta[name="dbridge-token"]')?.content || "";
  const PROFILE_KEY = "dbridge.ssh.serverProfiles.v2";
  const MAX_UI_SESSIONS = 4;
  const sessions = new Map();
  let activeId = "";
  let connecting = false;
  let profiles = [];

  function notify(message, isError = false) {
    if (typeof window.toast === "function") window.toast(message, isError);
    else if (isError) console.error(message);
  }

  async function call(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", "X-DBridge-Token": token, ...(options.headers || {}) },
    });
    const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
    if (!response.ok || result.ok === false) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }

  function readProfiles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || "[]");
      profiles = Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.host).slice(0, 30) : [];
    } catch {
      profiles = [];
    }
  }

  function saveProfiles() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles)); } catch { /* preference only */ }
  }

  function sessionLabel(session) {
    return `${session.username}@${session.host}`;
  }

  function activeSession() {
    return sessions.get(activeId) || null;
  }

  function setState(kind, label) {
    const badge = el("sshTerminalState");
    if (!badge) return;
    badge.className = `ssh-terminal-state ${kind}`.trim();
    badge.innerHTML = `<i></i>${label}`;
  }

  function updateState() {
    const active = activeSession();
    const live = [...sessions.values()].filter((item) => item.connected).length;
    if (connecting) setState("busy", "CONNECTING");
    else if (active?.connected) setState("live", `${live} CONNECTED`);
    else if (sessions.size) setState("", `${live} CONNECTED`);
    else setState("", "DISCONNECTED");

    el("sshTerminalConnect").disabled = connecting || sessions.size >= MAX_UI_SESSIONS;
    el("sshTerminalDisconnect").disabled = !active?.connected;
    el("sshTerminalTarget").textContent = active
      ? `${sessionLabel(active)}:${active.port} · ${active.connected ? "connected" : active.closeReason || "closed"}`
      : "Not connected";
  }

  function updateAuthFields() {
    const method = el("sshTerminalAuth").value;
    el("sshTerminalKeyField").classList.toggle("hidden", method !== "key");
    el("sshTerminalPassphraseField").classList.toggle("hidden", method !== "key");
    el("sshTerminalPasswordField").classList.toggle("hidden", method !== "password");
  }

  function terminalTheme() {
    return document.documentElement.dataset.theme === "light"
      ? { background: "#ffffff", foreground: "#1d2433", cursor: "#5b5bf6", selectionBackground: "#d8dcff" }
      : { background: "#0f131c", foreground: "#dfe6f2", cursor: "#8b8bff", selectionBackground: "#2b3352" };
  }

  function buildTerminal(session) {
    const mount = document.createElement("div");
    mount.className = "ssh-dynamic-mount";
    mount.dataset.sshSession = session.id;
    el("sshTerminalSurface").appendChild(mount);

    const term = new window.Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: terminalTheme(),
    });
    const fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(mount);
    fit.fit();
    term.onData((data) => {
      if (!session.connected) return;
      call("/api/terminal/ssh/input", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id, data }),
      }).catch((error) => notify(error.message, true));
    });
    session.mount = mount;
    session.term = term;
    session.fit = fit;
  }

  function sendResize(session) {
    if (!session?.connected || !session.term) return;
    call("/api/terminal/ssh/resize", {
      method: "POST",
      body: JSON.stringify({ sessionId: session.id, cols: session.term.cols, rows: session.term.rows }),
    }).catch(() => { /* session may be closing */ });
  }

  function decodeOutput(value) {
    const raw = atob(value);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }

  async function consumeStream(session) {
    const controller = new AbortController();
    session.abort = controller;
    const response = await fetch(`/api/terminal/ssh/stream?session=${encodeURIComponent(session.id)}`, {
      headers: { "X-DBridge-Token": token },
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error("The terminal stream could not be opened");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split;
      while ((split = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const line = frame.split("\n").find((candidate) => candidate.startsWith("data: "));
        if (!line) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }
        if (event.type === "output" && session.term) {
          session.term.write(decodeOutput(event.data));
        } else if (event.type === "closed") {
          markClosed(session, event.reason || "The remote shell closed");
          return;
        }
      }
    }
  }

  function markClosed(session, reason) {
    if (!session || !sessions.has(session.id)) return;
    session.connected = false;
    session.closeReason = reason;
    if (session.abort) {
      try { session.abort.abort(); } catch { /* already closed */ }
      session.abort = null;
    }
    if (session.term) {
      session.term.write(`\r\n\x1b[33m${reason}\x1b[0m\r\n`);
      session.term.options.disableStdin = true;
    }
    renderTabs();
    updateState();
  }

  function selectSession(id) {
    if (!sessions.has(id)) return;
    activeId = id;
    sessions.forEach((session, sessionId) => {
      if (session.mount) session.mount.hidden = sessionId !== id;
    });
    el("sshTerminalEmpty").classList.add("hidden");
    renderTabs();
    const active = activeSession();
    requestAnimationFrame(() => {
      active?.fit?.fit();
      sendResize(active);
      active?.term?.focus();
    });
    updateState();
  }

  function renderTabs() {
    const tabs = el("sshSessionTabs");
    if (!tabs) return;
    const add = `<button type="button" class="ssh-session-add" id="sshSessionAdd" title="Prepare another server tab">+</button>`;
    tabs.innerHTML = [...sessions.values()].map((session) => `
      <div class="ssh-session-tab ${session.id === activeId ? "active" : ""}" data-ssh-tab="${session.id}" role="tab" tabindex="0" title="${sessionLabel(session)}:${session.port}">
        <i style="${session.connected ? "" : "background:#64748b"}"></i>
        <span>${sessionLabel(session)}</span>
        <button type="button" data-ssh-close="${session.id}" aria-label="Close ${sessionLabel(session)}">×</button>
      </div>`).join("") + add;

    tabs.querySelectorAll("[data-ssh-tab]").forEach((button) => {
      button.addEventListener("click", (event) => {
        if (event.target.closest("[data-ssh-close]")) return;
        selectSession(button.dataset.sshTab);
      });
    });
    tabs.querySelectorAll("[data-ssh-close]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTab(button.dataset.sshClose);
      });
    });
    el("sshSessionAdd")?.addEventListener("click", prepareNewServer);
  }

  async function closeBackendSession(session) {
    if (!session?.connected) return;
    try {
      await call("/api/terminal/ssh/close", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.id }),
      });
    } catch {
      /* backend may already have closed it */
    }
  }

  async function closeTab(id) {
    const session = sessions.get(id);
    if (!session) return;
    await closeBackendSession(session);
    if (session.abort) {
      try { session.abort.abort(); } catch { /* already closed */ }
    }
    session.term?.dispose();
    session.mount?.remove();
    sessions.delete(id);
    if (activeId === id) activeId = [...sessions.keys()].at(-1) || "";
    if (activeId) selectSession(activeId);
    else {
      el("sshTerminalEmpty").classList.remove("hidden");
      renderTabs();
      updateState();
    }
  }

  function readConnectionForm() {
    return {
      host: el("sshTerminalHost").value.trim(),
      port: el("sshTerminalPort").value.trim() || "22",
      username: el("sshTerminalUsername").value.trim(),
      authMethod: el("sshTerminalAuth").value,
      privateKeyPath: el("sshTerminalKeyPath").value.trim(),
      passphrase: el("sshTerminalPassphrase").value,
      password: el("sshTerminalPassword").value,
    };
  }

  function clearSecrets() {
    el("sshTerminalPassword").value = "";
    el("sshTerminalPassphrase").value = "";
  }

  async function preflight() {
    const resultNode = el("sshPreflightResult");
    resultNode.className = "ssh-preflight-result";
    resultNode.innerHTML = "<i></i><span><b>Checking target trust…</b> Validating address, port and known_hosts entry.</span>";
    try {
      const result = await call("/api/terminal/ssh/preflight", {
        method: "POST",
        body: JSON.stringify(readConnectionForm()),
      });
      const target = result.target;
      const family = target.addressFamily === 6 ? "IPv6" : target.addressFamily === 4 ? "IPv4" : "hostname / SSH alias";
      resultNode.className = "ssh-preflight-result good";
      resultNode.innerHTML = `<i></i><span><b>Trusted target ready</b> ${target.host}:${target.port} · ${family} · ${target.knownHostKeys} matching host key${target.knownHostKeys === 1 ? "" : "s"}.</span>`;
    } catch (error) {
      resultNode.className = "ssh-preflight-result bad";
      resultNode.innerHTML = `<i></i><span><b>Preflight blocked</b> ${String(error.message)}</span>`;
      notify(error.message, true);
    }
  }

  async function connect() {
    if (connecting) return;
    if (sessions.size >= MAX_UI_SESSIONS) return notify(`Close a server tab before opening more than ${MAX_UI_SESSIONS} sessions`, true);
    connecting = true;
    updateState();
    const payload = readConnectionForm();
    try {
      const opened = await call("/api/terminal/ssh/open", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      clearSecrets();
      const session = {
        id: opened.sessionId,
        host: opened.host,
        port: opened.port,
        username: opened.username,
        authMethod: opened.authMethod,
        connected: true,
        openedAt: opened.openedAt,
        term: null,
        fit: null,
        mount: null,
        abort: null,
      };
      sessions.set(session.id, session);
      buildTerminal(session);
      selectSession(session.id);
      renderTabs();
      sendResize(session);
      consumeStream(session).catch((error) => {
        if (error.name !== "AbortError") markClosed(session, error.message);
      });
      notify(`Connected to ${sessionLabel(session)}`);
    } catch (error) {
      setState("error", "BLOCKED");
      notify(error.message, true);
    } finally {
      clearSecrets();
      connecting = false;
      updateState();
    }
  }

  async function disconnectActive() {
    const session = activeSession();
    if (!session) return;
    await closeBackendSession(session);
    markClosed(session, "Disconnected");
  }

  function prepareNewServer() {
    if (sessions.size >= MAX_UI_SESSIONS) return notify(`Maximum ${MAX_UI_SESSIONS} server tabs`, true);
    activeId = "";
    sessions.forEach((session) => { if (session.mount) session.mount.hidden = true; });
    el("sshTerminalEmpty").classList.remove("hidden");
    el("sshTerminalHost").focus();
    renderTabs();
    updateState();
  }

  function renderProfiles() {
    const select = el("sshSavedProfile");
    if (!select) return;
    const selected = select.value;
    select.innerHTML = '<option value="">Select saved server…</option>' + profiles.map((profile) =>
      `<option value="${profile.id}">${profile.name} · ${profile.username}@${profile.host}:${profile.port}</option>`).join("");
    if (profiles.some((profile) => profile.id === selected)) select.value = selected;
  }

  function applyProfile() {
    const profile = profiles.find((item) => item.id === el("sshSavedProfile").value);
    if (!profile) return;
    el("sshProfileName").value = profile.name;
    el("sshTerminalHost").value = profile.host;
    el("sshTerminalPort").value = profile.port || "22";
    el("sshTerminalUsername").value = profile.username;
    el("sshTerminalAuth").value = profile.authMethod || "agent";
    updateAuthFields();
    el("sshPreflightResult").className = "ssh-preflight-result";
    el("sshPreflightResult").innerHTML = `<i></i><span><b>${profile.name}</b> Profile loaded. Secrets were not saved.</span>`;
  }

  function saveProfile() {
    const form = readConnectionForm();
    const name = el("sshProfileName").value.trim();
    if (!name || !form.host || !form.username) return notify("Enter a profile name, server and username", true);
    const existing = profiles.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const profile = {
      id: existing?.id || `ssh-${Date.now().toString(36)}`,
      name: name.slice(0, 80),
      host: form.host.slice(0, 255),
      port: form.port,
      username: form.username.slice(0, 64),
      authMethod: form.authMethod,
    };
    profiles = [profile, ...profiles.filter((item) => item.id !== profile.id)].slice(0, 30);
    saveProfiles();
    renderProfiles();
    el("sshSavedProfile").value = profile.id;
    notify("Server profile saved without passwords, passphrases or key contents");
  }

  function deleteProfile() {
    const id = el("sshSavedProfile").value;
    if (!id) return notify("Select a saved server profile", true);
    profiles = profiles.filter((item) => item.id !== id);
    saveProfiles();
    renderProfiles();
    el("sshProfileName").value = "";
    notify("Server profile removed");
  }

  function installChrome() {
    const panel = el("sshTerminalPanel");
    const controls = panel?.querySelector(".ssh-terminal-controls");
    if (!panel || !controls || el("sshProfileBar")) return;

    const profileBar = document.createElement("div");
    profileBar.id = "sshProfileBar";
    profileBar.className = "ssh-profile-bar";
    profileBar.innerHTML = `
      <label>SAVED SERVER PROFILE<select id="sshSavedProfile"><option value="">Select saved server…</option></select></label>
      <label>PROFILE NAME<input id="sshProfileName" maxlength="80" placeholder="Production DB host"></label>
      <button type="button" id="sshSaveProfile">Save metadata</button>
      <button type="button" id="sshDeleteProfile">Delete profile</button>`;
    controls.before(profileBar);

    const preflightButton = document.createElement("button");
    preflightButton.type = "button";
    preflightButton.id = "sshTerminalPreflight";
    preflightButton.className = "ssh-terminal-preflight";
    preflightButton.textContent = "Preflight trust";
    panel.querySelector(".ssh-terminal-actions")?.appendChild(preflightButton);
    el("sshTerminalConnect").textContent = "Open server tab";
    el("sshTerminalDisconnect").textContent = "Disconnect active";

    const preflightResult = document.createElement("div");
    preflightResult.id = "sshPreflightResult";
    preflightResult.className = "ssh-preflight-result";
    preflightResult.innerHTML = "<i></i><span><b>Target not checked</b> Enter a hostname, IPv4, or bracketed IPv6 address and run Preflight trust.</span>";
    controls.after(preflightResult);

    const tabs = document.createElement("div");
    tabs.id = "sshSessionTabs";
    tabs.className = "ssh-session-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Remote SSH server sessions");
    el("sshTerminalSurface").before(tabs);

    el("sshTerminalHost").placeholder = "db-prod-01.company.net, 10.20.1.15, or [2001:db8::15]";
    el("sshTerminalHost").maxLength = 255;
    const fixedMount = el("sshTerminalMount");
    fixedMount?.remove();
  }

  function bindSshTerminal() {
    if (!el("sshTerminalPanel")) return;
    installChrome();
    readProfiles();
    renderProfiles();
    renderTabs();

    if (!window.Terminal || !window.FitAddon) {
      el("sshTerminalEmpty").innerHTML = "<span>SSH</span><b>Terminal engine unavailable</b><p>The bundled xterm.js files could not be loaded from this origin.</p>";
      el("sshTerminalConnect").disabled = true;
      return;
    }

    el("sshTerminalAuth").addEventListener("change", updateAuthFields);
    el("sshTerminalConnect").addEventListener("click", connect);
    el("sshTerminalDisconnect").addEventListener("click", disconnectActive);
    el("sshTerminalPreflight").addEventListener("click", preflight);
    el("sshSavedProfile").addEventListener("change", applyProfile);
    el("sshSaveProfile").addEventListener("click", saveProfile);
    el("sshDeleteProfile").addEventListener("click", deleteProfile);

    window.addEventListener("resize", () => {
      const active = activeSession();
      if (!active?.fit) return;
      active.fit.fit();
      sendResize(active);
    });
    window.addEventListener("beforeunload", () => {
      sessions.forEach((session) => {
        if (!session.connected) return;
        fetch("/api/terminal/ssh/close", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-DBridge-Token": token },
          body: JSON.stringify({ sessionId: session.id }),
          keepalive: true,
        }).catch(() => {});
      });
    });

    updateAuthFields();
    updateState();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindSshTerminal, { once: true });
  else bindSshTerminal();
})();
