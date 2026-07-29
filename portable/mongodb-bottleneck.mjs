export const mongodbBottleneckCatalog = [
  { id: "environment", label: "Topology & capabilities", phase: "Context", guidance: "Version, role, topology and storage engine determine which evidence is meaningful." },
  { id: "server", label: "Server workload counters", phase: "Workload", guidance: "Cumulative operation, latency, network and assertion counters need interval deltas for rates." },
  { id: "currentOps", label: "Live operations", phase: "Workload", guidance: "Long operations, lock waits, flow-control waits, collection scans and query comments identify live pressure." },
  { id: "locks", label: "Lock acquisition pressure", phase: "Concurrency", guidance: "Use acquisition and wait deltas with active blockers; lifetime totals alone are not a diagnosis." },
  { id: "connections", label: "Connections & establishment", phase: "Concurrency", guidance: "Rejected connections, churn and sustained establishment queues can create application latency." },
  { id: "admissions", label: "Admission & execution queues", phase: "Concurrency", guidance: "Sustained queued operations are stronger evidence than zero available tickets on MongoDB 7.0+." },
  { id: "wiredTiger", label: "WiredTiger cache & eviction", phase: "Storage", guidance: "Correlate cache, dirty bytes, disk reads, application eviction and latency; high cache fill alone is normal." },
  { id: "checkpoints", label: "Checkpoint & journal pressure", phase: "Storage", guidance: "Checkpoint duration and dirty-byte growth can explain write-latency spikes." },
  { id: "replication", label: "Replica health & lag", phase: "Replication", guidance: "Separate network, storage, apply, sync-source and intentionally delayed-member lag." },
  { id: "oplog", label: "Oplog retention window", phase: "Replication", guidance: "Compare lag and recovery time with the available oplog window; shrinking headroom increases resync risk." },
  { id: "transactions", label: "Transactions & flow control", phase: "Concurrency", guidance: "Old or idle transactions can retain locks and cache history; flow control often points to replica lag." },
  { id: "database", label: "Database footprint", phase: "Storage", guidance: "Data, storage, index and free-space proportions provide context, not an automatic resize decision." },
  { id: "collections", label: "Largest collection inventory", phase: "Storage", guidance: "A bounded collection sample identifies concentrated data and index cost without scanning the whole estate." },
  { id: "profiler", label: "Existing profiler evidence", phase: "Queries", guidance: "Reads existing system.profile evidence only. DBridge never enables or changes profiling." },
  { id: "queryStats", label: "Query-shape statistics", phase: "Queries", guidance: "$queryStats is capability- and tier-dependent with an unstable output format; it fails independently." },
  { id: "indexes", label: "Index usage for collection", phase: "Queries", guidance: "Node-local counters reset on restart or index recreation. Zero use is a review signal, never proof to drop.", requiresCollection: true },
  { id: "planCache", label: "Plan-cache stability", phase: "Queries", guidance: "Inactive or oversized entries can indicate replanning pressure. DBridge never clears the cache.", requiresCollection: true },
  { id: "sharding", label: "Shard & balancer state", phase: "Sharding", guidance: "Look for scatter-gather, imbalance, migrations, orphans and hot shards before changing a shard key." },
  { id: "diagnosticLog", label: "Remote diagnostic log buffer", phase: "Evidence", guidance: "Reads the server RAM log buffer with getLog; the most recent 1,024 entries are not the full mongod log file." },
];

export const mongodbDocs = {
  currentOps: "https://www.mongodb.com/docs/manual/reference/operator/aggregation/currentop/",
  serverStatus: "https://www.mongodb.com/docs/manual/reference/command/serverstatus/",
  explain: "https://www.mongodb.com/docs/manual/reference/explain-results/",
  profiler: "https://www.mongodb.com/docs/manual/reference/database-profiler/",
  queryStats: "https://www.mongodb.com/docs/manual/reference/operator/aggregation/querystats/",
  indexes: "https://www.mongodb.com/docs/manual/reference/operator/aggregation/indexstats/",
  replication: "https://www.mongodb.com/docs/manual/troubleshooting/replication-lag/",
  sharding: "https://www.mongodb.com/docs/manual/core/sharding-troubleshooting-shard-keys/",
  logs: "https://www.mongodb.com/docs/manual/reference/command/getlog/",
};

