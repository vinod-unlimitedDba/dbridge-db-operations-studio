/* Database routing uses the local agent's live SSH handles, never saved ports. */
(() => {
  const el = (id) => document.getElementById(id);
  let tunnel = null;
  let busy = false;
  let supported = [];
  let operation = 0;
  const fields = () => ({ connectionMode: el("sqlConnectionMode").value, sshTunnel: el("sqlConnectionMode").value === "ssh" ? tunnel || undefined : undefined, oracleServerDN: el("sqlOracleServerDN").value.trim() });
  const message = (text) => { el("sqlTunnelStatus").textContent = text; };
  const changed = () => { disconnectSqlStudio(false); scheduleConnectionSessionSave(); render(); };
  function render() {
    const ssh = fields().connectionMode === "ssh";
    el("sqlJumpFields").hidden = !ssh;
    el("sqlOracleDNField").hidden = !ssh || el("sqlEngine").value !== "oracle" || el("sqlTlsMode").value !== "require";
    el("sqlJumpNote").textContent = el("sqlEngine").value === "oracle"
      ? "Use the database host and port reached from this jump server. RAC SCAN redirects may require additional routing; use a DBA-approved listener endpoint."
      : el("sqlEngine").value === "mongodb"
        ? "Connects to one MongoDB member. Replica-set discovery and failover need additional routing."
        : "Enter the database hostname and port as reached from the jump server. Database credentials remain separate from SSH credentials.";
    el("sqlOpenTunnel").disabled = busy || Boolean(tunnel) || !el("sqlJumpSession").value || !supported.includes(el("sqlEngine").value);
    el("sqlCloseTunnel").disabled = busy || !tunnel;
    el("sqlJumpSession").disabled = busy || Boolean(tunnel);
    el("sqlConnectionMode").disabled = busy;
    if (tunnel) {
      const mismatch = tunnel.remoteHost.toLowerCase() !== el("sqlHost").value.trim().toLowerCase() || tunnel.remotePort !== Number(el("sqlPort").value);
      message(mismatch ? "Database target changed. Close this tunnel and open one for the new target."
        : `${tunnel.jumpUsername}@${tunnel.jumpHost} → ${tunnel.remoteHost}:${tunnel.remotePort} · local port ${tunnel.localPort}. Select Connect to validate the database.`);
    }
  }
  async function refresh() {
    if (fields().connectionMode !== "ssh" || busy) return;
    try {
      const data = await api("/api/connections/tunnels");
      if (!Array.isArray(data.supportedEngines)) throw new Error("Update the local DBridge package to use database tunnels.");
      supported = data.supportedEngines;
      const selected = el("sqlJumpSession").value;
      const sessions = data.sessions || [];
      el("sqlJumpSession").replaceChildren(new Option("Select a connected SSH jump server…", ""), ...sessions.map((item) => new Option(`${item.username}@${item.host}:${item.port}`, item.sessionId)));
      el("sqlJumpSession").value = sessions.some((item) => item.sessionId === selected) ? selected : sessions[0]?.sessionId || "";
      if (tunnel && !sessions.some((item) => item.sessionId === tunnel.sessionId && item.forwards?.some((forward) => forward.forwardId === tunnel.forwardId))) {
        tunnel = null;disconnectSqlStudio(false);message("The SSH session or database tunnel closed. Reconnect before running SQL.");
      }
      if (!sessions.length) message("Connect the jump server in SSH terminal, then return here and refresh.");
      render();
    } catch (error) { message(error.message); }
  }
  async function close() {
    const previous = tunnel;
    if (!previous) return;
    await api("/api/terminal/ssh/forward/close", { method: "POST", body: JSON.stringify({ sessionId: previous.sessionId, forwardId: previous.forwardId }) });
    if (tunnel === previous) tunnel = null;
    message("Database tunnel closed. The SSH session remains open.");changed();
  }
  async function open() {
    const host = el("sqlHost").value.trim(), port = el("sqlPort").value.trim();
    if (!host || !port) return message("Enter the actual database hostname and port first.");
    const currentOperation = ++operation;
    busy = true;render();message("Opening database tunnel…");
    try {
      const data = await api("/api/connections/tunnels/open", { method: "POST", body: JSON.stringify({ engine: el("sqlEngine").value, host, port, sessionId: el("sqlJumpSession").value }) });
      if (!data.tunnel?.forwardId) throw new Error("The agent did not return a database tunnel.");
      if (operation !== currentOperation || fields().connectionMode !== "ssh") {
        await api("/api/terminal/ssh/forward/close", { method: "POST", body: JSON.stringify(data.tunnel) });return;
      }
      tunnel = data.tunnel;changed();
    } catch (error) { message(error.message); }
    finally { busy = false;render(); }
  }
  window.DBridgeDatabaseTunnel = {
    fields,
    metadata: () => ({ connectionMode: fields().connectionMode, oracleServerDN: fields().oracleServerDN }),
    restore: (value) => {
      operation += 1;
      const previous = tunnel;tunnel = null;
      if (previous) void api("/api/terminal/ssh/forward/close", { method: "POST", body: JSON.stringify(previous) }).catch(() => {});
      el("sqlConnectionMode").value = value.connectionMode === "ssh" ? "ssh" : "direct";
      el("sqlOracleServerDN").value = value.oracleServerDN || "";
      render();if (value.connectionMode === "ssh") void refresh();
    },
  };
  el("sqlConnectionMode").addEventListener("change", async () => {
    try { await close();changed();await refresh(); }
    catch (error) { el("sqlConnectionMode").value = "ssh";message(error.message);render(); }
  });
  el("sqlOpenTunnel").addEventListener("click", open);
  el("sqlCloseTunnel").addEventListener("click", () => { busy = true;render();void close().catch((error) => message(error.message)).finally(() => { busy = false;render(); }); });
  el("sqlRefreshJumps").addEventListener("click", refresh);
  el("sqlJumpSession").addEventListener("change", render);
  el("sqlOpenJumpWorkspace").addEventListener("click", () => { navigate("devops");el("sshTerminalPanel").scrollIntoView({ block: "start" });el("sshTerminalHost").focus(); });
  el("sshReturnToDatabase").addEventListener("click", () => { el("sqlConnectionMode").value = "ssh";navigate("sql");changed();void refresh();el("sqlJumpSession").focus(); });
  for (const id of ["sqlEngine", "sqlTlsMode", "sqlHost", "sqlPort"]) el(id).addEventListener("change", render);
  el("sqlOracleServerDN").addEventListener("input", changed);
  el("disconnectSqlStudio").addEventListener("click", () => { void close().catch((error) => message(error.message)); });
  setInterval(() => void refresh(), 10000);
  render();
})();
