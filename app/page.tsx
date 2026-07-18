"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Level = "INFO" | "SUCCESS" | "WARN" | "ERROR";
type Log = { id: number; time: string; level: Level; source: string; message: string };
type LogSource = "ALL" | "ORACLE" | "POSTGRES" | "MONGODB" | "SYSTEM";

const logSources = [
  { id: "ORACLE" as const, name: "Oracle", file: "alert.log", path: "/opt/oracle/diag/rdbms/orcl/ORCL/trace/alert_ORCL.log", color: "#f43f5e" },
  { id: "POSTGRES" as const, name: "PostgreSQL", file: "error.log", path: "/var/log/postgresql/postgresql.log", color: "#4f8df7" },
  { id: "MONGODB" as const, name: "MongoDB", file: "mongo.log", path: "/var/log/mongodb/mongod.log", color: "#22c55e" },
];

const liveMessages: Record<"ORACLE" | "POSTGRES" | "MONGODB", Array<[Level, string]>> = {
  ORACLE: [["INFO", "Thread 1 advanced to log sequence 1842"], ["SUCCESS", "Completed checkpoint up to RBA [0x732.2.10]"], ["WARN", "ORA-28002: password will expire within 7 days"]],
  POSTGRES: [["INFO", "checkpoint complete: wrote 214 buffers (1.3%)"], ["INFO", "connection authorized: user=app database=analytics"], ["WARN", "duration: 1248.332 ms statement: SELECT * FROM events"]],
  MONGODB: [["INFO", "WiredTiger checkpoint completed successfully"], ["SUCCESS", "Connection accepted from 10.0.1.24:51842"], ["WARN", "Slow query collection=analytics.events durationMillis=893"]],
};

const databases = [
  { id: "postgres", name: "PostgreSQL", mark: "PG", color: "#4f8df7", port: "5432", icon: "P" },
  { id: "mysql", name: "MySQL", mark: "MY", color: "#f59e0b", port: "3306", icon: "M" },
  { id: "mariadb", name: "MariaDB", mark: "MA", color: "#64748b", port: "3306", icon: "M" },
  { id: "sqlserver", name: "SQL Server", mark: "MS", color: "#ef4444", port: "1433", icon: "S" },
  { id: "oracle", name: "Oracle", mark: "OR", color: "#f43f5e", port: "1521", icon: "O" },
  { id: "mongodb", name: "MongoDB", mark: "MO", color: "#22c55e", port: "27017", icon: "M" },
  { id: "redis", name: "Redis", mark: "RE", color: "#dc2626", port: "6379", icon: "R" },
  { id: "sqlite", name: "SQLite", mark: "SQ", color: "#38bdf8", port: "", icon: "S" },
  { id: "cockroach", name: "CockroachDB", mark: "CR", color: "#6366f1", port: "26257", icon: "C" },
  { id: "custom", name: "Custom driver", mark: "+", color: "#8b5cf6", port: "", icon: "+" },
];

const seedLogs: Log[] = [
  { id: 1, time: "09:41:02.104", level: "INFO", source: "SYSTEM", message: "DBridge desktop console initialized" },
  { id: 2, time: "09:41:02.221", level: "INFO", source: "DRIVERS", message: "10 database adapters available" },
  { id: 3, time: "09:41:02.387", level: "SUCCESS", source: "VAULT", message: "Local credential vault unlocked" },
  { id: 4, time: "09:41:03.012", level: "INFO", source: "NETWORK", message: "Ready for a new connection" },
  { id: 5, time: "09:41:04.118", level: "INFO", source: "ORACLE", message: "alert.log watcher ready · ORCL instance mounted" },
  { id: 6, time: "09:41:04.452", level: "INFO", source: "POSTGRES", message: "error.log watcher ready · ready to accept connections" },
  { id: 7, time: "09:41:04.781", level: "SUCCESS", source: "MONGODB", message: "mongo.log watcher ready · waiting for connections on port 27017" },
];

