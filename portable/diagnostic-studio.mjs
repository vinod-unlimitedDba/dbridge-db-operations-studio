const engineDefinitions = {
  oracle: {
    label: "Oracle",
    identifier: "SQL_ID",
    reference: "https://docs.oracle.com/en/database/oracle/oracle-database/23/tgsql/monitoring-database-operations.html",
  },
  postgres: {
    label: "PostgreSQL",
    identifier: "queryid",
    reference: "https://www.postgresql.org/docs/current/monitoring.html",
  },
  mongodb: {
    label: "MongoDB",
    identifier: "operation ID or comment",
    reference: "https://www.mongodb.com/docs/manual/tutorial/evaluate-operation-performance/",
  },
  mysql: {
    label: "MySQL",
    identifier: "statement digest",
    reference: "https://dev.mysql.com/doc/refman/8.4/en/performance-schema.html",
  },
  mariadb: {
    label: "MariaDB",
    identifier: "statement digest",
    reference: "https://mariadb.com/docs/server/reference/system-tables/performance-schema",
  },
  sqlserver: {
    label: "SQL Server",
    identifier: "query hash",
    reference: "https://learn.microsoft.com/en-us/sql/relational-databases/performance/performance-monitoring-and-tuning-tools",
  },
};

export const diagnosticStudioEngines = Object.freeze(engineDefinitions);