const severityWeight = { CRITICAL: 100, HIGH: 72, MEDIUM: 42, INFO: 12 };
const areas = ["Queries", "Concurrency", "Cache & I/O", "Replication", "Sharding", "Reliability"];

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function object(value) {
  return value && typeof value === "object" ? value : {};
}

function rowsFor(map, id) {
  const result = map.get(id);
  return result?.ok && Array.isArray(result.rows) ? result.rows : [];
}

function firstFor(map, id) {
  return rowsFor(map, id)[0] || {};
}

function nested(source, ...paths) {
  for (const path of paths) {
    let value = source;
    for (const key of path.split(".")) value = object(value)[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function formatBytes(bytes) {
  const value = number(bytes);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function finding(severity, area, title, cause, evidence, impact, verify, action, doc) {
  return { severity, area, title, cause, evidence, impact, verify, action, doc };
}

function maxOperationSeconds(item) {
  return number(item.secs_running ?? item.secsRunning ?? number(item.microsecs_running) / 1e6);
}

function operationCommand(item) {
  return object(item.command);
}

function examinedRatio(item) {
  const command = operationCommand(item);
  const examined = number(item.docsExamined ?? item.totalDocsExamined ?? command.docsExamined);
  const returned = number(item.nreturned ?? item.nReturned ?? command.nreturned);
  return { examined, returned, ratio: examined / Math.max(returned, 1) };
}

function summarizeQueryStats(rows) {
  let totalMicros = 0;
  let executions = 0;
  let docsExamined = 0;
  let docsReturned = 0;
  let maximumMicros = 0;
  for (const row of rows) {
    const metrics = object(row.metrics || row);
    const exec = number(nested(metrics, "execCount", "executionCount", "count"));
    const duration = number(nested(metrics, "totalExecMicros.sum", "totalExecMicros", "durationMicros.sum"));
    totalMicros += duration;
    executions += exec;
    docsExamined += number(nested(metrics, "docsExamined.sum", "docsExamined"));
    docsReturned += number(nested(metrics, "docsReturned.sum", "docsReturned"));
    maximumMicros = Math.max(maximumMicros, number(nested(metrics, "totalExecMicros.max", "durationMicros.max")));
  }
  return {
    executions,
    totalMicros,
    averageMs: executions ? totalMicros / executions / 1000 : 0,
    maximumMs: maximumMicros / 1000,
    examinedRatio: docsExamined / Math.max(docsReturned, 1),
  };
}

export function analyzeMongoBottlenecks(checks = [], focus = {}) {
  const map = new Map(checks.map((item) => [item.id, item]));
  const findings = [];
  const currentOps = rowsFor(map, "currentOps");
  const server = firstFor(map, "server");
  const connections = firstFor(map, "connections");
  const admissions = firstFor(map, "admissions");
  const cache = firstFor(map, "wiredTiger");
  const checkpoints = firstFor(map, "checkpoints");
  const replication = firstFor(map, "replication");
  const oplog = firstFor(map, "oplog");
  const transactions = firstFor(map, "transactions");
  const profileRows = rowsFor(map, "profiler");
  const queryStatsRows = rowsFor(map, "queryStats");
  const indexRows = rowsFor(map, "indexes");
  const planCacheRows = rowsFor(map, "planCache");
  const sharding = firstFor(map, "sharding");
  const diagnosticLog = firstFor(map, "diagnosticLog");

  const longOps = currentOps.filter((item) => maxOperationSeconds(item) >= 30);
  const veryLongOps = currentOps.filter((item) => maxOperationSeconds(item) >= 300);
  const lockWaiters = currentOps.filter((item) => item.waitingForLock === true);
  const flowWaiters = currentOps.filter((item) => item.waitingForFlowControl === true);
  const collectionScans = currentOps.filter((item) => String(item.planSummary || "").toUpperCase().includes("COLLSCAN"));
  const poorTargeting = currentOps.filter((item) => examinedRatio(item).examined >= 1000 && examinedRatio(item).ratio >= 50);

  if (longOps.length) findings.push(finding(
    veryLongOps.length ? "CRITICAL" : "HIGH", "Queries", `${longOps.length} long-running operation${longOps.length === 1 ? "" : "s"} active`,
    "A slow query, blocking wait, large aggregation, transaction, or remote client is retaining resources.",
    `Longest active operation ${Math.max(...longOps.map(maxOperationSeconds)).toFixed(1)}s; ${lockWaiters.length} waiting for lock; ${flowWaiters.length} waiting for flow control.`,
    "Application latency and resource retention can compound while the operation remains active.",
    "Match namespace, appName, comment, planSummary and opid; then inspect queryPlanner with a short maxTimeMS.",
    "Optimize the confirmed query shape or blocker through normal change control. Do not kill an operation from this read-only view.",
    mongodbDocs.currentOps,
  ));
  if (lockWaiters.length) findings.push(finding(
    "HIGH", "Concurrency", "Live lock waiters detected",
    "Another operation or transaction owns a conflicting lock.",
    `${lockWaiters.length} active operation${lockWaiters.length === 1 ? "" : "s"} report waitingForLock.`,
    "Queued application work can exceed timeouts and increase connection demand.",
    "Build the blocker/waiter chain from opid, locks, lockStats, transaction age, client and namespace.",
    "Shorten or fix the blocking transaction first; validate application transaction boundaries.",
    mongodbDocs.currentOps,
  ));
  if (collectionScans.length || poorTargeting.length) findings.push(finding(
    collectionScans.length ? "HIGH" : "MEDIUM", "Queries", "Inefficient live query targeting",
    "A missing/poorly ordered index, low-selectivity predicate, unsupported sort, or scatter-gather query may scan excess documents.",
    `${collectionScans.length} COLLSCAN operation(s); ${poorTargeting.length} operation(s) examined at least 50 documents per result.`,
    "Excess CPU, cache churn and disk reads increase latency for unrelated work.",
    "Use explain queryPlanner first; compare bounds, sort stages and shard targeting. executionStats executes the query and needs explicit approval.",
    "Test ESR-aligned compound index, predicate/projection changes, or shard-key inclusion in a non-production workload before deployment.",
    mongodbDocs.explain,
  ));

  const currentConnections = number(connections.current);
  const availableConnections = number(connections.available);
  const rejectedConnections = number(connections.rejected);
  const connectionUse = currentConnections + availableConnections ? currentConnections / (currentConnections + availableConnections) : 0;
  const establishmentQueued = number(nested(connections, "establishmentRateLimit.numInEstablishmentQueue", "establishmentRateLimit.numQueued"));
  if (rejectedConnections > 0 || establishmentQueued > 0 || connectionUse >= 0.9) findings.push(finding(
    rejectedConnections > 0 || establishmentQueued > 0 ? "HIGH" : "MEDIUM", "Concurrency", "Connection capacity or establishment pressure",
    "Pool leakage, connection churn, an undersized pool, admission control, or slow authentication is limiting work.",
    `${currentConnections} current, ${availableConnections} available, ${rejectedConnections} lifetime rejected, ${establishmentQueued} establishing/queued.`,
    "New requests may wait or fail before query execution begins.",
    "Capture a second snapshot: rising current suggests leakage; high totalCreated delta with stable workload suggests churn.",
    "Fix client pooling and connection lifecycle before changing server connection limits.",
    mongodbDocs.serverStatus,
  ));

  const queuedReads = number(nested(admissions, "globalLock.currentQueue.readers", "globalLock.currentQueue.read"));
  const queuedWrites = number(nested(admissions, "globalLock.currentQueue.writers", "globalLock.currentQueue.write"));
  const queuedTotal = number(nested(admissions, "globalLock.currentQueue.total")) || queuedReads + queuedWrites;
  const executionQueue = number(nested(admissions, "queues.execution.total", "queues.execution.out", "queues.total"));
  if (queuedTotal > 0 || executionQueue > 0) findings.push(finding(
    queuedTotal + executionQueue >= 10 ? "HIGH" : "MEDIUM", "Concurrency", "Sustained work queue visible in this snapshot",
    "Locking, storage latency, CPU saturation or admission control is delaying runnable work.",
    `${queuedTotal} global lock queue and ${executionQueue} execution/admission queue entries.`,
    "Queueing amplifies end-to-end latency even when individual query plans are reasonable.",
    "Repeat at 5–15 second intervals and correlate with active waits, disk latency, cache eviction and CPU.",
    "Remove the confirmed downstream constraint; do not treat zero available dynamic tickets alone as overload on MongoDB 7.0+.",
    mongodbDocs.serverStatus,
  ));

  const cacheMax = number(nested(cache, "maximum bytes configured", "maximumBytesConfigured"));
  const cacheBytes = number(nested(cache, "bytes currently in the cache", "bytesCurrentlyInCache"));
  const dirtyBytes = number(nested(cache, "tracked dirty bytes in the cache", "trackedDirtyBytesInTheCache"));
  const cacheFill = cacheMax ? cacheBytes / cacheMax : 0;
  const dirtyFill = cacheMax ? dirtyBytes / cacheMax : 0;
  const appEvictions = number(nested(cache,
    "application threads page read from disk to cache count",
    "application threads page write from cache to disk count",
    "application threads page read from disk to cache time (usecs)"));
  const forcedEvictions = number(nested(cache, "pages evicted by application threads", "forced eviction - pages selected count"));
  if ((cacheFill >= 0.95 && (appEvictions > 0 || forcedEvictions > 0)) || dirtyFill >= 0.2) findings.push(finding(
    dirtyFill >= 0.2 ? "HIGH" : "MEDIUM", "Cache & I/O", dirtyFill >= 0.2 ? "Dirty cache and write-path pressure" : "WiredTiger working-set pressure",
    dirtyFill >= 0.2 ? "Writes and checkpoints are not draining dirty pages fast enough." : "The active working set is forcing application threads to participate in eviction or disk reads.",
    `${(cacheFill * 100).toFixed(1)}% cache fill, ${(dirtyFill * 100).toFixed(1)}% dirty, ${appEvictions + forcedEvictions} cumulative application/forced eviction signals.`,
    "Read or write latency can rise and application threads may spend time doing storage work.",
    "Compare two snapshots and correlate eviction deltas with op latency, disk queue/latency and checkpoint duration.",
    "Reduce inefficient scans or write bursts and validate storage latency; do not automatically increase the WiredTiger cache.",
    mongodbDocs.serverStatus,
  ));

  const checkpointMs = number(nested(checkpoints,
    "transaction checkpoint most recent time (msecs)",
    "checkpoint most recent time (msecs)",
    "mostRecentTimeMillis"));
  if (checkpointMs >= 5000) findings.push(finding(
    checkpointMs >= 20000 ? "HIGH" : "MEDIUM", "Cache & I/O", "Long WiredTiger checkpoint",
    "Storage latency, dirty-page volume, write bursts, or long-running transactions may be extending checkpoints.",
    `Most recent checkpoint reported ${checkpointMs.toLocaleString()} ms.`,
    "Write latency and eviction pressure can spike around checkpoints.",
    "Align checkpoint duration with dirty bytes, journal activity, disk latency, and operation latency across two snapshots.",
    "Investigate storage and write amplification before changing checkpoint or cache configuration.",
    mongodbDocs.serverStatus,
  ));

  const members = Array.isArray(replication.members) ? replication.members : [];
  const primary = members.find((item) => item.stateStr === "PRIMARY");
  const secondaries = members.filter((item) => item.stateStr === "SECONDARY" && item.health !== 0);
  const primaryTime = primary ? Date.parse(primary.optimeDate || primary.lastAppliedWallTime || 0) : 0;
  const lagRows = secondaries.map((item) => ({
    name: item.name,
    lagSeconds: primaryTime ? Math.max(0, (primaryTime - Date.parse(item.optimeDate || item.lastAppliedWallTime || 0)) / 1000) : 0,
  }));
  const maxLag = lagRows.reduce((value, item) => Math.max(value, item.lagSeconds), 0);
  const unhealthyMembers = members.filter((item) => item.health === 0 || ["UNKNOWN", "DOWN", "RECOVERING", "ROLLBACK"].includes(item.stateStr));
  if (maxLag >= 30 || unhealthyMembers.length) findings.push(finding(
    unhealthyMembers.length ? "CRITICAL" : maxLag >= 300 ? "HIGH" : "MEDIUM", "Replication", "Replica lag or unhealthy member",
    "Network latency, secondary disk/cache pressure, slow oplog application, sync-source choice or write volume may be preventing catch-up.",
    `Maximum measured secondary lag ${maxLag.toFixed(1)}s; ${unhealthyMembers.length} unhealthy/recovering member(s).`,
    "Read freshness, failover readiness and primary flow-control latency may degrade.",
    "Compare per-member ping, sync source, disk/cache evidence and REPL slow messages; account for intentionally delayed members and idle replica sets.",
    "Correct the member-specific network, storage or apply bottleneck. Keep lag comfortably inside the oplog window.",
    mongodbDocs.replication,
  ));

  const oplogHours = number(oplog.timeDiffHours ?? oplog.windowHours);
  if (oplogHours > 0 && oplogHours < 24) findings.push(finding(
    oplogHours < 6 ? "HIGH" : "MEDIUM", "Replication", "Oplog retention window is narrow",
    "The oplog is too small for the current write rate or retention is being reduced by a write burst.",
    `${oplogHours.toFixed(1)} hours of oplog history available.`,
    "A lagged or offline secondary can fall off the oplog and require a full resync.",
    "Measure oplog GB/hour during peak load and include expected outage plus recovery/catch-up time.",
    "Review oplog sizing through normal replica-set change control; MongoDB recommends at least 24 hours as a general minimum.",
    mongodbDocs.replication,
  ));

  const flowMicros = number(nested(transactions, "flowControl.timeAcquiringMicros", "flowControl.timeAcquiringMicros.value"));
  const activeTransactions = number(nested(transactions, "transactions.currentActive", "transactions.currentOpen"));
  const abortedTransactions = number(nested(transactions, "transactions.totalAborted"));
  if (flowWaiters.length || flowMicros > 0) findings.push(finding(
    flowWaiters.length ? "HIGH" : "MEDIUM", "Replication", "Primary flow-control pressure",
    "Replica-set lag is causing the primary to delay writes to preserve the majority commit point.",
    `${flowWaiters.length} live flow-control waiter(s); ${flowMicros.toLocaleString()} cumulative acquisition microseconds.`,
    "Application write latency can increase even when the primary has spare CPU.",
    "Use interval deltas and correlate primary flow control with secondary lag, disk, cache and network metrics.",
    "Fix the lagging secondary path before changing flow-control safety.",
    mongodbDocs.replication,
  ));
  if (activeTransactions >= 20 || abortedTransactions >= 1000) findings.push(finding(
    activeTransactions >= 100 ? "HIGH" : "MEDIUM", "Concurrency", "Transaction pressure requires review",
    "Long/idle transactions, retry storms or conflicts may retain locks and WiredTiger history.",
    `${activeTransactions} active/open and ${abortedTransactions.toLocaleString()} lifetime aborted transaction signals.`,
    "Concurrency, cache eviction and write latency can deteriorate.",
    "Inspect transaction age and state in $currentOp; compare abort deltas across two snapshots.",
    "Shorten transaction scope and correct retry behavior in the application.",
    mongodbDocs.currentOps,
  ));

  const slowProfile = profileRows.filter((item) => number(item.millis) >= 100);
  const profileScans = profileRows.filter((item) => String(item.planSummary || "").toUpperCase().includes("COLLSCAN"));
  if (slowProfile.length) findings.push(finding(
    slowProfile.some((item) => number(item.millis) >= 1000) ? "HIGH" : "MEDIUM", "Queries", "Existing profiler evidence contains slow operations",
    "Slow query shapes, blocking, storage reads, planning, large responses or spills are recorded in the current profiler collection.",
    `${slowProfile.length} sampled profile operation(s) at or above 100 ms; ${profileScans.length} COLLSCAN.`,
    "Repeated shapes can dominate total workload latency.",
    "Rank by total and average time, examined/returned ratio, planning time, storage time and planSummary. Treat profiler sampling as incomplete.",
    "Tune the confirmed query shape. Do not increase profiling level or lower slowms without explicit approval and privacy review.",
    mongodbDocs.profiler,
  ));

  const querySummary = summarizeQueryStats(queryStatsRows);
  if (querySummary.executions && (querySummary.averageMs >= 100 || querySummary.examinedRatio >= 50)) findings.push(finding(
    querySummary.averageMs >= 500 ? "HIGH" : "MEDIUM", "Queries", "Expensive query shapes in $queryStats",
    "One or more shapes have high total cost, per-execution latency, variance, targeting cost or planning overhead.",
    `${querySummary.executions.toLocaleString()} executions sampled, ${querySummary.averageMs.toFixed(1)} ms average, ${querySummary.examinedRatio.toFixed(1)} examined/returned.`,
    "A repeated inefficient shape can consume more capacity than one isolated slow operation.",
    "Rank flexible metrics by total cost, average, maximum, variance and targeting; correlate the shape hash with current operations and plans.",
    "Optimize the highest-workload confirmed shape first; tolerate schema changes because $queryStats output is explicitly unstable.",
    mongodbDocs.queryStats,
  ));

  const zeroUseIndexes = indexRows.filter((item) => number(nested(item, "accesses.ops", "ops")) === 0 && String(item.name || "") !== "_id_");
  if (zeroUseIndexes.length >= 3) findings.push(finding(
    "INFO", "Queries", "Indexes with zero observed usage need evidence review",
    "Some indexes may be redundant, workload-specific, used on another node, or outside the current counter window.",
    `${zeroUseIndexes.length} non-_id indexes report zero node-local user operations for ${focus.collection || "the selected collection"}.`,
    "Unused indexes add write, cache and disk cost, but dropping required indexes is risky.",
    "Check every replica-set member and a representative business cycle; confirm restart/index recreation time.",
    "Hide and test one candidate through change control before considering removal. DBridge never drops indexes.",
    mongodbDocs.indexes,
  ));
  const inactivePlans = planCacheRows.filter((item) => item.isActive === false);
  if (inactivePlans.length >= 5) findings.push(finding(
    "MEDIUM", "Queries", "Plan-cache instability signal",
    "Changing data distribution, competing candidate plans, index changes or query-shape variation may be causing repeated trial planning.",
    `${inactivePlans.length} inactive entries among ${planCacheRows.length} sampled plan-cache entries.`,
    "Planning overhead and intermittent plan quality can increase tail latency.",
    "Correlate planCacheKey/shape hash, works, estimated size, available indexes and profiler replan evidence.",
    "Validate query settings or index changes separately. Do not clear the plan cache automatically.",
    mongodbDocs.explain,
  ));

  const shardCount = number(sharding.shardCount ?? sharding.shards?.shards?.length);
  const balancerMode = String(sharding.balancer?.mode || sharding.balancer?.inBalancerRound || sharding.balancerStatus?.mode || "");
  if (shardCount > 1 && /full|true|active/i.test(balancerMode)) findings.push(finding(
    "INFO", "Sharding", "Balancer or migration activity is visible",
    "Chunk migrations or defragmentation can add network, storage and lock work during the application incident.",
    `${shardCount} shards; balancer state ${balancerMode || "available"}.`,
    "Hot shards or migrations can produce uneven query latency.",
    "Correlate numHostsTargeted, per-shard latency, current migration operations, orphan counts and data distribution.",
    "Schedule or tune sharding changes only after confirming imbalance or shard-key targeting.",
    mongodbDocs.sharding,
  ));

  const logEntries = Array.isArray(diagnosticLog.log) ? diagnosticLog.log : [];
  const severeLogEntries = logEntries.filter((line) => /(?:"s"\s*:\s*"[EF]"|\b(?:fatal|error|assert|panic|unclean shutdown)\b)/i.test(String(line)));
  if (severeLogEntries.length) findings.push(finding(
    "HIGH", "Reliability", "Recent server log buffer contains errors",
    "MongoDB reported an error, assertion, fatal event, or unclean-shutdown signal in the in-memory diagnostic log window.",
    `${severeLogEntries.length} severe-looking entries among ${logEntries.length} buffered lines.`,
    "Reliability events can explain latency, retries, elections or storage recovery work.",
    "Open the Live Logs view, parse structured component/id/context fields, and correlate timestamps with the incident.",
    "Resolve the exact documented event. The RAM buffer is truncated and does not replace the full remote mongod.log.",
    mongodbDocs.logs,
  ));

  const ordered = findings.sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);
  const pressureMap = areas.map((area) => {
    const related = ordered.filter((item) => item.area === area);
    const score = Math.min(100, related.reduce((sum, item) => sum + severityWeight[item.severity], 0));
    return { area, score, severity: score >= 85 ? "critical" : score >= 55 ? "high" : score >= 25 ? "medium" : "low", count: related.length };
  }).sort((a, b) => b.score - a.score);
  const completed = checks.filter((item) => item.ok).length;
  const skipped = checks.filter((item) => item.skipped).length;
  const failed = checks.length - completed - skipped;
  const pressureScore = Math.min(100, Math.round(
    ordered.slice(0, 5).reduce((sum, item, index) => sum + severityWeight[item.severity] / (index + 1), 0) / 1.8,
  ));
  const dominantMode = lockWaiters.length || queuedTotal || executionQueue
    ? "Waiting / queued"
    : longOps.length || collectionScans.length || poorTargeting.length
      ? "Working inefficiently"
      : ordered.length
        ? "Resource pressure"
        : "No dominant live signal";

  return {
    total: checks.length,
    completed,
    skipped,
    failed,
    pressureScore,
    dominantMode,
    primary: ordered[0]?.title || "No dominant bottleneck detected",
    primaryEvidence: ordered[0]?.evidence || "Capture a second snapshot during the slow period to calculate rates and confirm the baseline.",
    findings: ordered,
    pressureMap,
    metrics: {
      activeOperations: currentOps.length,
      longOperations: longOps.length,
      lockWaiters: lockWaiters.length,
      connectionUsePercent: Math.round(connectionUse * 100),
      cacheFillPercent: Number((cacheFill * 100).toFixed(1)),
      dirtyCachePercent: Number((dirtyFill * 100).toFixed(1)),
      maxReplicationLagSeconds: Number(maxLag.toFixed(1)),
      oplogWindowHours: Number(oplogHours.toFixed(1)),
      queryStatsExecutions: querySummary.executions,
      logErrors: severeLogEntries.length,
    },
    safetyNote: "Read-only evidence only. Re-sample cumulative counters before tuning and require explicit approval for executionStats, profiling, killOp, cache, index, query-setting, balancer, or topology changes.",
  };
}