export default function Home() {
  const [selected, setSelected] = useState("postgres");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("analytics");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ssl, setSsl] = useState(true);
  const [ssh, setSsh] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<Log[]>(seedLogs);
  const [level, setLevel] = useState<"ALL" | Level>("ALL");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logSource, setLogSource] = useState<LogSource>("ALL");
  const [logPath, setLogPath] = useState(logSources[0].path);
  const [streaming, setStreaming] = useState(true);
  const logEnd = useRef<HTMLDivElement>(null);
  const db = databases.find((item) => item.id === selected)!;

  const addLog = (logLevel: Level, source: string, message: string) => {
    setLogs((current) => [...current, { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString("en-GB", { hour12: false }) + "." + String(new Date().getMilliseconds()).padStart(3, "0"), level: logLevel, source, message }]);
  };

  useEffect(() => {
    if (!paused) logEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, paused]);

  useEffect(() => {
    if (!streaming || paused) return;
    const timer = window.setInterval(() => {
      const choices: Array<"ORACLE" | "POSTGRES" | "MONGODB"> = logSource === "ALL" || logSource === "SYSTEM" ? ["ORACLE", "POSTGRES", "MONGODB"] : [logSource];
      const source = choices[Math.floor(Math.random() * choices.length)];
      const entries = liveMessages[source];
      const [entryLevel, message] = entries[Math.floor(Math.random() * entries.length)];
      addLog(entryLevel, source, message);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [streaming, paused, logSource]);

  const selectDatabase = (id: string) => {
    const next = databases.find((item) => item.id === id)!;
    setSelected(id); setPort(next.port); setConnected(false);
    addLog("INFO", "DRIVER", `${next.name} adapter selected`);
  };

  const testConnection = (event?: FormEvent) => {
    event?.preventDefault();
    if (testing) return;
    setTesting(true); setConnected(false);
    addLog("INFO", db.mark, `Opening ${ssl ? "TLS " : ""}connection to ${db.id === "sqlite" ? database || "local file" : `${host}:${port}`}`);
    window.setTimeout(() => addLog("INFO", "AUTH", `Authenticating as ${username || "default user"}…`), 500);
    window.setTimeout(() => {
      setTesting(false); setConnected(true);
      addLog("SUCCESS", db.mark, `Connection verified · ${db.name} responded in ${Math.floor(35 + Math.random() * 60)} ms`);
    }, 1250);
  };

  const filteredLogs = useMemo(() => logs.filter((log) => (logSource === "ALL" || (logSource === "SYSTEM" ? !["ORACLE", "POSTGRES", "MONGODB"].includes(log.source) : log.source === logSource)) && (level === "ALL" || log.level === level) && `${log.source} ${log.message}`.toLowerCase().includes(search.toLowerCase())), [logs, level, search, logSource]);

  const chooseLogSource = (source: LogSource) => {
    setLogSource(source);
    const config = logSources.find((item) => item.id === source);
    if (config) setLogPath(config.path);
  };

  const copyLogs = async () => {
    await navigator.clipboard.writeText(filteredLogs.map((l) => `${l.time} ${l.level.padEnd(7)} [${l.source}] ${l.message}`).join("\n"));
    setCopied(true); window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">D</span><span>DBridge</span><b>PRO</b></div>
        <button className="new-button" onClick={() => { setConnected(false); addLog("INFO", "SYSTEM", "New connection form cleared"); }}>＋ <span>New connection</span><kbd>⌘N</kbd></button>
        <div className="side-heading"><span>DATABASES</span><button aria-label="Collapse databases">⌃</button></div>
        <nav className="database-list" aria-label="Database types">
          {databases.map((item) => <button className={selected === item.id ? "active" : ""} key={item.id} onClick={() => selectDatabase(item.id)}><span className="db-icon" style={{ background: item.color }}>{item.icon}</span><span>{item.name}</span>{item.id !== "custom" && <i />}</button>)}
        </nav>
        <div className="saved"><div className="side-heading"><span>SAVED CONNECTIONS</span><button>＋</button></div><button className="saved-row"><span className="pulse"/><span><strong>Production API</strong><small>PostgreSQL · 2m ago</small></span><em>•••</em></button><button className="saved-row"><span className="pulse amber"/><span><strong>Cache cluster</strong><small>Redis · yesterday</small></span><em>•••</em></button></div>
        <div className="user"><span>AK</span><div><strong>Arjun Kumar</strong><small>Local workspace</small></div><button>⚙</button></div>
      </aside>

      <section className="workspace">
        <header><div><span className="crumb">Connections</span><span className="slash">/</span><strong>New connection</strong></div><div className="health"><span/><b>All systems operational</b><button>?</button></div></header>
        <div className="content">
          <div className="title-row"><div><p className="eyebrow">NEW CONNECTION</p><h1>Connect your database</h1><p>Configure a secure connection. Credentials stay encrypted on this device.</p></div><div className={`status ${connected ? "online" : ""}`}><span/>{connected ? "Connection verified" : "Not connected"}</div></div>
          <div className="driver-strip" role="list" aria-label="Quick database selector">{databases.slice(0, 8).map((item) => <button key={item.id} className={selected === item.id ? "chosen" : ""} onClick={() => selectDatabase(item.id)}><span style={{ color: item.color }}>{item.mark}</span><small>{item.name}</small>{selected === item.id && <b>✓</b>}</button>)}</div>

          <form className="connection-card" onSubmit={testConnection}>
            <div className="card-head"><div className="large-db-icon" style={{ background: db.color }}>{db.icon}</div><div><h2>{db.name} connection</h2><p>{db.id === "custom" ? "Use a custom connection string and driver." : `Standard ${db.name} connection settings.`}</p></div><button type="button" className="docs">Driver guide ↗</button></div>
            <div className="form-grid">
              {db.id === "sqlite" ? <label className="full"><span>DATABASE FILE <i>Required</i></span><input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="C:\data\database.sqlite" /></label> : db.id === "custom" ? <label className="full"><span>CONNECTION STRING <i>Required</i></span><input value={host} onChange={(e) => setHost(e.target.value)} placeholder="jdbc:vendor://host:port/database" /></label> : <><label className="host"><span>HOST <i>Required</i></span><input value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost or IP address" /></label><label><span>PORT</span><input value={port} onChange={(e) => setPort(e.target.value)} /></label></>}
              {db.id !== "sqlite" && db.id !== "redis" && <label><span>DATABASE <i>Required</i></span><input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="Database name" /></label>}
              {db.id !== "sqlite" && <label><span>USERNAME <i>Required</i></span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" /></label>}
              {db.id !== "sqlite" && <label className={db.id === "redis" ? "host" : ""}><span>PASSWORD</span><div className="password"><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div></label>}
            </div>
            <div className="advanced"><button type="button" className={ssl ? "toggle on" : "toggle"} onClick={() => { setSsl(!ssl); addLog("INFO", "SECURITY", `SSL ${ssl ? "disabled" : "enabled"}`); }}><span/></button><div><strong>Use SSL / TLS</strong><small>Encrypt data in transit</small></div><button type="button" className={ssh ? "toggle on" : "toggle"} onClick={() => { setSsh(!ssh); addLog("INFO", "NETWORK", `SSH tunnel ${ssh ? "disabled" : "enabled"}`); }}><span/></button><div><strong>SSH tunnel</strong><small>Connect through a bastion host</small></div><button type="button" className="more">Advanced options <span>⌄</span></button></div>
            <div className="actions"><span><b>⌘ ↵</b> to test connection</span><button type="button" className="save" onClick={() => addLog("SUCCESS", "VAULT", `${db.name} connection saved securely`)}>Save connection</button><button className="test" disabled={testing}>{testing ? <><i className="spinner"/> Testing…</> : connected ? "✓ Connected" : "Test connection"}</button></div>
          </form>

          <section className="log-panel">
            <div className="log-head"><div><span className={streaming ? "live-dot" : "live-dot offline"}/><h2>Database log stream</h2><span className={streaming ? "live-badge" : "live-badge offline"}>{streaming ? "LIVE" : "STOPPED"}</span><small>{filteredLogs.length} events</small></div><div className="log-tools"><button onClick={() => setStreaming(!streaming)}>{streaming ? "■ Stop stream" : "▶ Start stream"}</button><button onClick={() => setPaused(!paused)}>{paused ? "▶ Resume" : "Ⅱ Pause"}</button><button onClick={copyLogs}>{copied ? "✓ Copied" : "▣ Copy"}</button><button onClick={() => setLogs([])}>Clear</button></div></div>
            <div className="source-tabs"><button className={logSource === "ALL" ? "active" : ""} onClick={() => chooseLogSource("ALL")}><span className="source-all">∞</span><b>All streams</b><small>Combined view</small></button>{logSources.map((source) => <button key={source.id} className={logSource === source.id ? "active" : ""} onClick={() => chooseLogSource(source.id)}><span style={{ background: source.color }}>{source.name[0]}</span><b>{source.name}</b><small>{source.file}</small><i className={streaming ? "connected" : ""}/></button>)}<button className={logSource === "SYSTEM" ? "active" : ""} onClick={() => chooseLogSource("SYSTEM")}><span className="source-system">S</span><b>System</b><small>DBridge events</small></button></div>
            <div className="log-location"><div><span>LOG FILE</span><code>{logSource === "ALL" ? "3 log files · merged chronologically" : logSource === "SYSTEM" ? "DBridge application events" : logPath}</code></div>{!(["ALL", "SYSTEM"] as LogSource[]).includes(logSource) && <><button onClick={() => addLog("SUCCESS", logSource, `Log file verified: ${logPath}`)}>Verify path</button><button onClick={() => addLog("INFO", logSource, "Reading latest 500 lines")}>Tail 500</button></>}<span className="follow-indicator"><i/> FOLLOW</span></div>
            <div className="filters"><div className="level-tabs">{(["ALL", "INFO", "SUCCESS", "WARN", "ERROR"] as const).map((item) => <button key={item} className={level === item ? "selected" : ""} onClick={() => setLevel(item)}>{item === "ALL" ? "All" : item[0] + item.slice(1).toLowerCase()}{item === "ALL" && <span>{logs.length}</span>}</button>)}</div><label className="log-search">⌕<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter logs…" /></label><button className="download" onClick={() => addLog("SUCCESS", "SYSTEM", "Log export prepared")}>⇩</button></div>
            <div className="log-body">{filteredLogs.length ? filteredLogs.map((log) => <div className="log-row" key={log.id}><time>{log.time}</time><b className={log.level.toLowerCase()}>{log.level}</b><code>[{log.source}]</code><p>{log.message}</p></div>) : <div className="empty-log">No log events match this filter.</div>}<div ref={logEnd}/></div>
            <div className="log-foot"><span><i/> Auto-scroll {paused ? "paused" : "enabled"}</span><span>Session: local-{new Date().getFullYear()} <b>UTF-8</b></span></div>
          </section>
        </div>
      </section>
    </main>
  );
}