export const diagnosticPlaybooks = Object.freeze([
  {
    id: "slow-sql",
    label: "Slow SQL / operation",
    mark: "SQL",
    description: "Correlate active work, retained statement metrics, plan evidence, estimates, waits, statistics and history.",
    verify: "Confirm the incident window and compare estimated versus observed work before changing SQL, statistics, indexes, hints, or plans.",
    checks: {
      oracle: ["environment", "capabilities", "liveActivity", "systemWaits", "topSql", "focusedSql", "focusedPlanStats", "cursorPlan", "childCursors", "bindMetadata", "statsHealth", "ashProfile", "awrSqlHistory", "sqlMonitor"],
      postgres: ["environment", "capabilities", "activity", "waits", "statements", "focusedStatement", "prepared", "tables", "indexes", "statementCapacity"],
      mongodb: ["environment", "server", "currentOps", "profiler", "queryStats", "indexes", "planCache", "diagnosticLog"],
      mysql: ["environment", "activity", "waitProfile", "topDigests", "focusedDigest", "tempAndSorts", "indexSignals", "settings"],
      mariadb: ["environment", "activity", "waitProfile", "topDigests", "focusedDigest", "tempAndSorts", "indexSignals", "settings"],
      sqlserver: ["environment", "activity", "currentWaits", "topQueries", "focusedQuery", "queryStore", "queryStoreRegressions", "statistics", "indexUsage"],
    },
  },
  {
    id: "blocking",
    label: "Blocking / lock incident",
    mark: "LCK",
    description: "Build the waiter-to-blocker chain, transaction context, resource scope and elapsed impact without terminating work.",
    verify: "Contact the owning application or DBA and verify transaction state, rollback cost and business impact before any session action.",
    checks: {
      oracle: ["environment", "sessionPressure", "liveActivity", "blockers", "systemWaits", "longOps", "undoHealth"],
      postgres: ["environment", "activity", "waits", "blockers", "longTransactions", "prepared"],
      mongodb: ["environment", "currentOps", "locks", "admissions", "transactions", "diagnosticLog"],
      mysql: ["environment", "connections", "activity", "dataLocks", "metadataLocks", "waitProfile"],
      mariadb: ["environment", "connections", "activity", "dataLocks", "metadataLocks", "waitProfile"],
      sqlserver: ["environment", "activity", "blockers", "currentWaits", "waitProfile"],
    },
  },
  {
    id: "cpu-concurrency",
    label: "CPU / concurrency pressure",
    mark: "CPU",
    description: "Separate database CPU demand, runnable work, connection pressure, parsing, parallelism and non-CPU waits.",
    verify: "Compare a short interval with host CPU and scheduler/run-queue evidence; cumulative database counters are not proof of current saturation.",
    checks: {
      oracle: ["environment", "sessionPressure", "liveActivity", "systemWaits", "systemMetrics", "timeModel", "topSql", "libraryCache", "parallelHealth"],
      postgres: ["environment", "activity", "waits", "statements", "prepared", "settings"],
      mongodb: ["environment", "server", "currentOps", "connections", "admissions", "queryStats"],
      mysql: ["environment", "connections", "activity", "waitProfile", "topDigests", "settings"],
      mariadb: ["environment", "connections", "activity", "waitProfile", "topDigests", "settings"],
      sqlserver: ["environment", "connections", "activity", "currentWaits", "waitProfile", "schedulers", "topQueries", "queryStore"],
    },
  },
  {
    id: "io-storage",
    label: "I/O / storage latency",
    mark: "I/O",
    description: "Attribute physical work and latency to database files, tables or collections, temporary work, logs and access paths.",
    verify: "Use interval deltas and correlate exact files with operating-system and storage telemetry before changing cache or storage.",
    checks: {
      oracle: ["environment", "systemWaits", "systemMetrics", "segmentPressure", "fileIo", "tempUsage", "undoHealth", "redoStats", "topSql"],
      postgres: ["environment", "database", "statements", "tables", "wal", "io", "tableIo", "checkpointer", "checkpointerLegacy"],
      mongodb: ["environment", "server", "wiredTiger", "checkpoints", "database", "collections", "oplog"],
      mysql: ["environment", "bufferPool", "fileIo", "tableIo", "tempAndSorts", "topDigests", "tables"],
      mariadb: ["environment", "bufferPool", "fileIo", "tableIo", "tempAndSorts", "topDigests", "tables"],
      sqlserver: ["environment", "waitProfile", "fileIo", "topQueries", "tempdb", "logSpace", "capacity"],
    },
  },
  {
    id: "memory-temp",
    label: "Memory / temp pressure",
    mark: "MEM",
    description: "Inspect cache pressure, work areas, spills, temporary storage, grants and connection-driven memory demand.",
    verify: "Calculate peak concurrent demand and host headroom before changing global or per-session memory settings.",
    checks: {
      oracle: ["environment", "sessionPressure", "systemMetrics", "tempUsage", "pgaHealth", "sgaHealth", "libraryCache", "topSql"],
      postgres: ["environment", "activity", "database", "statements", "prepared", "settings"],
      mongodb: ["environment", "server", "connections", "admissions", "wiredTiger", "checkpoints", "database"],
      mysql: ["environment", "connections", "bufferPool", "tempAndSorts", "memory", "topDigests", "settings"],
      mariadb: ["environment", "connections", "bufferPool", "tempAndSorts", "memory", "topDigests", "settings"],
      sqlserver: ["environment", "connections", "schedulers", "memory", "memoryClerks", "topQueries", "tempdb"],
    },
  },
  {
    id: "replication-ha",
    label: "Replication / HA health",
    mark: "HA",
    description: "Correlate role, transport/apply state, lag, retained log capacity, replica errors and topology context.",
    verify: "Validate topology ownership, recovery objectives and application routing before any failover, resync or log-retention change.",
    checks: {
      oracle: ["environment", "capabilities", "redoStats", "racCache", "alertErrors"],
      postgres: ["environment", "replication", "replicationSlots", "wal", "archiver", "settings"],
      mongodb: ["environment", "replication", "oplog", "transactions", "sharding", "diagnosticLog"],
      mysql: ["environment", "replication", "errors", "settings"],
      mariadb: ["environment", "replication", "errors", "settings"],
      sqlserver: ["environment", "hadr", "logSpace", "waitProfile"],
    },
  },
  {
    id: "capacity-maintenance",
    label: "Capacity / maintenance risk",
    mark: "CAP",
    description: "Find space pressure, vacuum/statistics debt, index health, log growth, long maintenance and approaching safety limits.",
    verify: "Confirm growth rate, retention requirements, maintenance ownership and rollback space before scheduling corrective work.",
    checks: {
      oracle: ["environment", "segmentPressure", "tempUsage", "undoHealth", "redoStats", "statsHealth", "longOps", "alertErrors"],
      postgres: ["environment", "database", "tables", "indexes", "invalidIndexes", "progress", "longTransactions", "freeze", "archiver", "capabilities"],
      mongodb: ["environment", "database", "collections", "wiredTiger", "checkpoints", "oplog", "indexes"],
      mysql: ["environment", "tables", "indexSignals", "bufferPool", "tempAndSorts", "errors", "settings"],
      mariadb: ["environment", "tables", "indexSignals", "bufferPool", "tempAndSorts", "errors", "settings"],
      sqlserver: ["environment", "capacity", "logSpace", "tempdb", "indexUsage", "statistics", "hadr"],
    },
  },
  {
    id: "reliability",
    label: "Errors / reliability",
    mark: "ERR",
    description: "Correlate database errors, failed instrumentation, transaction failures, replica errors and evidence blind spots.",
    verify: "Match database evidence to application, host and platform logs using the same time window before declaring root cause.",
    checks: {
      oracle: ["environment", "capabilities", "liveActivity", "undoHealth", "redoStats", "statsHealth", "alertErrors"],
      postgres: ["environment", "database", "invalidIndexes", "longTransactions", "replication", "replicationSlots", "archiver", "capabilities"],
      mongodb: ["environment", "server", "transactions", "replication", "sharding", "diagnosticLog"],
      mysql: ["environment", "activity", "replication", "errors", "settings"],
      mariadb: ["environment", "activity", "replication", "errors", "settings"],
      sqlserver: ["environment", "activity", "queryStore", "logSpace", "hadr", "capacity"],
    },
  },
]);

function engineDefinition(engine) {
  const definition = engineDefinitions[String(engine || "").toLowerCase()];
  if (!definition) throw new Error("Advanced SQL Diagnostics supports Oracle, PostgreSQL, MongoDB, MySQL, MariaDB, and SQL Server");
  return definition;
}

