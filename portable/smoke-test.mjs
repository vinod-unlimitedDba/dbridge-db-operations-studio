import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { oracleSqlIdCheckCatalog, oracleSqlIdCheckSql, analyzeOracleSqlIdCheck } from "./oracle-sql-id.mjs";
import { oracleBottleneckCatalog, analyzeOracleBottlenecks } from "./oracle-bottleneck.mjs";
import { postgresBottleneckCatalog, analyzePostgresBottlenecks } from "./postgres-bottleneck.mjs";
import { mongodbBottleneckCatalog, analyzeMongoBottlenecks } from "./mongodb-bottleneck.mjs";
import { runtimeTraceCatalog, validateRuntimeTraceInput, runtimeTraceSql, analyzeRuntimeTrace } from "./runtime-trace.mjs";
import { SSH_TERMINAL_LIMITS, validateSshTarget, normalizeSshHost, validateSftpPath, validateLocalForwardTarget } from "./ssh-terminal.mjs";

const scriptData = await mkdtemp(join(tmpdir(), "dbridge-script-smoke-"));
const child = spawn(process.execPath, [fileURLToPath(new URL("server.mjs", import.meta.url))], { env: { ...process.env, DBRIDGE_NO_BROWSER: "1", DBRIDGE_PORT: "17872", DBRIDGE_DATA_DIR: scriptData }, windowsHide: true });
let output = "";
child.stdout.on("data", (chunk) => output += chunk);
child.stderr.on("data", (chunk) => output += chunk);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(path, token, body) {
  const response = await fetch(`http://127.0.0.1:17872${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok || result.ok === false) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

let scratch;
try {
  const sshHostname = validateSshTarget({ host: "db-prod-01.company.net", port: 22, username: "dba", authMethod: "agent" });
  const sshIpv4 = validateSshTarget({ host: "10.20.30.40", port: 2222, username: "ops_user", authMethod: "password" });
  const sshIpv6 = validateSshTarget({ host: "[2001:db8::15]", port: 22, username: "oracle", authMethod: "agent" });
  if (sshHostname.host !== "db-prod-01.company.net" || sshIpv4.host !== "10.20.30.40" || sshIpv6.host !== "2001:db8::15" || normalizeSshHost("[2001:db8::20]") !== "2001:db8::20") throw new Error("SSH hostname/IP normalization failed");
  let unsafeSshTarget = false;
  try { normalizeSshHost("db-prod;whoami"); } catch { unsafeSshTarget = true; }
  if (!unsafeSshTarget) throw new Error("SSH target validation accepted command metacharacters");
  const sshForward = validateLocalForwardTarget({ remoteHost: "postgres.internal", remotePort: 5432, localPort: 0 });
  if (SSH_TERMINAL_LIMITS.maxSessions !== 8 || SSH_TERMINAL_LIMITS.maxForwardsPerSession !== 4 || sshForward.remoteHost !== "postgres.internal" || sshForward.remotePort !== 5432 || validateSftpPath("/var/log") !== "/var/log") throw new Error("Advanced SSH limits, SFTP, or local-forward validation failed");
  let privilegedForwardGuarded = false;
  try { validateLocalForwardTarget({ remoteHost: "127.0.0.1", remotePort: 5432, localPort: 80 }); } catch { privilegedForwardGuarded = true; }
  if (!privilegedForwardGuarded) throw new Error("SSH local forwarding accepted a privileged bind port");
  if (Object.keys(runtimeTraceCatalog).length !== 6 || Object.values(runtimeTraceCatalog).reduce((total, definition) => total + definition.checks.length, 0) !== 31 || runtimeTraceCatalog.oracle.checks.length !== 6) throw new Error("Unified runtime trace catalog was incomplete");
  const validRuntimeIds = {
    oracle: "8m5j1t2y4n6p9",
    postgres: "-1234567890123456789",
    mongodb: "orders-api.checkout",
    mysql: "A1B2C3D4E5F60718",
    mariadb: "A1B2C3D4E5F60718",
    sqlserver: "0x0123456789ABCDEF",
  };
  for (const [engine, identifier] of Object.entries(validRuntimeIds)) if (!validateRuntimeTraceInput(engine, identifier).identifier) throw new Error(`Runtime trace validation failed for ${engine}`);
  let runtimeTraceGuarded = false;
  try { validateRuntimeTraceInput("oracle", "bad';drop"); } catch { runtimeTraceGuarded = true; }
  if (!runtimeTraceGuarded) throw new Error("Unified runtime trace accepted an unsafe Oracle SQL_ID");
  const runtimeOracleSql = runtimeTraceSql("oracle", runtimeTraceCatalog.oracle.checks[0], validRuntimeIds.oracle);
  if (runtimeOracleSql.includes("__IDENTIFIER__") || !runtimeOracleSql.includes(validRuntimeIds.oracle) || !/^\s*select\b/i.test(runtimeOracleSql)) throw new Error("Oracle retained-evidence SQL was not safely constructed");
  const runtimeTraceResults = runtimeTraceCatalog.oracle.checks.map((check) => ({ ...check, sql: undefined, ok: true, rowCount: 0, rows: [] }));
  runtimeTraceResults.find((item) => item.id === "statement").rows = [{ SQL_ID: validRuntimeIds.oracle, EXECUTIONS: 40, AVERAGE_ELAPSED_MS: 2200, ELAPSED_MS: 88000, PLAN_HASH_VALUE: 101 }, { SQL_ID: validRuntimeIds.oracle, EXECUTIONS: 20, AVERAGE_ELAPSED_MS: 400, ELAPSED_MS: 8000, PLAN_HASH_VALUE: 202 }];
  runtimeTraceResults.find((item) => item.id === "runtime").rows = [{ SQL_ID: validRuntimeIds.oracle, STATE: "WAITING", WAIT_CLASS: "User I/O", RUNTIME_SECONDS: 45, EVENT: "db file sequential read" }];
  runtimeTraceResults.find((item) => item.id === "plan").rows = [{ ESTIMATED_ROWS: 10, ACTUAL_ROWS: 10000, OPERATION: "TABLE ACCESS FULL" }];
  const runtimeTraceAnalysis = analyzeRuntimeTrace("oracle", validRuntimeIds.oracle, "", runtimeTraceResults);
  if (runtimeTraceAnalysis.importanceScore < 60 || runtimeTraceAnalysis.summary.executions !== 60 || runtimeTraceAnalysis.summary.planVersions !== 2 || !runtimeTraceAnalysis.findings.some((item) => item.severity === "HIGH") || !runtimeTraceAnalysis.terminalScript.includes("NEW 10053 CAPTURE TEMPLATE")) throw new Error("Unified runtime trace importance analysis failed");
  if (oracleBottleneckCatalog.length !== 30 || new Set(oracleBottleneckCatalog.map((item) => item.id)).size !== 30 || oracleBottleneckCatalog.filter((item) => item.license === "core").length !== 27 || oracleBottleneckCatalog.filter((item) => item.license === "diagnostics").length !== 2 || oracleBottleneckCatalog.filter((item) => item.license === "tuning").length !== 1 || oracleBottleneckCatalog.some((item) => { const executableSql = item.sql.replace(/'(?:''|[^'])*'/g, "''"); return !item.label || !item.phase || !item.guidance || !["core", "diagnostics", "tuning"].includes(item.license) || !/^\s*select\b/i.test(item.sql) || /\b(insert|update|delete|alter|drop|truncate|merge|create|grant|revoke|execute|begin|commit|rollback)\b/i.test(executableSql); })) throw new Error("Oracle bottleneck evidence catalog was incomplete, unsafe, or incorrectly licensed");
  const oracleChecks = oracleBottleneckCatalog.map((item) => ({ id: item.id, label: item.label, phase: item.phase, license: item.license, ok: true, rows: [] }));
  const setOracleRows = (id, rows) => { const check = oracleChecks.find((item) => item.id === id); check.rows = rows; check.rowCount = rows.length; };
  setOracleRows("sessionPressure", [{ ACTIVE_SESSIONS: 30, WAITING_SESSIONS: 20, BLOCKED_SESSIONS: 4, CURRENT_SESSIONS: 195, SESSION_LIMIT: 200, INACTIVE_SESSIONS: 150 }]);
  setOracleRows("blockers", [{ WAITER_SID: 101, BLOCKING_SESSION: 99, SECONDS_IN_WAIT: 420 }]);
  setOracleRows("systemWaits", [{ WAIT_CLASS: "Application", EVENT: "enq: TX - row lock contention", TOTAL_WAITS: 1000, AVERAGE_WAIT_MS: 80 }, { WAIT_CLASS: "Commit", EVENT: "log file sync", TOTAL_WAITS: 50000, AVERAGE_WAIT_MS: 25 }]);
  setOracleRows("systemMetrics", [{ METRIC_NAME: "Host CPU Utilization (%)", METRIC_VALUE: 96 }, { METRIC_NAME: "Database CPU Time Ratio", METRIC_VALUE: 83 }, { METRIC_NAME: "Database Wait Time Ratio", METRIC_VALUE: 75 }]);
  setOracleRows("focusedSql", [{ SQL_ID: "8m5j1t2y4n6p9", EXECUTIONS: 100, AVERAGE_ELAPSED_MS: 12000, AVERAGE_CPU_MS: 9000, BUFFER_GETS_PER_EXEC: 250000, DISK_READS_PER_EXEC: 15000, PLAN_COUNT: 3, CHILD_CURSORS: 35 }]);
  setOracleRows("focusedPlanStats", [{ ID: 7, OPERATION: "HASH JOIN", ESTIMATED_ROWS: 100, ACTUAL_ROWS: 100000, LAST_EXECUTION: "MULTI-PASS" }]);
  setOracleRows("childCursors", Array.from({ length: 10 }, (_, child) => ({ CHILD_NUMBER: child, BIND_MISMATCH: "Y" })));
  setOracleRows("fileIo", [{ FILE_NAME: "users01.dbf", AVERAGE_READ_MS: 45 }]);
  setOracleRows("tempUsage", [{ BYTES: 12 * 1024 ** 3 }]);
  setOracleRows("pgaHealth", [{ OVER_ALLOCATION_COUNT: 2, CACHE_HIT_PERCENTAGE: 72, EXTRA_BYTES_READ_WRITTEN: 8 * 1024 ** 3 }]);
  setOracleRows("undoHealth", [{ SSOLDERRCNT: 2, NOSPACEERRCNT: 0, UNXPSTEALCNT: 5 }]);
  setOracleRows("libraryCache", [{ NAMESPACE: "SQL AREA", RELOADS: 500, INVALIDATIONS: 200, RELOAD_PCT: 7 }]);
  setOracleRows("redoStats", [{ NAME: "redo size", VALUE: 1000000000 }, { NAME: "user commits", VALUE: 50000 }]);
  setOracleRows("racCache", [{ EVENT: "gc current request", TOTAL_WAITS: 10000, AVERAGE_WAIT_MS: 12 }]);
  setOracleRows("statsHealth", [{ OWNER: "APP", TABLE_NAME: "ORDERS", LAST_ANALYZED: null, STALE_STATS: "YES" }]);
  const oracleAnalysis = analyzeOracleBottlenecks(oracleChecks, "8m5j1t2y4n6p9", "core");
  if (oracleAnalysis.dominantMode !== "BLOCKED" || oracleAnalysis.pressureScore < 90 || oracleAnalysis.focusSqlId !== "8m5j1t2y4n6p9" || !oracleAnalysis.focusedSql || oracleAnalysis.packScope !== "core" || oracleAnalysis.pressureMap.length !== 6 || !oracleAnalysis.findings.some((item) => item.id === "blocking-chain") || !oracleAnalysis.findings.some((item) => item.id === "focused-sql-profile") || !oracleAnalysis.findings.some((item) => item.id === "cardinality-error") || !oracleAnalysis.findings.some((item) => item.id === "workarea-pressure") || !oracleAnalysis.findings.some((item) => item.id === "commit-latency") || !oracleAnalysis.findings.some((item) => item.id === "rac-global-cache") || !oracleAnalysis.findings.some((item) => item.id === "optimizer-statistics")) throw new Error("Oracle bottleneck cause ranking failed");
  if (postgresBottleneckCatalog.length !== 26 || new Set(postgresBottleneckCatalog.map((item) => item.id)).size !== 26 || postgresBottleneckCatalog.some((item) => !item.label || !item.phase || !item.guidance || !/^\s*select\b/i.test(item.sql))) throw new Error("PostgreSQL bottleneck evidence catalog was incomplete or not read-only");
  const postgresAnalysis = analyzePostgresBottlenecks([
    { id: "activity", ok: true, rows: [{ total_connections: 95, active_sessions: 8, waiting_sessions: 5, working_sessions: 3, idle_in_transaction: 6, max_xact_seconds: 900, connection_utilization_pct: 95 }] },
    { id: "waits", ok: true, rows: [{ wait_event_type: "Lock", wait_event: "transactionid", session_count: 5, max_seconds: 120 }] },
    { id: "blockers", ok: true, rows: [{ blocked_pid: 101, blocker_pids: [99], blocked_seconds: 120 }] },
    { id: "database", ok: true, rows: [{ cache_hit_pct: 76, temp_bytes: 20000000000 }] },
    { id: "statements", ok: true, rows: [{ queryid: "-42", calls: 100, mean_exec_ms: 25, max_exec_ms: 900, shared_blks_read: 50000, shared_blks_hit: 1000, temp_blks_written: 20000 }] },
    { id: "focusedStatement", ok: true, rows: [{ queryid: "-42", calls: 100, mean_exec_ms: 25, max_exec_ms: 900, stddev_exec_ms: 80, shared_blks_read: 50000, temp_blks_written: 20000, wal_bytes: 8000000 }] },
    { id: "tables", ok: true, rows: [{ schemaname: "public", relname: "orders", n_live_tup: 100000, n_dead_tup: 50000, dead_tuple_pct: 33.3, n_mod_since_analyze: 40000, seq_tup_read: 2000000, seq_scan: 200, idx_scan: 10 }] },
    { id: "freeze", ok: true, rows: [{ schemaname: "public", relname: "orders", freeze_age_pct: 92 }] },
    { id: "replicationSlots", ok: true, rows: [{ slot_name: "abandoned_slot", active: false, retained_wal_bytes: 60000000000, wal_status: "extended" }] },
    { id: "indexes", ok: true, rows: [] },
    { id: "replication", ok: true, rows: [] },
    { id: "settings", ok: true, rows: [{ name: "track_io_timing", setting: "off" }] },
    { id: "prepared", ok: true, rows: [{ generic_plans: 0, custom_plans: 0 }] },
    { id: "invalidIndexes", ok: true, rows: [{ schemaname: "public", index_name: "orders_pending_ix" }] },
  ], "-42");
  if (postgresAnalysis.dominantMode !== "WAITING" || postgresAnalysis.pressureScore < 80 || postgresAnalysis.focusQueryId !== "-42" || !postgresAnalysis.focusedStatement || !postgresAnalysis.pressureMap.length || !postgresAnalysis.findings.some((item) => item.id === "focused-query-profile") || !postgresAnalysis.findings.some((item) => item.id === "lock-contention") || !postgresAnalysis.findings.some((item) => item.id === "temp-spill") || !postgresAnalysis.findings.some((item) => item.id === "plan-variance") || !postgresAnalysis.findings.some((item) => item.id === "vacuum-statistics") || !postgresAnalysis.findings.some((item) => item.id === "freeze-horizon") || !postgresAnalysis.findings.some((item) => item.id === "slot-retention") || !postgresAnalysis.findings.some((item) => item.id === "invalid-index")) throw new Error("PostgreSQL bottleneck cause ranking failed");
  if (mongodbBottleneckCatalog.length !== 19 || new Set(mongodbBottleneckCatalog.map((item) => item.id)).size !== 19 || mongodbBottleneckCatalog.some((item) => !item.label || !item.phase || !item.guidance)) throw new Error("MongoDB bottleneck evidence catalog was incomplete");
  const mongodbChecks = mongodbBottleneckCatalog.map((item) => ({ id: item.id, label: item.label, phase: item.phase, ok: true, rows: [] }));
  const setMongoRows = (id, rows) => { const check = mongodbChecks.find((item) => item.id === id); check.rows = rows; check.rowCount = rows.length; };
  setMongoRows("currentOps", [{ secs_running: 420, waitingForLock: true, planSummary: "COLLSCAN", docsExamined: 100000, nreturned: 10 }]);
  setMongoRows("connections", [{ current: 95, available: 5, rejected: 2 }]);
  setMongoRows("wiredTiger", [{ "maximum bytes configured": 1000, "bytes currently in the cache": 980, "tracked dirty bytes in the cache": 240, "pages evicted by application threads": 20 }]);
  setMongoRows("replication", [{ members: [{ stateStr: "PRIMARY", optimeDate: "2026-07-25T10:00:00Z", health: 1 }, { stateStr: "SECONDARY", optimeDate: "2026-07-25T09:50:00Z", health: 1 }] }]);
  setMongoRows("oplog", [{ timeDiffHours: 4 }]);
  const mongodbAnalysis = analyzeMongoBottlenecks(mongodbChecks, { collection: "orders" });
  if (mongodbAnalysis.pressureScore < 80 || mongodbAnalysis.dominantMode !== "Waiting / queued" || !mongodbAnalysis.pressureMap.length || !mongodbAnalysis.findings.some((item) => item.title.includes("long-running")) || !mongodbAnalysis.findings.some((item) => item.title.includes("lock waiters")) || !mongodbAnalysis.findings.some((item) => item.title.includes("WiredTiger") || item.title.includes("Dirty cache")) || !mongodbAnalysis.findings.some((item) => item.title.includes("Replica lag")) || !mongodbAnalysis.findings.some((item) => item.title.includes("Oplog"))) throw new Error("MongoDB bottleneck cause ranking failed");
  if (oracleSqlIdCheckCatalog.length !== 22 || new Set(oracleSqlIdCheckCatalog.map((item) => item.id)).size !== 22 || oracleSqlIdCheckCatalog.some((item) => !item.label || !item.phase || !item.source || !item.guidance)) throw new Error("Oracle SQL_ID X-Ray catalog was incomplete");
  for (const check of oracleSqlIdCheckCatalog) {
    const sql = oracleSqlIdCheckSql(check.id, "8m5j1t2y4n6p9");
    if (!/^select\b/i.test(sql) || !sql.includes("8m5j1t2y4n6p9") && check.id !== "dbInfo" || /\b(insert|update|delete|alter|drop|truncate|merge|create|grant|revoke|execute|begin|commit|rollback)\b/i.test(sql)) throw new Error(`Oracle SQL_ID check ${check.id} was not a fixed read-only query`);
  }
  let invalidOracleSqlId = false; try { oracleSqlIdCheckSql("history", "bad';drop"); } catch { invalidOracleSqlId = true; }
  let invalidOracleCheck = false; try { oracleSqlIdCheckSql("shell", "8m5j1t2y4n6p9"); } catch { invalidOracleCheck = true; }
  if (!invalidOracleSqlId || !invalidOracleCheck) throw new Error("Oracle SQL_ID X-Ray allowlist validation failed");
  const blockedAnalysis = analyzeOracleSqlIdCheck("blocking", "XRAY_BLOCKED_SESSION\nORA-00060");
  const clearAnalysis = analyzeOracleSqlIdCheck("history", "no rows selected");
  if (blockedAnalysis.severity !== "HIGH" || blockedAnalysis.signals !== 2 || !blockedAnalysis.errorCodes.includes("ORA-00060") || clearAnalysis.severity !== "INFO") throw new Error("Oracle SQL_ID evidence analyzer failed");
  const appSource = await readFile(fileURLToPath(new URL("app/app.js", import.meta.url)), "utf8");
  const connectionSessionStart = appSource.indexOf("function sanitizeConnectionSessionEntry");
  const connectionSessionEnd = appSource.indexOf("function readConnectionSession", connectionSessionStart);
  if (connectionSessionStart < 0 || connectionSessionEnd <= connectionSessionStart) throw new Error("SQL connection session sanitizer was not found");
  const { sanitizeConnectionSessionEntry } = new Function(`${appSource.slice(connectionSessionStart, connectionSessionEnd)}; return { sanitizeConnectionSessionEntry };`)();
  const safeConnectionSession = sanitizeConnectionSessionEntry({ host: "db.company.net", port: "5432", database: "analytics", username: "reader", authMode: "context", tlsMode: "require", password: "must-not-save" });
  let unsafeConnectionSession = false; try { sanitizeConnectionSessionEntry({ host: "db;whoami" }); } catch { unsafeConnectionSession = true; }
  if (Object.hasOwn(safeConnectionSession, "password") || safeConnectionSession.host !== "db.company.net" || safeConnectionSession.authMode !== "context" || safeConnectionSession.tlsMode !== "require" || !unsafeConnectionSession || !appSource.includes("CONNECTION_SESSION_STORAGE_KEY") || !appSource.includes("localStorage.setItem(CONNECTION_SESSION_STORAGE_KEY") || !appSource.includes('$("#sqlPassword").value = "";')) throw new Error("Secure SQL connection session recovery was incomplete");
  const objectQueryStart = appSource.indexOf("function databaseObjectQuery");
  const objectQueryEnd = appSource.indexOf("function openDatabaseObject", objectQueryStart);
  const resultParserStart = appSource.indexOf("function parseCsvRows");
  const resultParserEnd = appSource.indexOf("function renderSqlExecutionResult", resultParserStart);
  if (objectQueryStart < 0 || objectQueryEnd <= objectQueryStart || resultParserStart < 0 || resultParserEnd <= resultParserStart) throw new Error("DBGate-style SQL Studio helpers were not found");
  const { databaseObjectQuery } = new Function(`${appSource.slice(objectQueryStart, objectQueryEnd)}; return { databaseObjectQuery };`)();
  const { parseSqlResultRows } = new Function(`${appSource.slice(resultParserStart, resultParserEnd)}; return { parseSqlResultRows };`)();
  if (!databaseObjectQuery("oracle", { schema: "APP", name: "ORDERS" }).includes('"APP"."ORDERS"') || !databaseObjectQuery("sqlserver", { schema: "dbo", name: "Orders" }).includes("[dbo].[Orders]") || !databaseObjectQuery("mongodb", { schema: "shop", name: "orders" }).includes("getCollection(\"orders\")") || !databaseObjectQuery("bigquery", { type: "DATASET", schema: "project", name: "analytics" }).includes("project.analytics.INFORMATION_SCHEMA.TABLES")) throw new Error("Database object query templates were incomplete");
  const csvResult = parseSqlResultRows("postgres", 'id,name\n1,Ada\n2,\"Grace Hopper\"\n');
  const jsonResult = parseSqlResultRows("mongodb", '[{\"name\":\"Ada\",\"active\":true}]');
  if (csvResult.columns.length !== 2 || csvResult.rows.length !== 2 || csvResult.rows[1][1] !== "Grace Hopper" || jsonResult.columns.length !== 2 || jsonResult.rows[0][0] !== "Ada") throw new Error("SQL Studio visual result parsing failed");
  const performanceWorkspaceStart = appSource.indexOf("const performanceWorkspaceCatalog");
  const performanceWorkspaceEnd = appSource.indexOf("function updatePerformanceContextTarget", performanceWorkspaceStart);
  if (performanceWorkspaceStart < 0 || performanceWorkspaceEnd <= performanceWorkspaceStart) throw new Error("Multi-database performance workspace catalog was not found");
  const performanceWorkspaceCatalog = new Function(`${appSource.slice(performanceWorkspaceStart, performanceWorkspaceEnd)}; return performanceWorkspaceCatalog;`)();
  if (Object.keys(performanceWorkspaceCatalog).length !== 5 || Object.values(performanceWorkspaceCatalog).some((item) => !item.name || !item.identifier || !item.hint || !item.example || !item.description || !item.safety)) throw new Error("Multi-database performance workspace catalog was incomplete");
  const performanceModeStart = appSource.indexOf("const performanceModeCatalog");
  const performanceModeEnd = appSource.indexOf("const performanceModeSections", performanceModeStart);
  if (performanceModeStart < 0 || performanceModeEnd <= performanceModeStart) throw new Error("Friendly SQL performance mode catalog was not found");
  const performanceModeCatalog = new Function(`${appSource.slice(performanceModeStart, performanceModeEnd)}; return performanceModeCatalog;`)();
  if (Object.keys(performanceModeCatalog).join(",") !== "overview,engine,statement,advanced" || Object.values(performanceModeCatalog).some((item) => !item.number || !item.name || !item.title || !item.description || item.tips.length !== 3 || !item.next || !item.nextLabel) || !appSource.includes("function setPerformanceMode") || !appSource.includes("function renderPerformanceFallback")) throw new Error("Friendly SQL performance workspace routing was incomplete");
  const xraySummaryStart = appSource.indexOf("function summarizeOracleXrayResults");
  const xraySummaryEnd = appSource.indexOf("function renderOracleXrayDiagnosis", xraySummaryStart);
  if (xraySummaryStart < 0 || xraySummaryEnd <= xraySummaryStart) throw new Error("Oracle SQL_ID sequence summary engine was not found");
  const { summarizeOracleXrayResults } = new Function(`${appSource.slice(xraySummaryStart, xraySummaryEnd)}; return { summarizeOracleXrayResults };`)();
  const xraySummary = summarizeOracleXrayResults([{ id: "blocking", label: "Blocking", ok: true, analysis: blockedAnalysis }, { id: "plan", label: "Plan", ok: false }], 22);
  if (xraySummary.completed !== 2 || xraySummary.failed !== 1 || xraySummary.high !== 1 || xraySummary.score !== 86 || !xraySummary.findings.some((item) => item.title === "Blocking chain") || !xraySummary.findings.some((item) => /unavailable/i.test(item.title))) throw new Error("Oracle SQL_ID sequence diagnosis was invalid");
  const diffStart = appSource.indexOf("function comparisonLines");
  const diffEnd = appSource.indexOf("function createComparisonPatch");
  if (diffStart < 0 || diffEnd <= diffStart) throw new Error("File comparison engine was not found");
  const diffFactory = new Function(`${appSource.slice(diffStart, diffEnd)}; return { createLineComparison };`);
  const { createLineComparison } = diffFactory();
  const sampleDiff = createLineComparison("name: old\nreplicas: 2\nimage: v1", "name: new\nreplicas: 3\nimage: v1\nready: true", false, false);
  if (sampleDiff.filter((line) => line.type === "delete").length !== 2 || sampleDiff.filter((line) => line.type === "insert").length !== 3) throw new Error("File redline counts were incorrect");
  const whitespaceDiff = createLineComparison("key:   value", "key: value", true, false);
  if (whitespaceDiff.some((line) => line.type !== "equal")) throw new Error("File comparison whitespace option failed");
  const reconstructed = sampleDiff.filter((line) => line.type !== "delete").map((line) => line.text).join("\n");
  if (reconstructed !== "name: new\nreplicas: 3\nimage: v1\nready: true") throw new Error("File comparison did not reconstruct the changed file");
  const tuningStart = appSource.indexOf("const tuningActions");
  const auditStart = appSource.indexOf("const devopsAuditPlans");
  const catalogStart = appSource.indexOf("const logCatalog");
  if (tuningStart < 0 || auditStart <= tuningStart || catalogStart <= auditStart) throw new Error("Advanced audit catalogs were not found");
  const tuningCatalog = new Function(`${appSource.slice(tuningStart, auditStart)}; return tuningActions;`)();
  const auditPlans = new Function(`${appSource.slice(auditStart, catalogStart)}; return devopsAuditPlans;`)();
  if (Object.keys(tuningCatalog).length !== 5 || Object.values(tuningCatalog).some((checks) => Object.keys(checks).length !== 10)) throw new Error("Database snapshot catalog was incomplete");
  if (Object.keys(auditPlans).length !== 20 || Object.values(auditPlans).some((plan) => !plan.quick.length || plan.full.length < plan.quick.length)) throw new Error("DevOps audit playbooks were incomplete");
  const completionCatalogStart = appSource.indexOf("const commonSqlCompletionWords");
  const completionFunctionStart = appSource.indexOf("function editorCompletionCatalog");
  const completionFunctionEnd = appSource.indexOf("function hideEditorAutocomplete", completionFunctionStart);
  if (completionCatalogStart < 0 || completionFunctionStart < 0 || completionFunctionEnd <= completionFunctionStart) throw new Error("Real-time editor completion engine was not found");
  const completionFactory = new Function(`${appSource.slice(completionCatalogStart, tuningStart)}\n${appSource.slice(completionFunctionStart, completionFunctionEnd)}\nreturn { databaseSqlCompletionCatalog, editorCommandTemplateCatalog, editorCompletionCatalog, matchEditorCompletions };`);
  const completion = completionFactory();
  if (Object.keys(completion.databaseSqlCompletionCatalog).length !== 15 || Object.keys(completion.editorCommandTemplateCatalog).length !== 20) throw new Error("Real-time completion catalogs were incomplete");
  if (!completion.matchEditorCompletions("sel", 3, "oracle", "all", []).items.some((item) => item.label === "SELECT")) throw new Error("Oracle SQL keyword completion failed");
  if (!completion.matchEditorCompletions("pg_stat", 7, "postgres", "sql", []).items.some((item) => item.label === "PG_STAT_ACTIVITY")) throw new Error("PostgreSQL dialect completion failed");
  if (!completion.matchEditorCompletions("kubectl ge", 10, "oracle", "ops", []).items.some((item) => item.insert === "kubectl get nodes -o wide")) throw new Error("Kubernetes command completion failed");
  if (!completion.matchEditorCompletions("docker st", 9, "oracle", "all", []).items.some((item) => item.insert === "docker stats --no-stream")) throw new Error("Docker command completion failed");
  if (completion.matchEditorCompletions("select", 6, "oracle", "off", []).items.length) throw new Error("Disabled completion scope returned suggestions");
  const containerActionCatalogStart = appSource.indexOf("const containerWriteActions");
  const containerActionCatalogEnd = appSource.indexOf("state.goldengate", containerActionCatalogStart);
  if (containerActionCatalogStart < 0 || containerActionCatalogEnd <= containerActionCatalogStart) throw new Error("Container Read-write UI catalog was not found");
  const containerActionCatalog = new Function(`${appSource.slice(containerActionCatalogStart, containerActionCatalogEnd)}; return containerWriteActions;`)();
  if (containerActionCatalog.kubernetes.length !== 3 || containerActionCatalog.docker.length !== 5 || !containerActionCatalog.kubernetes.some((item) => item.id === "scaleDeployment") || !containerActionCatalog.docker.some((item) => item.id === "restartContainer")) throw new Error("Container Read-write UI catalog was incomplete");
  const planAnalyzerStart = appSource.indexOf("const defaultTuningRules");
  const planAnalyzerEnd = appSource.indexOf("function currentSource", planAnalyzerStart);
  if (planAnalyzerStart < 0 || planAnalyzerEnd <= planAnalyzerStart) throw new Error("Visual plan analyzer was not found");
  const planAnalyzerFactory = new Function(`${appSource.slice(planAnalyzerStart, planAnalyzerEnd)}; return { analyzePlanContent, comparePlanAnalyses };`);
  const { analyzePlanContent, comparePlanAnalyses } = planAnalyzerFactory();
  const goodPlan = analyzePlanContent("Index Scan using orders_ix on orders  (cost=0.42..120.00 rows=1200 width=16) (actual time=0.02..12.00 rows=1200 loops=1)", "postgres");
  const slowPlan = analyzePlanContent("Seq Scan on orders  (cost=0.00..18200.00 rows=850000 width=16) (actual time=0.02..3200.00 rows=920000 loops=1)", "postgres");
  const planRegression = comparePlanAnalyses(goodPlan, slowPlan);
  if (!goodPlan.operators.length || slowPlan.score >= goodPlan.score || planRegression.regressions < 1 || !slowPlan.findings.some((item) => /scan/i.test(item.title))) throw new Error("Visual plan regression analysis failed");
  const mongoPlan = analyzePlanContent(JSON.stringify({ executionStats: { executionStages: { stage: "COLLSCAN", nReturned: 10, executionTimeMillisEstimate: 50 } } }), "mongodb");
  if (mongoPlan.operators[0]?.operation !== "COLLSCAN" || !mongoPlan.warnings) throw new Error("MongoDB execution plan analysis failed");
  const gateStart = appSource.indexOf("function metricAverage");
  const gateEnd = appSource.indexOf("function drawFlightChart", gateStart);
  const { recordingGate } = new Function(`${appSource.slice(gateStart, gateEnd)}; return { recordingGate };`)();
  const gateBefore = { samples: [{ metrics: { avg_elapsed_ms: 100, waiting_sessions: 1, logical_reads: 20, physical_reads: 2, errors: 0 } }] };
  const gateAfter = { samples: [{ metrics: { avg_elapsed_ms: 180, waiting_sessions: 3, logical_reads: 60, physical_reads: 4, errors: 1 } }] };
  if (recordingGate(gateBefore, gateAfter).status !== "ROLLBACK REVIEW") throw new Error("Deployment health gate did not flag a material regression");
  const kafkaParserStart = appSource.indexOf("function parseKafkaLag");
  const kafkaParserEnd = appSource.indexOf("function renderKafkaLag", kafkaParserStart);
  const { parseKafkaLag } = new Function(`${appSource.slice(kafkaParserStart, kafkaParserEnd)}; return { parseKafkaLag };`)();
  const lagRows = parseKafkaLag("GROUP TOPIC PARTITION CURRENT-OFFSET LOG-END-OFFSET LAG CONSUMER-ID HOST CLIENT-ID\norders-api orders 0 120 145 25 consumer-1 /10.0.0.1 client-1");
  if (lagRows.length !== 1 || lagRows[0].lag !== 25 || lagRows[0].topic !== "orders") throw new Error("Kafka lag parser failed");
  const containerParserStart = appSource.indexOf("function dashboardSectionJson");
  const containerParserEnd = appSource.indexOf("function containerPressureMarkup", containerParserStart);
  if (containerParserStart < 0 || containerParserEnd <= containerParserStart) throw new Error("Container visual dashboard parsers were not found");
  const { parseKubernetesDashboard, parseDockerDashboard } = new Function(`${appSource.slice(containerParserStart, containerParserEnd)}; return { parseKubernetesDashboard, parseDockerDashboard };`)();
  const k8sModel = parseKubernetesDashboard({ nodes: { stdout: JSON.stringify({ items: [{ metadata: { name: "node-a" }, status: { conditions: [{ type: "Ready", status: "True" }] } }] }) }, workloads: { stdout: JSON.stringify({ items: [{ kind: "Deployment", metadata: { name: "api", namespace: "prod" }, spec: { replicas: 2 }, status: { readyReplicas: 2 } }, { kind: "Pod", metadata: { name: "api-1", namespace: "prod" }, status: { phase: "Running", containerStatuses: [{ ready: true, restartCount: 1 }] } }, { kind: "Service", metadata: { name: "api", namespace: "prod" }, spec: { type: "ClusterIP", selector: { app: "api" } } }] }) }, nodeMetrics: { stdout: "node-a 250m 25% 1Gi 50%" }, podMetrics: { stdout: "prod api-1 100m 256Mi" }, events: { stdout: JSON.stringify({ items: [] }) } });
  if (k8sModel.nodes.length !== 1 || k8sModel.pods.length !== 1 || k8sModel.readyPods !== 1 || k8sModel.cpu !== 25 || k8sModel.memory !== 50 || k8sModel.restartCount !== 1) throw new Error("Kubernetes visual dashboard parser failed");
  const dockerModel = parseDockerDashboard({ info: { stdout: JSON.stringify({ Name: "desktop", ServerVersion: "28.0", NCPU: 8 }) }, containers: { stdout: `${JSON.stringify({ ID: "abc123", Names: "api", Image: "company/api:v2", State: "running", Status: "Up 1 hour", Networks: "bridge" })}\n${JSON.stringify({ ID: "def456", Names: "worker", Image: "company/worker:v2", State: "exited", Status: "Exited (1)" })}` }, stats: { stdout: JSON.stringify({ ID: "abc123", Name: "api", CPUPerc: "12.5%", MemPerc: "33.0%" }) }, images: { stdout: JSON.stringify({ Repository: "company/api" }) }, networks: { stdout: JSON.stringify({ Name: "bridge" }) }, volumes: { stdout: JSON.stringify({ Name: "data" }) }, diskUsage: { stdout: JSON.stringify({ Type: "Images", TotalCount: "1", Active: "1", Size: "500MB" }) } });
  if (dockerModel.containers.length !== 2 || dockerModel.running !== 1 || dockerModel.warningCount !== 1 || dockerModel.cpu !== 12.5 || dockerModel.images.length !== 1 || dockerModel.volumes.length !== 1) throw new Error("Docker visual dashboard parser failed");
  const fingerprintStart = appSource.indexOf("function textFingerprint");
  const fingerprintEnd = appSource.indexOf("async function loadDriftFile", fingerprintStart);
  const { textFingerprint } = new Function(`${appSource.slice(fingerprintStart, fingerprintEnd)}; return { textFingerprint };`)();
  if (textFingerprint("replicas: 2") === textFingerprint("replicas: 3")) throw new Error("Configuration drift fingerprint did not detect a change");
  const serverSource = await readFile(fileURLToPath(new URL("server.mjs", import.meta.url)), "utf8");
  const adapterCatalogSourceStart = serverSource.indexOf("const sqlAdapterCatalog");
  const adapterCatalogSourceEnd = serverSource.indexOf("const EDITOR_ENGINES", adapterCatalogSourceStart);
  const normalizeConnectionStart = serverSource.indexOf("function normalizeDatabaseConnection");
  const normalizeConnectionEnd = serverSource.indexOf("async function directDriverModule", normalizeConnectionStart);
  const connectionCommandStart = serverSource.indexOf("function connectionCommand");
  const connectionCommandEnd = serverSource.indexOf("function connectionValidationSql", connectionCommandStart);
  const catalogSqlStart = serverSource.indexOf("function databaseCatalogSql");
  const catalogSqlEnd = serverSource.indexOf("function nativeLogQuery", catalogSqlStart);
  if (adapterCatalogSourceStart < 0 || adapterCatalogSourceEnd <= adapterCatalogSourceStart || normalizeConnectionStart < 0 || normalizeConnectionEnd <= normalizeConnectionStart || connectionCommandStart < 0 || connectionCommandEnd <= connectionCommandStart || catalogSqlStart < 0 || catalogSqlEnd <= catalogSqlStart) throw new Error("Database connection or object catalog helpers were not found");
  const connectionFactory = new Function(`${serverSource.slice(adapterCatalogSourceStart, adapterCatalogSourceEnd)}\n${serverSource.slice(normalizeConnectionStart, normalizeConnectionEnd)}\n${serverSource.slice(connectionCommandStart, connectionCommandEnd)}\n${serverSource.slice(catalogSqlStart, catalogSqlEnd)}\nreturn { connectionCommand, databaseCatalogSql, parseDatabaseCatalog, normalizeDatabaseConnection };`);
  const { connectionCommand, databaseCatalogSql, parseDatabaseCatalog } = connectionFactory();
  const integratedSqlServer = connectionCommand({ engine: "sqlserver", connection: { host: "db.company.net", port: "1433", database: "ops", authMode: "context" } }, "select 1");
  const passwordPostgres = connectionCommand({ engine: "postgres", connection: { host: "db.company.net", port: "5432", database: "ops", username: "reader", password: "secret", authMode: "password" } }, "select 1");
  if (!integratedSqlServer.args.includes("-E") || integratedSqlServer.args.includes("-U") || Object.keys(integratedSqlServer.env).length || passwordPostgres.env.PGPASSWORD !== "secret" || !passwordPostgres.args.includes("-U")) throw new Error("Database-aware authentication command construction failed");
  const catalogEngines = ["oracle", "postgres", "mongodb", "mysql", "sqlserver", "mariadb", "redshift", "synapse", "snowflake", "databricks", "db2", "hana", "clickhouse", "teradata"];
  if (catalogEngines.some((engine) => !databaseCatalogSql(engine))) throw new Error("Database object catalog SQL coverage was incomplete");
  const parsedCatalog = parseDatabaseCatalog("postgres", 'dbridge_object\n\"DBRIDGE|TABLE|public|orders\"\n\"DBRIDGE|VIEW|reporting|daily_sales\"\n');
  const parsedBigQueryCatalog = parseDatabaseCatalog("bigquery", '[{\"datasetReference\":{\"projectId\":\"project\",\"datasetId\":\"analytics\"}}]');
  if (parsedCatalog.length !== 2 || parsedCatalog[0].schema !== "public" || parsedCatalog[1].type !== "VIEW" || parsedBigQueryCatalog[0]?.type !== "DATASET" || parsedBigQueryCatalog[0]?.name !== "analytics") throw new Error("Database object catalog parsing failed");
  const mongoLiteralStart = serverSource.indexOf("function safeMongoLiteral");
  const mongoLiteralEnd = serverSource.indexOf("async function executeDirectMongo", mongoLiteralStart);
  const mongoHelpers = new Function(`${serverSource.slice(mongoLiteralStart, mongoLiteralEnd)}; return { safeMongoLiteral, mongoCollectionTarget, unwrapMongoExpression };`)();
  const mongoFilter = mongoHelpers.safeMongoLiteral("{active:true,secs_running:{$gte:1}}");
  if (mongoFilter.active !== true || mongoFilter.secs_running.$gte !== 1 || mongoHelpers.mongoCollectionTarget("db.getCollection('orders').find({})")?.name !== "orders" || mongoHelpers.unwrapMongoExpression("JSON.stringify(db.serverStatus(), null, 2)") !== "db.serverStatus()") throw new Error("Safe direct MongoDB expression parsing failed");
  for (const driver of ["mongodb", "pg", "mysql2/promise", "tedious", "oracledb"]) await import(driver);
  const containerAuditStart = serverSource.indexOf("async function readContainerAuditRecords");
  const containerAuditEnd = serverSource.indexOf("function defaultInvestigationStore", containerAuditStart);
  if (containerAuditStart < 0 || containerAuditEnd <= containerAuditStart) throw new Error("Container audit persistence helpers were not found");
  let auditWritten = ""; const missingAuditRead = async () => { const error = new Error("missing"); error.code = "ENOENT"; throw error; };
  const auditHelpers = new Function("readFile", "mkdir", "writeFile", "randomBytes", "CONTAINER_AUDIT_FILE", "USER_DATA_ROOT", `${serverSource.slice(containerAuditStart, containerAuditEnd)}; return { readContainerAuditRecords, appendContainerAuditRecord };`)(missingAuditRead, async () => {}, async (_path, content) => { auditWritten = content; }, () => ({ toString: () => "0123456789abcdef" }), "container-audit.json", ".");
  const emptyAudit = await auditHelpers.readContainerAuditRecords(); const auditRecord = await auditHelpers.appendContainerAuditRecord({ platform: "kubernetes", action: "scaleDeployment", target: "payments-api", namespace: "payments", context: "prod", changeReference: "CHG-12345", status: "success", durationMs: 125, displayCommand: "kubectl scale", detail: "scaled\ncleanly" }); const persistedAudit = JSON.parse(auditWritten);
  if (emptyAudit.length || persistedAudit.version !== 1 || persistedAudit.records.length !== 1 || auditRecord.id !== "container-audit-0123456789abcdef" || auditRecord.detail.includes("\n") || auditRecord.changeReference !== "CHG-12345") throw new Error("Sanitized container audit persistence failed");
  const recommendationStart = serverSource.indexOf("const defaultInvestigationRules");
  const recommendationEnd = serverSource.indexOf("async function available", recommendationStart);
  if (recommendationStart < 0 || recommendationEnd <= recommendationStart) throw new Error("SQL recommendation engine was not found");
  const recommendationFactory = new Function(`${serverSource.slice(recommendationStart, recommendationEnd)}; return { recommendationCatalog, recommendationSql, parseRecommendationMetrics, buildSqlRecommendations, performanceSampleSql, parsePerformanceSample, planHistorySql, goldenGateAdminClientSpec, goldenGateClassicSpec, parseGoldenGateDiagnostics, kubernetesDashboardSpecs, dockerDashboardSpecs, containerWriteActionSpec, containerPreflightSpec };`);
  const { recommendationCatalog, recommendationSql, parseRecommendationMetrics, buildSqlRecommendations, performanceSampleSql, parsePerformanceSample, planHistorySql, goldenGateAdminClientSpec, goldenGateClassicSpec, parseGoldenGateDiagnostics, kubernetesDashboardSpecs, dockerDashboardSpecs, containerWriteActionSpec, containerPreflightSpec } = recommendationFactory();
  if (Object.keys(recommendationCatalog).length !== 6 || Object.values(recommendationCatalog).some((item) => !item.identifier || !item.source || !item.planAction)) throw new Error("SQL recommendation catalog was incomplete");
  for (const engine of Object.keys(recommendationCatalog)) if (!recommendationSql(engine, engine === "postgres" ? "-123456" : "8m5j1t2y4n6p9")) throw new Error(`Recommendation SQL was missing for ${engine}`);
  const parsedMetrics = parseRecommendationMetrics("oracle", '"matched=1"\n"executions=20"\n"elapsed_ms=220000"\n"logical_reads=25000000"');
  if (parsedMetrics.executions !== 20 || parsedMetrics.elapsed_ms !== 220000) throw new Error("SQL recommendation metric parser failed");
  const sampleRecommendations = buildSqlRecommendations("oracle", "8m5j1t2y4n6p9", { matched: 1, executions: 20, elapsed_ms: 220000, cpu_ms: 210000, logical_reads: 25000000, physical_reads: 250000, rows_processed: 200, parses: 20, plan_versions: 24 });
  if (!sampleRecommendations.findings.some((item) => item.severity === "CRITICAL") || !sampleRecommendations.findings.some((item) => item.finding.includes("plan or cursor")) || sampleRecommendations.summary.high < 1) throw new Error("SQL recommendation rules did not rank evidence correctly");
  for (const engine of Object.keys(recommendationCatalog)) {
    if (!performanceSampleSql(engine) || !planHistorySql(engine, engine === "postgres" ? "-123456" : "8m5j1t2y4n6p9")) throw new Error(`Flight recorder SQL or plan history was missing for ${engine}`);
  }
  const sampleMetrics = parsePerformanceSample("oracle", '"active_sessions=5"\n"waiting_sessions=2"\n"executions=200"\n"avg_elapsed_ms=14.5"\n"logical_reads=900"');
  if (sampleMetrics.active_sessions !== 5 || sampleMetrics.waiting_sessions !== 2 || sampleMetrics.avg_elapsed_ms !== 14.5 || sampleMetrics.errors !== 0) throw new Error("Flight recorder metric parser failed");
  const goldenGateSpec = goldenGateAdminClientSpec({ endpoint: "https://ogg.company.net:9001", credential: "dbridge_reader", deployment: "Finance", action: "lag" });
  if (goldenGateSpec.command !== "adminclient" || !goldenGateSpec.stdin.includes("LAG EXTRACT *") || !goldenGateSpec.stdin.includes("AS dbridge_reader") || goldenGateSpec.stdin.includes("PASSWORD")) throw new Error("GoldenGate Admin Client diagnostic was not safely constructed");
  const classicSpec = goldenGateClassicSpec({ host: "ogg.company.net", user: "oggread", port: "22", home: "/u01/app/ogg", action: "overview" });
  if (classicSpec.command !== "ssh" || !classicSpec.args.at(-1).includes("./ggsci") || !classicSpec.args.at(-1).includes("INFO ALL")) throw new Error("GoldenGate Classic diagnostic was not safely constructed");
  const goldenGateAnalysis = parseGoldenGateDiagnostics("EXTRACT RUNNING EXTORD 00:00:05 00:00:02\nREPLICAT ABENDED REPORD 00:35:00 00:01:00\n2026-07-19 ERROR OGG-01091 Unable to write trail: no space left");
  if (goldenGateAnalysis.counts.running !== 1 || goldenGateAnalysis.counts.abended !== 1 || goldenGateAnalysis.maxLagSeconds !== 2100 || !goldenGateAnalysis.findings.some((finding) => finding.severity === "CRITICAL") || !goldenGateAnalysis.codes.includes("OGG-01091")) throw new Error("GoldenGate troubleshooting analysis failed");
  const kubernetesSpecs = kubernetesDashboardSpecs({ context: "prod-cluster", namespace: "payments" }); const dockerSpecs = dockerDashboardSpecs();
  if (kubernetesSpecs.length !== 5 || kubernetesSpecs.filter((spec) => spec.required).length !== 2 || !kubernetesSpecs.every((spec) => spec.args.includes("--context")) || !kubernetesSpecs.find((spec) => spec.id === "workloads").args.includes("payments") || dockerSpecs.length !== 7 || dockerSpecs.filter((spec) => spec.required).length !== 2 || dockerSpecs.some((spec) => spec.command !== "docker")) throw new Error("Container dashboard command allowlists were incomplete");
  const restartDeployment = containerWriteActionSpec({ platform: "kubernetes", action: "restartDeployment", target: "payments-api", context: "prod-cluster", namespace: "payments", accessMode: "read-write", confirmation: "APPLY CONTAINER CHANGE" });
  const scaleDeployment = containerWriteActionSpec({ platform: "kubernetes", action: "scaleDeployment", target: "payments-api", value: 3, namespace: "payments", accessMode: "read-write", confirmation: "APPLY CONTAINER CHANGE" });
  const stopContainer = containerWriteActionSpec({ platform: "docker", action: "stopContainer", target: "payments-api", accessMode: "read-write", confirmation: "APPLY CONTAINER CHANGE" });
  if (restartDeployment.command !== "kubectl" || !restartDeployment.args.includes("rollout") || !restartDeployment.args.includes("deployment/payments-api") || !restartDeployment.args.includes("prod-cluster") || !scaleDeployment.args.includes("--replicas") || !scaleDeployment.args.includes("3") || stopContainer.command !== "docker" || stopContainer.args.join(" ") !== "stop --time 30 payments-api") throw new Error("Container Read-write action allowlists were incomplete");
  const previewDeployment = containerWriteActionSpec({ platform: "kubernetes", action: "scaleDeployment", target: "payments-api", value: 4, context: "prod-cluster", namespace: "payments", changeReference: "CHG-12345", accessMode: "read-write" }, false); const kubernetesPreflight = containerPreflightSpec(previewDeployment); const dockerPreflight = containerPreflightSpec(stopContainer);
  if (previewDeployment.changeReference !== "CHG-12345" || !kubernetesPreflight.args.includes("auth") || !kubernetesPreflight.args.includes("can-i") || !kubernetesPreflight.args.includes("deployments/scale") || dockerPreflight.args.join(" ") !== "info --format {{.ServerVersion}}") throw new Error("Advanced container preflight construction failed");
  let writeGuarded = false; try { containerWriteActionSpec({ platform: "docker", action: "startContainer", target: "payments-api" }); } catch { writeGuarded = true; }
  if (!writeGuarded) throw new Error("Container Read-write actions did not require explicit confirmation");
  let referenceGuarded = false; try { containerWriteActionSpec({ platform: "docker", action: "startContainer", target: "payments-api", changeReference: "CHG;whoami", accessMode: "read-write" }, false); } catch { referenceGuarded = true; }
  if (!referenceGuarded) throw new Error("Container change reference validation accepted command metacharacters");
  for (let i = 0; i < 100 && !output.includes("DBridge Portable is running"); i += 1) await wait(100);
  if (!output.includes("DBridge Portable is running")) throw new Error(`Server did not start: ${output}`);
  const html = await fetch("http://127.0.0.1:17872/").then((response) => response.text());
  for (const marker of ["Flight recorder", "Release & Platform Intelligence", "GoldenGate Operations Center", "goldenGateSqlStudio", "Kubernetes & Docker Visual Dashboard", "containerVisualBody", "refreshContainerDashboard", "containerWritePanel", "containerWriteAction", "previewContainerWriteAction", "containerChangeReference", "containerAutoLock", "containerAuditList", "READ / WRITE", "oggProcessGrid", "oggLogOutput", "captureTopology", "pipelineBaseline", "kafkaLagView", "runbookList", "editorAutocomplete", "toggleAutocomplete", "Real-time completion", "performance-mode-tabs", "performanceModeCurrent", "performanceModeGuide", "performanceModeNext", "Guided Analysis", "Engine Deep Dive", "SQL Evidence", "Trace &amp; Plans", "performanceRuntimeTraceSection", "RUNTIME EVIDENCE WORKBENCH", "Shared pool + 10053 path", "runtimeTraceCapture", "runtimeTraceReset", "runtimeTraceTerminalOutput", "runtime-trace-workbench.css", "sql-performance-unified-v1.css", "performance-unified-grid", "performance-engine-rail", "performanceQuickTrace", "Diagnose a slow query from one screen", "performanceEngineFallbackSection", "runPerformanceFallbackHealth", "openPerformanceFallbackStatement", "performanceFallbackChecks", "performance-friendly-v1.css", "ORACLE BOTTLENECK INTELLIGENCE", "performanceOracleIntelligenceSection", "runOracleBottleneck", "oraclePackScope", "oracleBottleneckSqlId", "oracleBottleneckFindings", "oraclePressureMap", "oracle-performance-v1.css", "Oracle SQL_ID Investigation Sequence", "oracleXraySteps", "runOracleXray", "oracleXrayDiagnosis", "performanceEngineCards", "performanceQuickRecommend", "performanceHealthSection", "POSTGRESQL BOTTLENECK INTELLIGENCE", "performancePostgresSection", "runPostgresBottleneck", "postgresBottleneckFindings", "postgresQueryId", "postgresPressureMap", "usePostgresSelectedQuery", "postgres-technique-grid", "MONGODB PERFORMANCE INTELLIGENCE", "performanceMongoSection", "runMongoBottleneck", "mongoBottleneckFindings", "mongoOperationId", "mongoCollection", "mongoPressureMap", "mongo-technique-grid", "sql-performance-v3.css", "connectionSessionBadge", "saveConnectionSession", "clearConnectionSession", "connection-session.css", "sqlLiveConnectionBadge", "connectSqlStudio", "disconnectSqlStudio", "databaseExplorerTree", "databaseExplorerSearch", "resultGridTab", "resultMessagesTab", "sql-studio-dbgate.css", "sqlTlsMode", "enterprise-shell-v1.css", "commandPalette", "openCommandPalette", "security-posture"]) if (!html.includes(marker)) throw new Error(`The v2.22 visual console is missing ${marker}`);
  for (const marker of ["stack-shell-v3.css", "stack-shell-v3.js", "stack-shell-v4.css", "stack-shell-v4.js", "ssh-terminal.css", "ssh-terminal-ui.js", "sshTerminalHost", "sshTerminalConnect", "terminal-view", "terminalProfile", "terminalPanes", "terminalCommandPreview", "data-view=\"terminal\"", "data-workspace-tab=\"terminal\""]) if (!html.includes(marker)) throw new Error(`The v2.22 stack shell is missing ${marker}`);
  for (const removedMarker of ["Command Autofill Center", "autofillCatalog", "autofillApply", "command-autofill.css", "SQL Script Library", "script-library.css", "scriptSearch", "saveEditorScript", "Inspect platform", "Inspect the delivery stack"]) if (html.includes(removedMarker)) throw new Error(`Removed UI is still present: ${removedMarker}`);
  if (!appSource.includes('placeGoldenGateInSqlStudio();') || !appSource.includes('SQL Studio · GoldenGate Operations Center')) throw new Error("GoldenGate was not routed into SQL Studio");
  const token = html.match(/name="dbridge-token" content="([a-f0-9]+)"/)?.[1];
  if (!token) throw new Error("Session token was not injected");
  const health = await request("/api/health", token);
  if (health.product !== "DBridge Portable" || health.version !== "2.28.0") throw new Error("Health response was invalid");
  const diagnosticStudio = await request("/api/performance/diagnostic-studio/catalog", token);
  if (diagnosticStudio.playbooks?.length !== 8 || Object.keys(diagnosticStudio.engines || {}).length !== 6 || !/does not kill sessions/i.test(diagnosticStudio.safety || "")) throw new Error("SQL Diagnostic Incident Command catalog was incomplete");
  const migrationLogCatalog = await request("/api/logs/migration-compare/catalog", token);
  if (Object.keys(migrationLogCatalog.engines || {}).length !== 7 || migrationLogCatalog.maxLogBytes !== 3500000 || !/not stored/i.test(migrationLogCatalog.safety)) throw new Error("Migration log comparison catalog was incomplete");
  const dataPumpExportFixture = ['. . exported "HR"."EMPLOYEES" 17 KB 107 rows', 'Job "SYSTEM"."SYS_EXPORT_SCHEMA_01" successfully completed'].join(String.fromCharCode(10));
  const dataPumpImportFixture = ['. . imported "HR"."EMPLOYEES" 17 KB 100 rows', 'Job "SYSTEM"."SYS_IMPORT_SCHEMA_01" successfully completed'].join(String.fromCharCode(10));
  const migrationLogComparison = await request("/api/logs/migration-compare", token, { engine: "oracle", exportLog: dataPumpExportFixture, importLog: dataPumpImportFixture, ignoreTimestamps: true });
  if (migrationLogComparison.engine !== "oracle" || migrationLogComparison.summary.rowMismatches !== 1 || !migrationLogComparison.redline.length || !migrationLogComparison.verificationScript.includes("COUNT(*)")) throw new Error("Migration log comparison API did not reconcile Data Pump rows");
  const dbgateStyle = await fetch("http://127.0.0.1:17872/sql-studio-dbgate.css");
  if (!dbgateStyle.ok || !(await dbgateStyle.text()).includes(".database-explorer")) throw new Error("DBGate-style SQL Studio stylesheet was unavailable");
  const oraclePerformanceStyle = await fetch("http://127.0.0.1:17872/oracle-performance-v1.css");
  if (!oraclePerformanceStyle.ok || !(await oraclePerformanceStyle.text()).includes(".oracle-license-banner")) throw new Error("Oracle performance intelligence stylesheet was unavailable");
  const performanceFriendlyStyle = await fetch("http://127.0.0.1:17872/performance-friendly-v1.css");
  if (!performanceFriendlyStyle.ok || !(await performanceFriendlyStyle.text()).includes(".performance-mode-guide")) throw new Error("Friendly SQL performance stylesheet was unavailable");
  const runtimeTraceStyle = await fetch("http://127.0.0.1:17872/runtime-trace-workbench.css");
  if (!runtimeTraceStyle.ok || !(await runtimeTraceStyle.text()).includes(".runtime-trace-workbench")) throw new Error("Unified runtime trace stylesheet was unavailable");
  const unifiedPerformanceStyle = await fetch("http://127.0.0.1:17872/sql-performance-unified-v1.css");
  if (!unifiedPerformanceStyle.ok || !(await unifiedPerformanceStyle.text()).includes(".performance-unified-grid")) throw new Error("Unified SQL performance stylesheet was unavailable");
  const enterpriseShellStyle = await fetch("http://127.0.0.1:17872/enterprise-shell-v1.css");
  if (!enterpriseShellStyle.ok || !(await enterpriseShellStyle.text()).includes(".command-palette-dialog")) throw new Error("Enterprise application shell stylesheet was unavailable");
  const stackShellStyle = await fetch("http://127.0.0.1:17872/stack-shell-v3.css");
  if (!stackShellStyle.ok || !(await stackShellStyle.text()).includes(".tabby-panes.split")) throw new Error("Stack shell stylesheet was unavailable");
  const stackShellRuntime = await fetch("http://127.0.0.1:17872/stack-shell-v3.js");
  const stackShellSource = await stackShellRuntime.text();
  if (!stackShellRuntime.ok || !stackShellSource.includes("terminalProfiles") || !stackShellSource.includes("installWorkspaceRibbons")) throw new Error("Stack shell runtime was unavailable");
  const stackShellV4Style = await fetch("http://127.0.0.1:17872/stack-shell-v4.css");
  if (!stackShellV4Style.ok || !(await stackShellV4Style.text()).includes(".diagnostics-journey")) throw new Error("Unified diagnostics stylesheet was unavailable");
  const stackShellV4Runtime = await fetch("http://127.0.0.1:17872/stack-shell-v4.js");
  const stackShellV4Source = await stackShellV4Runtime.text();
  if (!stackShellV4Runtime.ok || !stackShellV4Source.includes("buildDiagnosticsWorkspace") || !stackShellV4Source.includes("buildDevopsWorkspace")) throw new Error("Unified workspace runtime was unavailable");
  const sshTerminalStyle = await fetch("http://127.0.0.1:17872/ssh-terminal.css");
  if (!sshTerminalStyle.ok || !(await sshTerminalStyle.text()).includes(".ssh-session-tabs")) throw new Error("SSH terminal stylesheet was unavailable");
  const sshTerminalRuntime = await fetch("http://127.0.0.1:17872/ssh-terminal-ui.js");
  const sshTerminalSource = await sshTerminalRuntime.text();
  if (!sshTerminalRuntime.ok || !sshTerminalSource.includes("preflight") || !sshTerminalSource.includes("MAX_UI_SESSIONS")) throw new Error("SSH terminal runtime was unavailable");
  for (const header of ["content-security-policy", "cross-origin-opener-policy", "cross-origin-resource-policy", "permissions-policy", "referrer-policy", "x-content-type-options", "x-frame-options"]) if (!enterpriseShellStyle.headers.get(header)) throw new Error(`Security header was missing: ${header}`);
  for (const marker of ["theme-dark.css", "advanced-ui.css", "theme-boot.js", "themeSwitch", "openShortcutMap", "shortcutMap", "sessionPulse", "connectionProfileSelect", "saveConnectionProfile", "deleteConnectionProfile"]) if (!html.includes(marker)) throw new Error(`The advanced console UI is missing ${marker}`);
  const darkTheme = await fetch("http://127.0.0.1:17872/theme-dark.css");
  const darkThemeText = await darkTheme.text();
  if (!darkTheme.ok || !darkThemeText.includes('html[data-theme="dark"]')) throw new Error("Generated dark theme stylesheet was unavailable");
  const advancedUiStyle = await fetch("http://127.0.0.1:17872/advanced-ui.css");
  const advancedUiText = await advancedUiStyle.text();
  if (!advancedUiStyle.ok || !advancedUiText.includes(".theme-switch") || !advancedUiText.includes(".connection-profiles") || !advancedUiText.includes(".shortcut-map-dialog")) throw new Error("Advanced console UI stylesheet was unavailable");
  const themeBoot = await fetch("http://127.0.0.1:17872/theme-boot.js");
  if (!themeBoot.ok || !(await themeBoot.text()).includes("dbridge.ui.preferences.v1")) throw new Error("Theme bootstrap script was unavailable");
  // Every dark override must outrank its light source rule, or the theme silently loses.
  const darkSelectors = darkThemeText.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
    .map((line) => line.trim()).filter((line) => line.includes("{"))
    .map((line) => line.slice(0, line.indexOf("{")).trim()).filter(Boolean);
  const unscoped = darkSelectors.filter((selector) => !selector.startsWith("@media") && selector.split(",").some((part) => !part.trim().startsWith('html[data-theme="dark"]')));
  if (unscoped.length) throw new Error(`Dark theme has ${unscoped.length} unscoped rule(s), first: ${unscoped[0].slice(0, 80)}`);
  if (darkSelectors.length < 500) throw new Error("Dark theme coverage looks incomplete");
  for (const marker of ["function setThemeMode", "function toggleThemeMode", "function saveConnectionProfile", "function applyConnectionProfile", "function openShortcutMap", "commandPaletteActions"]) if (!appSource.includes(marker)) throw new Error(`Advanced console behaviour is missing ${marker}`);
  const adapterCatalog = await request("/api/adapters", token);
  if (adapterCatalog.total !== 15 || Object.keys(adapterCatalog.adapters).length !== 15 || !adapterCatalog.adapters.snowflake || !adapterCatalog.adapters.teradata || adapterCatalog.adapters.mongodb.preferredAccess !== "direct" || !adapterCatalog.adapters.mongodb.directAvailable || adapterCatalog.adapters.mongodb.client) throw new Error("Database and warehouse adapter catalog was incomplete");
  const performanceCatalog = await request("/api/performance/catalog", token);
  if (performanceCatalog.engines !== 6 || performanceCatalog.totalChecks !== 60 || Object.values(performanceCatalog.catalog).some((checks) => Object.keys(checks).length !== 10)) throw new Error("Advanced database tuning catalog was incomplete");
  const runtimeTraceApiCatalog = await request("/api/performance/runtime-trace/catalog", token);
  if (runtimeTraceApiCatalog.engines !== 6 || runtimeTraceApiCatalog.totalChecks !== 31 || Object.values(runtimeTraceApiCatalog.catalog).some((definition) => definition.checks.some((check) => Object.hasOwn(check, "sql"))) || !/fixed read-only/i.test(runtimeTraceApiCatalog.safety)) throw new Error("Unified runtime trace API catalog was incomplete or exposed executable SQL");
  const unsafeRuntimeTraceId = await fetch("http://127.0.0.1:17872/api/performance/runtime-trace/capture", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "oracle", identifier: "bad';drop" }) });
  if (unsafeRuntimeTraceId.status !== 500) throw new Error("Unified runtime trace endpoint accepted an unsafe identifier");
  const oracleBottleneckApiCatalog = await request("/api/performance/oracle-bottleneck/catalog", token);
  if (oracleBottleneckApiCatalog.engine !== "oracle" || oracleBottleneckApiCatalog.totalChecks !== 30 || oracleBottleneckApiCatalog.catalog.length !== 30 || oracleBottleneckApiCatalog.catalog.some((item) => Object.hasOwn(item, "sql")) || !oracleBottleneckApiCatalog.scopes.core || !oracleBottleneckApiCatalog.scopes.diagnostics || !oracleBottleneckApiCatalog.scopes.tuning) throw new Error("Oracle bottleneck API catalog was incomplete or exposed SQL");
  const unsafeOracleBottleneckSqlId = await fetch("http://127.0.0.1:17872/api/performance/oracle-bottleneck/analyze", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "oracle", sqlId: "bad';drop", packScope: "core" }) });
  if (unsafeOracleBottleneckSqlId.status !== 500) throw new Error("Oracle bottleneck analysis accepted an unsafe SQL_ID");
  const unsafeOraclePackScope = await fetch("http://127.0.0.1:17872/api/performance/oracle-bottleneck/analyze", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "oracle", sqlId: "", packScope: "all;drop" }) });
  if (unsafeOraclePackScope.status !== 500) throw new Error("Oracle bottleneck analysis accepted an unsafe pack scope");
  const postgresBottleneckApiCatalog = await request("/api/performance/postgres-bottleneck/catalog", token);
  if (postgresBottleneckApiCatalog.engine !== "postgres" || postgresBottleneckApiCatalog.totalChecks !== 26 || postgresBottleneckApiCatalog.catalog.length !== 26 || postgresBottleneckApiCatalog.catalog.some((item) => Object.hasOwn(item, "sql"))) throw new Error("PostgreSQL bottleneck API catalog was incomplete");
  const unsafePostgresQueryId = await fetch("http://127.0.0.1:17872/api/performance/postgres-bottleneck/analyze", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "postgres", queryId: "1;drop table users" }) });
  if (unsafePostgresQueryId.status !== 500) throw new Error("PostgreSQL bottleneck analysis accepted an unsafe queryid");
  const mongodbBottleneckApiCatalog = await request("/api/performance/mongodb-bottleneck/catalog", token);
  if (mongodbBottleneckApiCatalog.engine !== "mongodb" || mongodbBottleneckApiCatalog.totalChecks !== 19 || mongodbBottleneckApiCatalog.catalog.length !== 19) throw new Error("MongoDB bottleneck API catalog was incomplete");
  const unsafeMongoCollection = await fetch("http://127.0.0.1:17872/api/performance/mongodb-bottleneck/analyze", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "mongodb", collection: "orders;$where" }) });
  if (unsafeMongoCollection.status !== 500) throw new Error("MongoDB bottleneck analysis accepted an unsafe collection");
  const liveRecommendationCatalog = await request("/api/performance/recommendation-catalog", token);
  if (liveRecommendationCatalog.engines !== 6 || Object.keys(liveRecommendationCatalog.catalog).length !== 6) throw new Error("SQL recommendation API catalog was incomplete");
  const liveOracleXrayCatalog = await request("/api/performance/oracle-sql-id/catalog", token);
  if (liveOracleXrayCatalog.engine !== "oracle" || liveOracleXrayCatalog.totalChecks !== 22 || liveOracleXrayCatalog.catalog.length !== 22 || !/Diagnostics or Tuning Pack/.test(liveOracleXrayCatalog.licensingNote)) throw new Error("Oracle SQL_ID X-Ray API catalog was incomplete");
  const unsafeOracleXray = await fetch("http://127.0.0.1:17872/api/performance/oracle-sql-id/check", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ check: "history", identifier: "bad';drop", connection: {} }) });
  if (unsafeOracleXray.status !== 500) throw new Error("Oracle SQL_ID X-Ray accepted an unsafe identifier");
  const unlicensedOracleXray = await fetch("http://127.0.0.1:17872/api/performance/oracle-sql-id/check", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ check: "history", identifier: "8m5j1t2y4n6p9", packScope: "core" }) });
  if (unlicensedOracleXray.status !== 422) throw new Error("Oracle SQL_ID X-Ray queried Diagnostics Pack evidence without explicit scope");
  const unlicensedOracleMonitor = await fetch("http://127.0.0.1:17872/api/performance/oracle-sql-id/check", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ check: "progress", identifier: "8m5j1t2y4n6p9", packScope: "diagnostics" }) });
  if (unlicensedOracleMonitor.status !== 422) throw new Error("Oracle SQL_ID X-Ray queried Tuning Pack evidence without explicit scope");
  const initialInvestigation = await request("/api/investigation", token);
  if (initialInvestigation.store.version !== 3 || initialInvestigation.store.rules.length !== 6 || initialInvestigation.store.baselines.length || initialInvestigation.store.events.length || initialInvestigation.store.recordings.length || initialInvestigation.store.devopsSnapshots.length || initialInvestigation.store.runbooks.length || initialInvestigation.store.autofillProfiles.length) throw new Error("Investigation workspace defaults were invalid");
  const initialContainerAudit = await request("/api/devops/container-actions/audit", token);
  if (!Array.isArray(initialContainerAudit.records) || initialContainerAudit.records.length) throw new Error("Container change audit defaults were invalid");
  const savedBaseline = await request("/api/investigation/baselines", token, { name: "Smoke good plan", engine: "oracle", identifier: "8m5j1t2y4n6p9", plan: { score: 82, totalCost: 120, estimatedRows: 1000, actualRows: 1200, warnings: 1, fingerprint: "PLAN-SMOKE", operators: [{ depth: 0, operation: "SELECT STATEMENT", cost: 120, estimatedRows: 1000, actualRows: 1200, status: "normal" }] } });
  if (savedBaseline.store.baselines.length !== 1 || savedBaseline.baseline.plan.operators.length !== 1) throw new Error("Investigation baseline did not save");
  const savedEvent = await request("/api/investigation/events", token, { type: "deployment", title: "Smoke deployment", details: "release v2", occurredAt: new Date().toISOString() });
  if (savedEvent.store.events.length !== 1 || savedEvent.event.type !== "deployment") throw new Error("Incident timeline event did not save");
  const adjustedRules = initialInvestigation.store.rules.map((rule) => rule.id === "avg_elapsed_ms" ? { ...rule, warning: 300, high: 1200 } : rule);
  const savedRules = await request("/api/investigation/rules", token, { rules: adjustedRules });
  if (savedRules.rules.find((rule) => rule.id === "avg_elapsed_ms")?.high !== 1200) throw new Error("Custom tuning thresholds did not save");
  const savedRecording = await request("/api/investigation/recordings", token, { name: "Smoke flight", engine: "postgres", samples: [{ collectedAt: new Date().toISOString(), metrics: { active_sessions: 2, waiting_sessions: 1, executions: 10, avg_elapsed_ms: 12.5, logical_reads: 40, physical_reads: 2, throughput: 5, errors: 0 } }] });
  if (savedRecording.store.recordings.length !== 1 || savedRecording.recording.samples[0].metrics.avg_elapsed_ms !== 12.5) throw new Error("Flight recording did not save");
  const savedSnapshot = await request("/api/investigation/devops-snapshots", token, { type: "pipeline", name: "Smoke pipeline", data: '[{"workflowName":"build","conclusion":"success"}]', metadata: { repository: "company/service" } });
  if (savedSnapshot.store.devopsSnapshots.length !== 1 || savedSnapshot.snapshot.type !== "pipeline") throw new Error("DevOps snapshot did not save");
  const savedRunbook = await request("/api/investigation/runbooks", token, { name: "Smoke Git review", tool: "git", actions: ["version", "status"] });
  if (savedRunbook.store.runbooks.length !== 1 || savedRunbook.runbook.actions.length !== 2) throw new Error("Approved runbook did not save");
  const savedAutofill = await request("/api/investigation/autofill-profiles", token, { name: "Smoke PostgreSQL", kind: "database", data: { engine: "postgres", host: "db.company.net", port: "5432", database: "analytics", username: "reader", password: "must-not-persist" } });
  if (savedAutofill.store.autofillProfiles.length !== 1 || savedAutofill.profile.data.engine !== "postgres" || Object.hasOwn(savedAutofill.profile.data, "password") || JSON.stringify(savedAutofill.store).includes("must-not-persist")) throw new Error("Secure database autofill profile did not save correctly");
  await request("/api/investigation/baselines/delete", token, { id: savedBaseline.baseline.id });
  await request("/api/investigation/events/delete", token, { id: savedEvent.event.id });
  await request("/api/investigation/recordings/delete", token, { id: savedRecording.recording.id });
  await request("/api/investigation/devops-snapshots/delete", token, { id: savedSnapshot.snapshot.id });
  await request("/api/investigation/runbooks/delete", token, { id: savedRunbook.runbook.id });
  await request("/api/investigation/autofill-profiles/delete", token, { id: savedAutofill.profile.id });
  const removedLibrary = await fetch("http://127.0.0.1:17872/api/scripts", { headers: { "X-DBridge-Token": token } });
  if (removedLibrary.status !== 404) throw new Error("Removed Script Library API is still available");
  const editorSession = { tabs: [{ id: "tab-smoke-test", name: "Smoke query", engine: "postgres", content: "select current_timestamp", dirty: true, cursor: 6 }], activeId: "tab-smoke-test", settings: { wordWrap: true, fontSize: 13, autocompleteScope: "ops" } };
  const savedSession = await request("/api/editor/session", token, editorSession);
  if (savedSession.tabCount !== 1) throw new Error("Editor session did not save");
  const restoredSession = await request("/api/editor/session", token);
  if (restoredSession.session.tabs[0]?.content !== "select current_timestamp" || restoredSession.session.settings.fontSize !== 13 || restoredSession.session.settings.autocompleteScope !== "ops") throw new Error("Editor session did not restore");
  scratch = await mkdtemp(join(tmpdir(), "dbridge-smoke-"));
  const log = join(scratch, "alert.log");
  await writeFile(log, "startup complete\nORA-00000 test marker\n", "utf8");
  const tail = await request("/api/logs/tail", token, { path: log });
  if (!tail.text.includes("startup complete")) throw new Error("Log tail did not return file data");
  await writeFile(log, "rotated log\n", "utf8");
  const rotated = await request("/api/logs/tail", token, { path: log, offset: tail.offset });
  if (!rotated.text.includes("rotated log")) throw new Error("Log rotation was not detected");
  const trace = await request("/api/traces/analyze", token, { path: log });
  if (trace.analysis.lines < 1) throw new Error("Trace analyzer did not read the rotated file");
  const blocked = await fetch("http://127.0.0.1:17872/api/sql/run", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "postgres", sql: "drop table users", allowWrites: false }) });
  if (blocked.status !== 500) throw new Error("Read-only safety did not block mutating SQL");
  const unsafeTarget = await fetch("http://127.0.0.1:17872/api/logs/telemetry", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ source: "redshift", target: "group;whoami" }) });
  if (unsafeTarget.status !== 500) throw new Error("Cloud telemetry target validation did not reject command metacharacters");
  const unsafeSshHost = await fetch("http://127.0.0.1:17872/api/logs/remote-tail", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ host: "db-server;whoami", user: "reader", path: "/var/log/postgresql/postgresql.log" }) });
  if (unsafeSshHost.status !== 500) throw new Error("Remote log validation did not reject an unsafe SSH host");
  const unsupportedNative = await fetch("http://127.0.0.1:17872/api/logs/native", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "redis" }) });
  if (unsupportedNative.status !== 500) throw new Error("Native log collection accepted an unsupported engine");
  const gitInspection = await request("/api/devops/run", token, { tool: "git", action: "version" });
  if (gitInspection.command !== "git" || !gitInspection.displayCommand.includes("--version")) throw new Error("Guided DevOps inspection did not build the expected command");
  const unsafeContext = await fetch("http://127.0.0.1:17872/api/devops/run", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ tool: "kubernetes", action: "pods", target: "--malicious-context" }) });
  if (unsafeContext.status !== 500) throw new Error("Guided DevOps validation accepted an unsafe context");
  const unsafeAutofill = await fetch("http://127.0.0.1:17872/api/investigation/autofill-profiles", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ name: "Unsafe", kind: "devops", data: { tool: "powershell", target: "whoami" } }) });
  if (unsafeAutofill.status !== 500) throw new Error("Autofill profile validation accepted an unsupported command tool");
  const unsafeTopology = await fetch("http://127.0.0.1:17872/api/devops/kubernetes-topology", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ context: "prod;whoami" }) });
  if (unsafeTopology.status !== 500) throw new Error("Kubernetes topology accepted an unsafe context");
  const unsafeContainerDashboard = await fetch("http://127.0.0.1:17872/api/devops/kubernetes-dashboard", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ context: "prod;whoami", namespace: "default" }) });
  if (unsafeContainerDashboard.status !== 500) throw new Error("Kubernetes visual dashboard accepted an unsafe context");
  const unconfirmedContainerWrite = await fetch("http://127.0.0.1:17872/api/devops/container-action", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ platform: "docker", action: "startContainer", target: "payments-api" }) });
  if (unconfirmedContainerWrite.status !== 500) throw new Error("Container write endpoint accepted an unconfirmed change");
  const unsafeContainerWrite = await fetch("http://127.0.0.1:17872/api/devops/container-action", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ platform: "kubernetes", action: "deletePod", target: "api;whoami", namespace: "payments", accessMode: "read-write", confirmation: "APPLY CONTAINER CHANGE" }) });
  if (unsafeContainerWrite.status !== 500) throw new Error("Container write endpoint accepted an unsafe target");
  const unsafePipeline = await fetch("http://127.0.0.1:17872/api/devops/pipeline-runs", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ repository: "company/service;whoami" }) });
  if (unsafePipeline.status !== 500) throw new Error("Pipeline intelligence accepted an unsafe repository");
  const unsafeKafka = await fetch("http://127.0.0.1:17872/api/devops/kafka-lag", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ endpoint: "broker:9092;whoami" }) });
  if (unsafeKafka.status !== 500) throw new Error("Kafka lag intelligence accepted an unsafe endpoint");
  const unsafeGoldenGate = await fetch("http://127.0.0.1:17872/api/goldengate/diagnose", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ architecture: "microservices", endpoint: "https://ogg.company.net:9001\nINFO ALL", credential: "reader", action: "overview" }) });
  if (unsafeGoldenGate.status !== 500) throw new Error("GoldenGate diagnostics accepted an unsafe endpoint");
  const unsafeGoldenGateHome = await fetch("http://127.0.0.1:17872/api/goldengate/diagnose", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ architecture: "classic", host: "ogg.company.net", user: "oggread", port: "22", home: "/u01/app/ogg;whoami", action: "overview" }) });
  if (unsafeGoldenGateHome.status !== 500) throw new Error("GoldenGate Classic diagnostics accepted an unsafe home path");
  const missingContainer = await fetch("http://127.0.0.1:17872/api/devops/run", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ tool: "docker", action: "logs" }) });
  if (missingContainer.status !== 500) throw new Error("Docker log inspection accepted a missing container");
  const missingPodmanContainer = await fetch("http://127.0.0.1:17872/api/devops/run", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ tool: "podman", action: "inspect" }) });
  if (missingPodmanContainer.status !== 500) throw new Error("Podman inspection accepted a missing target");
  const invalidTuningCheck = await fetch("http://127.0.0.1:17872/api/performance/check", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "postgres", check: "dropEverything" }) });
  if (invalidTuningCheck.status !== 500) throw new Error("Performance API accepted an unapproved tuning check");
  const unsafeSqlIdentifier = await fetch("http://127.0.0.1:17872/api/performance/recommend", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "oracle", identifier: "x' union select password" }) });
  if (unsafeSqlIdentifier.status !== 500) throw new Error("SQL recommendation API accepted an unsafe identifier");
  const unsafeAdapterHost = await fetch("http://127.0.0.1:17872/api/sql/run", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "snowflake", sql: "select 1", connection: { host: "account\n!system", database: "ANALYTICS", username: "reader" } }) });
  if (unsafeAdapterHost.status !== 500) throw new Error("Database adapter accepted an unsafe connection target");
  const unsafeClientEscape = await fetch("http://127.0.0.1:17872/api/sql/run", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ engine: "teradata", sql: "select 1\n.OS whoami", connection: { host: "warehouse", database: "analytics", username: "reader", password: "safe" } }) });
  if (unsafeClientEscape.status !== 500) throw new Error("SQL Studio accepted a database-client escape command");
  const optimizerTrace = `Oracle Database 19c Enterprise Edition Release 19.0.0.0.0
----- Current SQL Statement for this session (sql_id=8m5j1t2y4n6p9) -----
select * from orders where customer_id = :b1
***************************************
PARAMETERS USED BY THE OPTIMIZER
optimizer_features_enable = 19.1.0
***************************************
QUERY BLOCK SIGNATURE
CBQT: Considering cost-based transformation on query block SEL$1
SINGLE TABLE ACCESS PATH
Access Path: IndexRange
Join order[1]: ORDERS CUSTOMERS
Best join order: 1
Final cost for query block SEL$1: 17
BEGIN_OUTLINE_DATA
INDEX(@"SEL$1" "ORDERS"@"SEL$1" "ORDERS_CUST_IX")
END_OUTLINE_DATA`;
  const optimizerAnalysis = await request("/api/oracle/trace/analyze", token, { sourceName: "optimizer_10053.trc", text: optimizerTrace });
  if (optimizerAnalysis.analysis.type !== "10053 Optimizer Trace" || optimizerAnalysis.analysis.sqlIds[0] !== "8m5j1t2y4n6p9" || !optimizerAnalysis.analysis.optimizer.accessPaths.length || !optimizerAnalysis.analysis.optimizer.outlineHints.length) throw new Error("Oracle 10053 analysis was incomplete");
  const sqlTrace = `PARSING IN CURSOR #123 len=32 dep=0 uid=5 oct=3 lid=5 tim=100 hv=1 ad='1' sqlid='1abc2def3ghij'
select * from orders where id=:b1
END OF STMT
PARSE #123:c=100,e=200,p=1,cr=2,cu=0,mis=1,r=0,dep=0,og=1,plh=42,tim=200
EXEC #123:c=200,e=500,p=0,cr=4,cu=1,mis=0,r=1,dep=0,og=1,plh=42,tim=700
WAIT #123: nam='db file sequential read' ela=600 file#=1 block#=2 blocks=1 obj#=3 tim=1300
FETCH #123:c=100,e=300,p=1,cr=3,cu=0,mis=0,r=1,dep=0,og=1,plh=42,tim=1600`;
  const sqlTraceAnalysis = await request("/api/oracle/trace/analyze", token, { sourceName: "sql_10046.trc", text: sqlTrace });
  if (sqlTraceAnalysis.analysis.type !== "10046 SQL Trace" || sqlTraceAnalysis.analysis.counts.execute !== 1 || sqlTraceAnalysis.analysis.counts.wait !== 1 || sqlTraceAnalysis.analysis.topWaits[0]?.event !== "db file sequential read" || !sqlTraceAnalysis.analysis.sqlTexts.length) throw new Error("Oracle 10046 analysis was incomplete");
  const invalidTkprofSort = await fetch("http://127.0.0.1:17872/api/oracle/tkprof", { method: "POST", headers: { "Content-Type": "application/json", "X-DBridge-Token": token }, body: JSON.stringify({ path: "C:\\missing.trc", sort: "shell-command" }) });
  if (invalidTkprofSort.status !== 500) throw new Error("TKPROF accepted an unapproved sort method");
  const baseline = await request("/api/devops/version-baseline", token, {});
  if (!baseline.comparison.capturedAt || baseline.comparison.rows.length < 20) throw new Error("DevOps version baseline was not saved");
  const comparison = await request("/api/devops/version-comparison", token);
  if (comparison.comparison.rows.length !== baseline.comparison.rows.length || (comparison.comparison.summary.unchanged || 0) < 1) throw new Error("DevOps version comparison was invalid");
  console.log("DBridge portable smoke test passed");
} finally {
  child.kill();
  if (scratch) await rm(scratch, { recursive: true, force: true });
  await rm(scriptData, { recursive: true, force: true });
}