export function diagnosticStudioCatalog() {
  return {
    engines: Object.fromEntries(Object.entries(engineDefinitions).map(([id, value]) => [id, { ...value }])),
    playbooks: diagnosticPlaybooks.map((playbook) => ({
      id: playbook.id,
      label: playbook.label,
      mark: playbook.mark,
      description: playbook.description,
      verify: playbook.verify,
      engineCounts: Object.fromEntries(Object.entries(playbook.checks).map(([engine, checks]) => [engine, checks.length])),
    })),
    safety: "Fixed read-only evidence only. DBridge does not kill sessions, enable profilers or traces, force plans, create indexes, change configuration, or modify replication state.",
  };
}

export function resolveDiagnosticPlaybook(engine, playbookId, availableCatalog) {
  const id = String(engine || "").toLowerCase();
  engineDefinition(id);
  const playbook = diagnosticPlaybooks.find((item) => item.id === playbookId);
  if (!playbook) throw new Error("Select a supported SQL diagnostic playbook");
  const available = new Map((Array.isArray(availableCatalog) ? availableCatalog : []).map((item) => [item.id, item]));
  const selected = playbook.checks[id].filter((checkId) => available.has(checkId)).map((checkId) => available.get(checkId));
  if (!selected.length) throw new Error(`No ${engineDefinitions[id].label} checks are available for this playbook`);
  return { playbook, selected };
}

function severityRank(value) {
  return ({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 })[String(value || "INFO").toUpperCase()] ?? 0;
}

export function buildDiagnosticIncidentReport({ engine, playbookId, results, analysis, identifier = "", collectedAt = new Date().toISOString(), packScope = "core" }) {
  const id = String(engine || "").toLowerCase();
  const engineInfo = engineDefinition(id);
  const playbook = diagnosticPlaybooks.find((item) => item.id === playbookId);
  if (!playbook) throw new Error("Select a supported SQL diagnostic playbook");
  const evidence = Array.isArray(results) ? results : [];
  const findings = Array.isArray(analysis?.findings) ? [...analysis.findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity)) : [];
  const completed = evidence.filter((item) => item.ok).length;
  const skipped = evidence.filter((item) => item.skipped).length;
  const failed = evidence.filter((item) => item.ok === false && !item.skipped).length;
  const total = evidence.length;
  const coverage = total ? Math.round((completed / total) * 100) : 0;
  const highest = findings[0]?.severity ? String(findings[0].severity).toUpperCase() : failed ? "MEDIUM" : "INFO";
  const priority = highest === "CRITICAL" ? "P1" : highest === "HIGH" ? "P2" : highest === "MEDIUM" ? "P3" : "MONITOR";
  const evidenceGaps = evidence.filter((item) => item.skipped || item.ok === false).map((item) => ({
    id: item.id,
    label: item.label || item.id,
    status: item.skipped ? "UNAVAILABLE" : "FAILED",
    reason: item.error || "The evidence query did not complete",
  }));
  const phases = [...new Set(evidence.map((item) => item.phase || "EVIDENCE"))].map((phase) => {
    const phaseRows = evidence.filter((item) => (item.phase || "EVIDENCE") === phase);
    return { phase, completed: phaseRows.filter((item) => item.ok).length, total: phaseRows.length };
  });
  const actionPlan = findings.slice(0, 5).map((item, index) => ({
    order: index + 1,
    severity: String(item.severity || "INFO").toUpperCase(),
    title: item.title || item.finding || "Review diagnostic evidence",
    verify: item.verify || item.evidence || "Confirm the signal against the active incident window.",
    action: item.action || item.recommendation || item.guidance || playbook.verify,
  }));
  if (!actionPlan.length) actionPlan.push({ order: 1, severity: "INFO", title: "No ranked incident signal was detected", verify: playbook.verify, action: "Capture a second interval and correlate database evidence with host and application telemetry." });
  if (evidenceGaps.length) actionPlan.push({ order: actionPlan.length + 1, severity: "MEDIUM", title: "Close diagnostic evidence gaps", verify: `${evidenceGaps.length} check(s) were unavailable or failed.`, action: "Review privileges, instrumentation state, database version, selected collection, and Oracle pack scope; never interpret unavailable evidence as healthy." });
  return {
    ok: true,
    advancedDiagnostics: true,
    engine: id,
    identifier,
    packScope: id === "oracle" ? packScope : undefined,
    collectedAt,
    playbook: { id: playbook.id, label: playbook.label, mark: playbook.mark, description: playbook.description, verify: playbook.verify },
    incident: {
      priority,
      highestSeverity: highest,
      coverage,
      completed,
      skipped,
      failed,
      total,
      findings: findings.length,
      summary: `${engineInfo.label} ${playbook.label.toLowerCase()} diagnostic completed with ${coverage}% evidence coverage.`,
      phases,
      evidenceGaps,
      actionPlan,
    },
    safety: "Read-only evidence collection completed. Recommendations are verification-first and require normal change control.",
    officialReference: engineInfo.reference,
    results: evidence,
    analysis: { ...(analysis || {}), findings },
  };
}
